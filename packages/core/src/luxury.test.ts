import { describe, expect, test } from 'bun:test'
import {
  LUXURY_BRANDS,
  LUXURY_MAKES,
  LUXURY_STANDARDS,
  SPECIALIST_ROW_MIN,
  canSendApplication,
  garageLuxuryScreen,
  handlesBrands,
  luxuryMakeOf,
  makeWords,
  specialistRow,
} from './luxury'

describe('luxuryMakeOf: a make typed freely', () => {
  test.each([
    ['BMW', 'BMW'],
    ['bmw', 'BMW'],
    ['  B.M.W. ', 'BMW'],
    ['BMW 320d', 'BMW'],
    ['Mercedes-Benz', 'Mercedes-Benz'],
    ['Mercedes Benz', 'Mercedes-Benz'],
    ['mercedes', 'Mercedes-Benz'],
    ['Benz', 'Mercedes-Benz'],
    ['merc', 'Mercedes-Benz'],
    ['Merc C200', 'Mercedes-Benz'],
    ['MB', 'Mercedes-Benz'],
    ['MERCEDES-BENZ C-Class', 'Mercedes-Benz'],
    ['Audi', 'Audi'],
    ['audi q5', 'Audi'],
    ['VOLVO XC60', 'Volvo'],
    ['Jaguar', 'Jaguar'],
    ['Land Rover', 'Land Rover'],
    ['landrover', 'Land Rover'],
    ['Range Rover', 'Land Rover'],
    ['range rover evoque', 'Land Rover'],
    ['Porsche Cayenne', 'Porsche'],
    ['Lexus', 'Lexus'],
    ['Mini Cooper', 'Mini'],
    ['MINI', 'Mini'],
    ['Maserati', 'Maserati'],
    ['Bentley', 'Bentley'],
    ['Rolls Royce', 'Rolls-Royce'],
    ['rolls-royce', 'Rolls-Royce'],
    ['Rolls-Royce Ghost', 'Rolls-Royce'],
    // Misspelt as people do, and a model typed where the make goes.
    ['Mercedez', 'Mercedes-Benz'],
    ['mercedez benz e class', 'Mercedes-Benz'],
    ['Porche 911', 'Porsche'],
    ['Beamer', 'BMW'],
    ['Discovery', 'Land Rover'],
    ['Discovery Sport', 'Land Rover'],
    ['Roll Royce', 'Rolls-Royce'],
    ['Mercedes‑Benz', 'Mercedes-Benz'],
  ])('%p is %p', (typed, make) => {
    expect(luxuryMakeOf(typed)).toBe(make as (typeof LUXURY_MAKES)[number])
  })

  test.each([
    'Maruti',
    'Maruti Suzuki Swift',
    'Hyundai Venue',
    'Toyota Fortuner',
    'Volkswagen',
    'Skoda',
    'Jeep Compass',
    'Mercury',
    'Minibus',
    'Mahindra',
    'MG Hector',
    'Audio',
    'Benzene',
    'Discover',
    'Mbappe',
    'Kia',
    'Tata Nexon',
    '',
    '   ',
    '—',
  ])('%p is not a luxury make', (typed) => {
    expect(luxuryMakeOf(typed)).toBeNull()
  })

  test('nothing at all is no make', () => {
    expect(luxuryMakeOf(null)).toBeNull()
    expect(luxuryMakeOf(undefined)).toBeNull()
  })

  test('every luxury make is found by its own name, and words are plain', () => {
    for (const make of LUXURY_MAKES) expect(luxuryMakeOf(make)).toBe(make)
    expect(makeWords(' Mercedes–Benz\t')).toBe('mercedes benz')
    expect(makeWords('Škoda')).toBe('skoda')
  })

  test('the luxury makes come first on the brand list, Other last', () => {
    expect(LUXURY_BRANDS.slice(0, LUXURY_MAKES.length)).toEqual([...LUXURY_MAKES])
    expect(LUXURY_BRANDS.at(-1)).toBe('Other')
  })
})

const specialist = (id: string) => ({ id, luxury: { brands: ['BMW'] } })
const plain = (id: string) => ({ id, luxury: null })

