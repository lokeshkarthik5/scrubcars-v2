import { describe, expect, test } from 'bun:test'
import {
  carProblems,
  DEFAULT_GARAGE_SETTINGS,
  drawRarity,
  duplicateStars,
  garageArtKey,
  ILLUSTRATION_LINE,
  garageSettings,
  garageSettingsProblems,
  GARAGE_RARITIES,
  isGarageTempKeyFor,
  isWebp,
  newlyCompletedRows,
  pickCar,
  pityCounts,
  planPull,
  pullWords,
  realCarNameIn,
  rowOf,
  rowReward,
  rowWords,
  scratchIsGarageCard,
  seriesComplete,
  type GarageRarity,
  type GarageSettings,
  type PoolCar,
} from './garage.js'
import { DEFAULT_REWARDS_SETTINGS, settingsProblems, type RewardsSettings } from './rewards.js'

/** mulberry32: a seeded stand-in for crypto's randomInt, so a distribution test is the same every run. */
function seededPick(seed: number): (max: number) => number {
  let a = seed >>> 0
  return (max: number) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max)
  }
}

const G: GarageSettings = { ...DEFAULT_GARAGE_SETTINGS, enabled: true }

/** The 40-card shape: 20 Common, 12 Rare, 6 Epic, 2 Legendary. */
function series(): PoolCar[] {
  const rarities: GarageRarity[] = [
    ...Array<GarageRarity>(20).fill('common'),
    ...Array<GarageRarity>(12).fill('rare'),
    ...Array<GarageRarity>(6).fill('epic'),
    ...Array<GarageRarity>(2).fill('legendary'),
  ]
  return rarities.map((rarity, i) => ({ id: `car-${i + 1}`, number: i + 1, rarity }))
}

describe('the odds', () => {
  test('the owner’s numbers by default, and off until the team turns it on', () => {
    expect(DEFAULT_GARAGE_SETTINGS.rarityWeights).toEqual({ common: 55, rare: 30, epic: 12, legendary: 3 })
    expect(DEFAULT_GARAGE_SETTINGS.enabled).toBe(false)
    expect(DEFAULT_GARAGE_SETTINGS.pityRare).toBe(10)
    expect(DEFAULT_GARAGE_SETTINGS.pityLegendary).toBe(60)
    expect(DEFAULT_GARAGE_SETTINGS.duplicatesPerStar).toBe(3)
    expect(DEFAULT_GARAGE_SETTINGS.rowVoucher).toBe(100)
    expect(DEFAULT_GARAGE_SETTINGS.unownedBiasPercent).toBe(60)
  })

  test('100,000 seeded draws land on the odds (no pity in the way)', () => {
    const pick = seededPick(57)
    const counts: Record<GarageRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
    const n = 100_000
    for (let i = 0; i < n; i += 1) counts[drawRarity({ sinceRare: 0, sinceLegendary: 0 }, G, pick).rarity] += 1
    for (const rarity of GARAGE_RARITIES) {
      expect(Math.abs((counts[rarity] / n) * 100 - G.rarityWeights[rarity])).toBeLessThan(0.6)
    }
  })

  test('a rarity at 0 is never drawn', () => {
    const pick = seededPick(3)
    const g = { ...G, rarityWeights: { common: 70, rare: 30, epic: 0, legendary: 0 } }
    for (let i = 0; i < 5000; i += 1) expect(['common', 'rare']).toContain(drawRarity({ sinceRare: 0, sinceLegendary: 0 }, g, pick).rarity)
  })
})

describe('pity', () => {
  test('counts pulls since the last Rare-or-better and the last Legendary, newest first', () => {
    expect(pityCounts([])).toEqual({ sinceRare: 0, sinceLegendary: 0 })
    expect(pityCounts(['common', 'common', 'epic', 'common'])).toEqual({ sinceRare: 2, sinceLegendary: 4 })
    expect(pityCounts(['legendary', 'common'])).toEqual({ sinceRare: 0, sinceLegendary: 0 })
  })

  test('the 10th pull without a Rare or better is one', () => {
    // A pick that always lands on Common's slice.
    const alwaysFirst = () => 0
    expect(drawRarity({ sinceRare: 8, sinceLegendary: 8 }, G, alwaysFirst)).toEqual({ rarity: 'common', forced: null })
    const tenth = drawRarity({ sinceRare: 9, sinceLegendary: 9 }, G, alwaysFirst)
    expect(tenth.forced).toBe('pity_rare')
    expect(tenth.rarity).toBe('rare')
  })

  test('the forced pull still follows Rare, Epic and Legendary’s own odds', () => {
    const pick = seededPick(11)
    const counts: Record<GarageRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
    for (let i = 0; i < 45_000; i += 1) counts[drawRarity({ sinceRare: 9, sinceLegendary: 0 }, G, pick).rarity] += 1
    expect(counts.common).toBe(0)
    // 30 : 12 : 3 of 45.
    expect(Math.abs(counts.rare / 45_000 - 30 / 45)).toBeLessThan(0.01)
    expect(Math.abs(counts.legendary / 45_000 - 3 / 45)).toBeLessThan(0.01)
  })

  test('the 60th pull without a Legendary is one, whatever the roll', () => {
    expect(drawRarity({ sinceRare: 0, sinceLegendary: 59 }, G, () => 0)).toEqual({ rarity: 'legendary', forced: 'pity_legendary' })
    expect(drawRarity({ sinceRare: 0, sinceLegendary: 58 }, G, () => 0).forced).toBeNull()
  })

  test('over a long run nobody goes 10 pulls without a Rare, or 60 without a Legendary', () => {
    const pick = seededPick(2026)
    const cars = series()
    const history: GarageRarity[] = []
    const owned = new Set<string>()
    for (let i = 0; i < 3000; i += 1) {
      const plan = planPull({ cars, owned, history }, G, pick)!
      history.unshift(plan.rarity)
      owned.add(plan.car.id)
      const { sinceRare, sinceLegendary } = pityCounts(history)
      expect(sinceRare).toBeLessThan(10)
      expect(sinceLegendary).toBeLessThan(60)
    }
  })
})