describe('specialistRow: "Specialists for your <Make>"', () => {
  test('a luxury make with two specialists in the list shows them, in the list order', () => {
    const row = specialistRow('benz', [plain('a'), specialist('b'), plain('c'), specialist('d')])
    expect(row?.make).toBe('Mercedes-Benz')
    expect(row?.garages.map((g) => g.id)).toEqual(['b', 'd'])
  })

  test(`fewer than ${SPECIALIST_ROW_MIN} specialists: hidden`, () => {
    expect(specialistRow('BMW', [specialist('a'), plain('b')])).toBeNull()
    expect(specialistRow('BMW', [])).toBeNull()
  })

  test('not a luxury make, no car, or the filter already on: hidden', () => {
    const garages = [specialist('a'), specialist('b')]
    expect(specialistRow('Maruti Swift', garages)).toBeNull()
    expect(specialistRow(null, garages)).toBeNull()
    expect(specialistRow('BMW', garages, true)).toBeNull()
  })

  test('a card from an older API (no luxury field) is not a specialist', () => {
    const older: Array<{ id: string; luxury?: null }> = [{ id: 'a' }, { id: 'b' }]
    expect(specialistRow('BMW', older)).toBeNull()
  })
})

describe('handlesBrands: the garage page line', () => {
  test("the customer's own make is marked, Other left out", () => {
    expect(handlesBrands(['BMW', 'Mercedes-Benz', 'Other'], 'merc')).toEqual([
      { brand: 'BMW', mine: false },
      { brand: 'Mercedes-Benz', mine: true },
    ])
    expect(handlesBrands(['BMW'], null)).toEqual([{ brand: 'BMW', mine: false }])
  })
})

describe('applying', () => {
  const ready = {
    brands: ['BMW' as const],
    photos: [1, 2, 3].map((n) => ({ url: `https://cdn/x/${n}.jpg`, caption: null })),
    coveredBay: false,
    products: '',
    staff: '',
  }

  test('Send for review needs a brand, 3 photos and a bay answer', () => {
    expect(canSendApplication(ready)).toBe(true)
    expect(canSendApplication({ ...ready, brands: [] })).toBe(false)
    expect(canSendApplication({ ...ready, photos: ready.photos.slice(0, 2) })).toBe(false)
    expect(canSendApplication({ ...ready, coveredBay: null })).toBe(false)
    expect(canSendApplication({ ...ready, products: 'x'.repeat(301) })).toBe(false)
  })

  test('the screen follows the tier and the status', () => {
    expect(garageLuxuryScreen({ silverOrGold: false, status: null })).toBe('locked')
    expect(garageLuxuryScreen({ silverOrGold: true, status: null })).toBe('form')
    expect(garageLuxuryScreen({ silverOrGold: true, status: 'review' })).toBe('review')
    expect(garageLuxuryScreen({ silverOrGold: true, status: 'more' })).toBe('more')
    expect(garageLuxuryScreen({ silverOrGold: false, status: 'more' })).toBe('locked')
    expect(garageLuxuryScreen({ silverOrGold: true, status: 'approved' })).toBe('approved')
    // Below Silver: the badge is hidden until Silver again.
    expect(garageLuxuryScreen({ silverOrGold: false, status: 'approved' })).toBe('hidden')
    expect(garageLuxuryScreen({ silverOrGold: true, status: 'declined', reapplyOn: '2026-12-21' })).toBe('declined')
    // The wait is over: the form again.
    expect(garageLuxuryScreen({ silverOrGold: true, status: 'declined', reapplyOn: null })).toBe('form')
    expect(garageLuxuryScreen({ silverOrGold: true, status: 'removed' })).toBe('removed')
  })

  test('"What this means" claims only what the team checks', () => {
    const lines = LUXURY_STANDARDS.join(' ')
    expect(lines).toContain('at least 3 jobs')
    expect(lines).toContain('Silver or Gold')
    for (const line of LUXURY_STANDARDS) expect(line.toLowerCase()).not.toMatch(/certified|verified|guarantee/)
  })
})

describe('the map carries the filter (0083)', () => {
  test('luxury=1 or true turns it on; anything else, or nothing, leaves it off', async () => {
    const { luxuryParamOn, LUXURY_PARAM } = await import('./luxury')
    expect(LUXURY_PARAM).toBe('luxury')
    expect(luxuryParamOn('1')).toBe(true)
    expect(luxuryParamOn('true')).toBe(true)
    expect(luxuryParamOn(['1', '0'])).toBe(true)
    for (const off of ['0', 'false', '', 'yes', null, undefined, [] as string[]]) expect(luxuryParamOn(off)).toBe(false)
  })

  test("the map's count words say specialists while it is on", async () => {
    const { luxuryMapWords } = await import('./luxury')
    expect(luxuryMapWords(1, true)).toBe('specialist near you')
    expect(luxuryMapWords(3, true)).toBe('specialists near you')
    expect(luxuryMapWords(1, false)).toBe('specialist here')
    expect(luxuryMapWords(0, false)).toBe('specialists here')
  })
})