describe('the car within a rarity', () => {
  const cars = series()
  const commons = cars.filter((c) => c.rarity === 'common')

  test('with the bias at 100, always one the customer does not have (when there is one)', () => {
    const owned = new Set(commons.slice(0, 19).map((c) => c.id))
    const pick = seededPick(5)
    for (let i = 0; i < 500; i += 1) expect(pickCar(cars, 'common', owned, { unownedBiasPercent: 100 }, pick)!.car.id).toBe('car-20')
  })

  test('at 60%, a missing car comes up far more often than chance alone would give it', () => {
    const owned = new Set(commons.slice(0, 19).map((c) => c.id))
    const pick = seededPick(8)
    let fresh = 0
    const n = 20_000
    for (let i = 0; i < n; i += 1) if (pickCar(cars, 'common', owned, { unownedBiasPercent: 60 }, pick)!.car.id === 'car-20') fresh += 1
    // 60% + 40% × 1/20 = 62%.
    expect(Math.abs(fresh / n - 0.62)).toBeLessThan(0.015)
  })

  test('at 0%, every car of the rarity is equally likely', () => {
    const pick = seededPick(9)
    const counts = new Map<string, number>()
    for (let i = 0; i < 40_000; i += 1) {
      const id = pickCar(cars, 'legendary', new Set(['car-39']), { unownedBiasPercent: 0 }, pick)!.car.id
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(Math.abs((counts.get('car-39') ?? 0) / 40_000 - 0.5)).toBeLessThan(0.015)
  })

  test('a rarity with no car switched on gives way to the nearest (lower first)', () => {
    const noEpic = cars.filter((c) => c.rarity !== 'epic')
    expect(pickCar(noEpic, 'epic', new Set(), G, () => 0)!.rarity).toBe('rare')
    expect(pickCar(cars.filter((c) => c.rarity === 'legendary'), 'common', new Set(), G, () => 0)!.rarity).toBe('legendary')
    expect(pickCar([], 'common', new Set(), G, () => 0)).toBeNull()
  })

  test('a duplicate is a car already owned', () => {
    const owned = new Set(cars.map((c) => c.id))
    const plan = planPull({ cars, owned, history: [] }, G, seededPick(1))!
    expect(plan.duplicate).toBe(true)
  })
})

describe('duplicates into stamps', () => {
  test('every 3 duplicates make one bonus stamp; the rest wait', () => {
    expect(duplicateStars(0, 3)).toEqual({ stamps: 0, used: 0 })
    expect(duplicateStars(2, 3)).toEqual({ stamps: 0, used: 0 })
    expect(duplicateStars(3, 3)).toEqual({ stamps: 1, used: 3 })
    expect(duplicateStars(7, 3)).toEqual({ stamps: 2, used: 6 })
    expect(duplicateStars(4, 1)).toEqual({ stamps: 4, used: 4 })
  })
})

describe('rows and the series', () => {
  const numbers = Array.from({ length: 40 }, (_, i) => i + 1)

  test('rows of five by number', () => {
    expect([1, 5, 6, 10, 36, 40].map(rowOf)).toEqual([1, 1, 2, 2, 8, 8])
  })

  test('a row is finished once: a rewarded row is never rewarded again', () => {
    const owned = new Set([1, 2, 3, 4, 5, 6, 7])
    expect(newlyCompletedRows({ seriesNumbers: numbers, ownedNumbers: owned, rewardedRows: new Set() })).toEqual([1])
    expect(newlyCompletedRows({ seriesNumbers: numbers, ownedNumbers: owned, rewardedRows: new Set([1]) })).toEqual([])
    expect(newlyCompletedRows({ seriesNumbers: numbers, ownedNumbers: new Set([1, 2, 3, 4]), rewardedRows: new Set() })).toEqual([])
  })

  test('a car switched off does not hold its row back', () => {
    const withoutThree = numbers.filter((n) => n !== 3)
    expect(newlyCompletedRows({ seriesNumbers: withoutThree, ownedNumbers: new Set([1, 2, 4, 5]), rewardedRows: new Set() })).toEqual([1])
  })

  test('the series is finished with every car', () => {
    expect(seriesComplete(numbers, new Set(numbers))).toBe(true)
    expect(seriesComplete(numbers, new Set(numbers.slice(1)))).toBe(false)
    expect(seriesComplete([], new Set())).toBe(false)
  })

  test('a row’s ₹100 counts toward the month’s budget; past it, bonus stamps instead', () => {
    expect(rowReward({ issuedThisMonthPaise: 0, capPaise: 1_000_000 }, G)).toEqual({ kind: 'voucher', amount: 100 })
    expect(rowReward({ issuedThisMonthPaise: 990_000, capPaise: 1_000_000 }, G)).toEqual({ kind: 'voucher', amount: 100 })
    expect(rowReward({ issuedThisMonthPaise: 990_001, capPaise: 1_000_000 }, G)).toEqual({ kind: 'stamps', stamps: 1 })
    expect(rowReward({ issuedThisMonthPaise: 0, capPaise: 0 }, { rowVoucher: 100, rowFallbackStamps: 2 })).toEqual({ kind: 'stamps', stamps: 2 })
  })
})

describe('the scratch card’s Garage card', () => {
  test('drawn with its own chance; 0 never', () => {
    expect(scratchIsGarageCard({ scratchCardWeight: 0 }, () => 0)).toBe(false)
    expect(scratchIsGarageCard({ scratchCardWeight: 3 }, () => 2)).toBe(true)
    expect(scratchIsGarageCard({ scratchCardWeight: 3 }, () => 3)).toBe(false)
  })
})

describe('settings', () => {
  test('a version saved before 0057 reads as the defaults', () => {
    expect(garageSettings(DEFAULT_REWARDS_SETTINGS)).toEqual(DEFAULT_GARAGE_SETTINGS)
    expect(garageSettings({ garage: { enabled: true, rarityWeights: { common: 50, rare: 35, epic: 12, legendary: 3 } } })).toMatchObject({
      enabled: true,
      pityRare: 10,
      rarityWeights: { common: 50, rare: 35 },
    })
  })

  test('the defaults pass; every rule is checked', () => {
    expect(garageSettingsProblems(DEFAULT_GARAGE_SETTINGS)).toEqual([])
    const bad = garageSettingsProblems({
      ...DEFAULT_GARAGE_SETTINGS,
      rarityWeights: { common: 50, rare: 30, epic: 12, legendary: 3 },
      pityRare: 70,
      pityLegendary: 60,
      duplicatesPerStar: 0,
      rowVoucher: 5000,
      scratchCardWeight: 80,
      badgeBonusCards: 9,
    })
    expect(bad.join(' | ')).toContain('add up to 100 (they add up to 95)')
    expect(bad.join(' | ')).toContain('Legendary pity must be more pulls')
    expect(bad.join(' | ')).toContain('duplicates per bonus stamp')
    expect(bad.join(' | ')).toContain('row reward must')
    expect(bad.join(' | ')).toContain('scratch card')
    expect(bad.join(' | ')).toContain('cards per badge')
  })

  test('the rewards settings check the Garage only when it is there', () => {
    expect(settingsProblems(DEFAULT_REWARDS_SETTINGS)).toEqual([])
    const withGarage: RewardsSettings = { ...DEFAULT_REWARDS_SETTINGS, garage: { rarityWeights: { common: 10, rare: 10, epic: 10, legendary: 10 } } }
    expect(settingsProblems(withGarage).some((p) => p.startsWith('Garage: the odds'))).toBe(true)
  })
})

describe('fictional cars only', () => {
  test('real makes and models are caught, whole words only', () => {
    expect(realCarNameIn('Crimson Phantom')).toBe('phantom')
    expect(realCarNameIn('Midnight Volt')).toBe('volt')
    expect(realCarNameIn('Marina Comet')).toBe('comet')
    expect(realCarNameIn('A GT-R killer')).toBe('gt-r')
    expect(realCarNameIn('The 911 of the coast')).toBe('911')
    expect(realCarNameIn('Huracán Blue')).toBe('huracán')
    expect(realCarNameIn('Lamborghini Orange')).toBe('lamborghini')
    expect(realCarNameIn('Monsoon GT')).toBeNull()
    expect(realCarNameIn('Granite Rampart')).toBeNull()
    expect(realCarNameIn('Tea leaves')).toBeNull()
  })

  test('a card edit is held to the copy rules, the lengths, a pool photo id, the deny-list, and no made-up figures', () => {
    const ok = {
      name: 'Monsoon GT',
      rarity: 'rare' as const,
      photoId: 'red-rear',
      colour: 'Red',
      setting: 'Studio',
      lore: 'Loves the first rain of June more than anyone in the city.',
      enabled: true,
    }
    expect(carProblems(ok)).toEqual([])
    expect(carProblems({ ...ok, name: 'Ferrari Rosso' }).join()).toContain('"ferrari" is a real car name')
    expect(carProblems({ ...ok, lore: 'The cheapest supercar in town, guaranteed.' }).join()).toContain("Detlio doesn't say")
    expect(carProblems({ ...ok, photoId: 'https://x.test/a.webp' }).join()).toContain('Pick a photo')
    expect(carProblems({ ...ok, name: 'X' }).join()).toContain('The name is 2–28 characters')
    // A recognisable car with invented numbers would mislead.
    expect(carProblems({ ...ok, lore: 'Does 0–100 in 2.7 s and tops out at 342 km/h.' }).join()).toContain('No speeds, power or times')
    expect(carProblems({ ...ok, setting: '800 hp' }).join()).toContain('No speeds, power or times')
  })
})

describe('words', () => {
  test('the push names the car and its rarity, never anything about the customer', () => {
    expect(pullWords({ name: 'Monsoon GT', rarity: 'rare' }, false)).toEqual({ title: 'New car for your Garage: Monsoon GT (Rare)', body: 'Tap to see it in your Garage.' })
    expect(pullWords({ name: 'Monsoon GT', rarity: 'rare' }, true).body).toContain('three of those make a bonus Shine Card stamp')
    expect(rowWords(3, { kind: 'voucher', amount: 100 })).toEqual({ title: 'Row 3 complete — ₹100 off', body: '₹100 off your next booking is ready.' })
    expect(rowWords(3, { kind: 'stamps', stamps: 1 }).body).toBe('A bonus stamp is on your Shine Card.')
  })
})

describe('art', () => {
  test('every card is shown with the illustration line', () => {
    expect(ILLUSTRATION_LINE).toBe('Cars shown for illustration only. Not affiliated with any car maker.')
  })

  test('keys: an uploaded picture under garage/series-<n>/, waiting uploads under ai-temp/garage/<car>/', () => {
    expect(garageArtKey(1, 7)).toBe('garage/series-1/07.webp')
    const car = 'e2e00000-0000-4000-8000-000000003701'
    expect(isGarageTempKeyFor(`ai-temp/garage/${car}/upload-e2e00000-0000-4000-8000-000000003799.webp`, car)).toBe(true)
    expect(isGarageTempKeyFor(`ai-temp/garage/${car}/e2e00000-0000-4000-8000-000000003799.webp`, car)).toBe(false)
    expect(isGarageTempKeyFor(`ai-temp/garage/other/upload-e2e00000-0000-4000-8000-000000003799.webp`, car)).toBe(false)
    expect(isGarageTempKeyFor(`ai-temp/garage/${car}/../x.webp`, car)).toBe(false)
  })

  test('uploads must be WebP', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0])
    expect(isWebp(webp)).toBe(true)
    expect(isWebp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
  })
})
