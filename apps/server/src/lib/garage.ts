/**
 * The Detlio Garage (0057): a collectible series of fictional hypercar
 * cards customers earn by booking through Detlio (owner, 18 Oct 2026).
 * Pure, with the settings, the facts and the randomness passed in, so
 * every rule is unit-tested (garage.test.ts); modules/garage reads and
 * writes, under the customer's rewards lock.
 *
 *   - **Earning.** One card per booking that earns a Shine Card stamp (the
 *     same eligibility), plus a scratch card's "Garage card" prize, a
 *     challenge's "Garage cards ×N" and a bonus card per badge earned.
 *   - **A pull.** The server draws the rarity from the settings' odds
 *     (Common 55, Rare 30, Epic 12, Legendary 3), then a car of that
 *     rarity: with `unownedBiasPercent` chance, one the customer does not
 *     have yet (when there is one). **Pity**: a Rare or better is certain
 *     within `pityRare` pulls without one, a Legendary within
 *     `pityLegendary`.
 *   - **Duplicates** turn into Shine Card stamps: every
 *     `duplicatesPerStar` duplicates, one bonus stamp.
 *   - **Rows and the series.** The 40 cards are 8 rows of 5, by number.
 *     Finishing a row gives a voucher (`rowVoucher`, ₹100) once, counted
 *     toward the rewards' monthly budget: past it, `rowFallbackStamps`
 *     bonus stamps instead. Finishing the series gives the Garage Legend
 *     badge and a completion record (the hook for any future prize).
 *
 * Every number is in the versioned rewards settings (`settings.garage`,
 * optional: a version saved before 0057 reads as the defaults). Fictional
 * cars only: `realCarNameIn` keeps real makes and models out of every name
 * and line the team types.
 */
import { randomInt } from 'node:crypto'
import { bannedPhraseIn } from './copy-rules.js'
import { formatRupees } from './discounts.js'
import type { RewardsSettings } from './rewards.js'

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const GARAGE_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
export type GarageRarity = (typeof GARAGE_RARITIES)[number]

export const RARITY_LABELS: Record<GarageRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

export const GARAGE_TONES = ['light', 'dark'] as const
export type GarageTone = (typeof GARAGE_TONES)[number]

/** Where a car's picture comes from: drawn from numbers, made with AI, or uploaded by the team. */
export const ART_SOURCES = ['default', 'ai', 'upload'] as const
export type ArtSource = (typeof ART_SOURCES)[number]

export const PULL_SOURCES = ['booking', 'scratch', 'challenge', 'badge', 'admin'] as const
export type PullSource = (typeof PULL_SOURCES)[number]

export const PULL_SOURCE_LABELS: Record<PullSource, string> = {
  booking: 'Booking completed',
  scratch: 'Scratch card',
  challenge: 'Challenge prize',
  badge: 'Badge bonus',
  admin: 'From Detlio',
}

export const SERIES_STATUSES = ['draft', 'live', 'ended'] as const
export type SeriesStatus = (typeof SERIES_STATUSES)[number]

/** Cards per row, by number: 1–5 is row 1, 6–10 row 2… */
export const ROW_SIZE = 5
/** The pity a pull was forced by, if any. */
export type PullForce = 'pity_rare' | 'pity_legendary'

// ─── Settings ────────────────────────────────────────────────────────────────

export interface GarageSettings {
  /** The Garage's own switch, under the rewards switches. */
  enabled: boolean
  /** The odds of each rarity, out of 100. */
  rarityWeights: Record<GarageRarity, number>
  /** Chance (%) that a pull picks a car of its rarity the customer does not have yet, when there is one. */
  unownedBiasPercent: number
  /** A Rare or better is certain on this pull without one (10 = within 10). */
  pityRare: number
  /** A Legendary is certain on this pull without one. */
  pityLegendary: number
  /** Duplicates that make one bonus Shine Card stamp. */
  duplicatesPerStar: number
  /** A finished row's voucher, ₹ off. */
  rowVoucher: number
  /** Bonus stamps a finished row gives instead once the month's budget is reached. */
  rowFallbackStamps: number
  /** A scratch card's chance (%) of being a Garage card, drawn before the money prizes. */
  scratchCardWeight: number
  /** Garage cards given with each badge earned. */
  badgeBonusCards: number
}

/**
 * The owner's numbers (18 Oct 2026). Off until the team turns it on in
 * admin (Rewards → Garage), after looking over the cars and their art.
 */
export const DEFAULT_GARAGE_SETTINGS: GarageSettings = {
  enabled: false,
  rarityWeights: { common: 55, rare: 30, epic: 12, legendary: 3 },
  unownedBiasPercent: 60,
  pityRare: 10,
  pityLegendary: 60,
  duplicatesPerStar: 3,
  rowVoucher: 100,
  rowFallbackStamps: 1,
  scratchCardWeight: 3,
  badgeBonusCards: 1,
}

export const GARAGE_LIMITS = {
  weight: { min: 0, max: 100 },
  unownedBiasPercent: { min: 0, max: 100 },
  pityRare: { min: 2, max: 50 },
  pityLegendary: { min: 10, max: 500 },
  duplicatesPerStar: { min: 1, max: 20 },
  rowVoucher: { min: 1, max: 1000 },
  rowFallbackStamps: { min: 0, max: 5 },
  scratchCardWeight: { min: 0, max: 50 },
  badgeBonusCards: { min: 0, max: 3 },
  challengeCards: { min: 1, max: 5 },
} as const

/** The Garage's settings in force: what is stored over the defaults, every key present. */
export function garageSettings(settings: Pick<RewardsSettings, 'garage'> | null | undefined): GarageSettings {
  const stored = settings?.garage ?? {}
  return {
    ...DEFAULT_GARAGE_SETTINGS,
    ...stored,
    rarityWeights: { ...DEFAULT_GARAGE_SETTINGS.rarityWeights, ...(stored.rarityWeights ?? {}) },
  }
}

/** Every problem with the Garage's settings, in the form's order (the API refuses anything listed). */
export function garageSettingsProblems(g: GarageSettings): string[] {
  const problems: string[] = []
  const L = GARAGE_LIMITS
  const range = (name: string, value: number, limit: { min: number; max: number }) => {
    if (!Number.isInteger(value) || value < limit.min || value > limit.max) {
      problems.push(`Garage: ${name} must be a whole number from ${limit.min} to ${limit.max}`)
    }
  }
  if (typeof g.enabled !== 'boolean') problems.push('Garage: on or off')
  let sum = 0
  for (const rarity of GARAGE_RARITIES) {
    const w = g.rarityWeights[rarity]
    range(`${RARITY_LABELS[rarity]} odds`, w, L.weight)
    sum += Number.isFinite(w) ? w : 0
  }
  if (sum !== 100) problems.push(`Garage: the odds must add up to 100 (they add up to ${sum})`)
  if (g.rarityWeights.common <= 0) problems.push('Garage: Common odds must be above 0')
  range('chance of a new car', g.unownedBiasPercent, L.unownedBiasPercent)
  range('Rare-or-better pity', g.pityRare, L.pityRare)
  range('Legendary pity', g.pityLegendary, L.pityLegendary)
  if (Number.isInteger(g.pityRare) && Number.isInteger(g.pityLegendary) && g.pityLegendary <= g.pityRare) {
    problems.push('Garage: Legendary pity must be more pulls than Rare-or-better pity')
  }
  range('duplicates per bonus stamp', g.duplicatesPerStar, L.duplicatesPerStar)
  range('row reward', g.rowVoucher, L.rowVoucher)
  range('row reward past the budget (stamps)', g.rowFallbackStamps, L.rowFallbackStamps)
  range('Garage card chance on a scratch card', g.scratchCardWeight, L.scratchCardWeight)
  range('cards per badge', g.badgeBonusCards, L.badgeBonusCards)
  return problems
}

// ─── Pulls ───────────────────────────────────────────────────────────────────

const RANK: Record<GarageRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

export function rarityRank(rarity: GarageRarity): number {
  return RANK[rarity]
}

/**
 * Where the customer stands on pity, from their pulls in this series,
 * newest first: pulls since the last Rare-or-better, and since the last
 * Legendary.
 */
export function pityCounts(rarities: readonly GarageRarity[]): { sinceRare: number; sinceLegendary: number } {
  let sinceRare = rarities.findIndex((r) => RANK[r] >= RANK.rare)
  let sinceLegendary = rarities.findIndex((r) => r === 'legendary')
  if (sinceRare < 0) sinceRare = rarities.length
  if (sinceLegendary < 0) sinceLegendary = rarities.length
  return { sinceRare, sinceLegendary }
}

/** A roll in [0, total) over weights, in the rarities' order. */
function byWeight(roll: number, weights: Array<[GarageRarity, number]>): GarageRarity {
  let cursor = roll
  for (const [rarity, weight] of weights) {
    if (cursor < weight) return rarity
    cursor -= weight
  }
  return weights[weights.length - 1][0]
}

/**
 * The rarity of the next pull. Pity first: the `pityLegendary`th pull
 * without a Legendary is one; the `pityRare`th without a Rare or better
 * draws only among Rare, Epic and Legendary (by their own odds). Otherwise
 * the odds as set. `pick(n)` is a whole number in [0, n): crypto in
 * production, seeded in tests.
 */
export function drawRarity(
  input: { sinceRare: number; sinceLegendary: number },
  g: GarageSettings,
  pick: (max: number) => number = randomInt
): { rarity: GarageRarity; forced: PullForce | null } {
  if (input.sinceLegendary + 1 >= g.pityLegendary) return { rarity: 'legendary', forced: 'pity_legendary' }
  const all = GARAGE_RARITIES.map((r) => [r, g.rarityWeights[r]] as [GarageRarity, number]).filter(([, w]) => w > 0)
  if (input.sinceRare + 1 >= g.pityRare) {
    const better = all.filter(([r]) => RANK[r] >= RANK.rare)
    const total = better.reduce((s, [, w]) => s + w, 0)
    if (total > 0) return { rarity: byWeight(pick(total), better), forced: 'pity_rare' }
    return { rarity: 'rare', forced: 'pity_rare' }
  }
  const total = all.reduce((s, [, w]) => s + w, 0)
  return { rarity: byWeight(pick(total), all), forced: null }
}

export interface PoolCar {
  id: string
  number: number
  rarity: GarageRarity
}

/**
 * The car for a drawn rarity, among the series' cars switched on: with
 * `unownedBiasPercent` chance one the customer does not have yet (if any of
 * that rarity), else any of that rarity. A rarity with no car switched on
 * gives way to the nearest one that has cars (lower first, then higher).
 * Null when the series has no car switched on at all.
 */
export function pickCar<T extends PoolCar>(
  cars: readonly T[],
  rarity: GarageRarity,
  owned: ReadonlySet<string>,
  g: Pick<GarageSettings, 'unownedBiasPercent'>,
  pick: (max: number) => number = randomInt
): { car: T; rarity: GarageRarity } | null {
  const order = [...GARAGE_RARITIES].sort(
    (a, b) => Math.abs(RANK[a] - RANK[rarity]) - Math.abs(RANK[b] - RANK[rarity]) || RANK[a] - RANK[b]
  )
  for (const r of order) {
    const pool = cars.filter((c) => c.rarity === r).sort((a, b) => a.number - b.number)
    if (pool.length === 0) continue
    const fresh = pool.filter((c) => !owned.has(c.id))
    const preferNew = fresh.length > 0 && pick(100) < g.unownedBiasPercent
    const from = preferNew ? fresh : pool
    return { car: from[pick(from.length)], rarity: r }
  }
  return null
}

/**
 * One whole pull: pity, the rarity, the car and whether it is a duplicate.
 * `history` is the customer's pulls in the series, newest first.
 */
export function planPull<T extends PoolCar>(
  input: { cars: readonly T[]; owned: ReadonlySet<string>; history: readonly GarageRarity[] },
  g: GarageSettings,
  pick: (max: number) => number = randomInt
): { car: T; rarity: GarageRarity; duplicate: boolean; forced: PullForce | null } | null {
  const drawn = drawRarity(pityCounts(input.history), g, pick)
  const chosen = pickCar(input.cars, drawn.rarity, input.owned, g, pick)
  if (!chosen) return null
  return {
    car: chosen.car,
    rarity: chosen.car.rarity,
    duplicate: input.owned.has(chosen.car.id),
    // A forced pull that gave way to a lower rarity (none switched on) was not really forced.
    forced: drawn.forced && RANK[chosen.car.rarity] >= RANK[drawn.rarity] ? drawn.forced : null,
  }
}

/** Whether a scratch card is a Garage card: drawn when the card is made, before the money prizes. */
export function scratchIsGarageCard(g: Pick<GarageSettings, 'scratchCardWeight'>, pick: (max: number) => number = randomInt): boolean {
  return g.scratchCardWeight > 0 && pick(100) < g.scratchCardWeight
}

// ─── Duplicates, rows and the series ─────────────────────────────────────────

/** Bonus stamps from duplicates not yet turned into one: how many stamps, and how many duplicates they use. */
export function duplicateStars(unconverted: number, perStar: number): { stamps: number; used: number } {
  if (perStar <= 0 || unconverted < perStar) return { stamps: 0, used: 0 }
  const stamps = Math.floor(unconverted / perStar)
  return { stamps, used: stamps * perStar }
}

/** The row a card's number is in (1-based). */
export function rowOf(number: number): number {
  return Math.ceil(number / ROW_SIZE)
}

/** The rows in a series of `total` cards. */
export function rowCount(total: number): number {
  return Math.ceil(total / ROW_SIZE)
}

/**
 * Rows the customer has just finished: every row whose cards (all of the
 * series' numbers in it, switched on or not) they now own, that was not
 * already rewarded.
 */
export function newlyCompletedRows(input: { seriesNumbers: readonly number[]; ownedNumbers: ReadonlySet<number>; rewardedRows: ReadonlySet<number> }): number[] {
  const rows = new Map<number, number[]>()
  for (const n of input.seriesNumbers) rows.set(rowOf(n), [...(rows.get(rowOf(n)) ?? []), n])
  const done: number[] = []
  for (const [row, numbers] of [...rows].sort((a, b) => a[0] - b[0])) {
    if (input.rewardedRows.has(row)) continue
    if (numbers.every((n) => input.ownedNumbers.has(n))) done.push(row)
  }
  return done
}

/** The whole series owned. */
export function seriesComplete(seriesNumbers: readonly number[], ownedNumbers: ReadonlySet<number>): boolean {
  return seriesNumbers.length > 0 && seriesNumbers.every((n) => ownedNumbers.has(n))
}

/**
 * A finished row's reward within the month's budget: the voucher, or past
 * the budget the fallback stamps (a pull is luck; the money it can unlock
 * stays inside the cap).
 */
export function rowReward(
  input: { issuedThisMonthPaise: number; capPaise: number },
  g: Pick<GarageSettings, 'rowVoucher' | 'rowFallbackStamps'>
): { kind: 'voucher'; amount: number } | { kind: 'stamps'; stamps: number } {
  if (input.issuedThisMonthPaise + g.rowVoucher * 100 > input.capPaise) return { kind: 'stamps', stamps: g.rowFallbackStamps }
  return { kind: 'voucher', amount: g.rowVoucher }
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** "New car for your Garage: Monsoon GT (Rare)". Nothing about the customer. */
export function pullWords(car: { name: string; rarity: GarageRarity }, duplicate: boolean): { title: string; body: string } {
  return {
    title: `New car for your Garage: ${car.name} (${RARITY_LABELS[car.rarity]})`,
    body: duplicate ? 'A duplicate: three of those make a bonus Shine Card stamp.' : 'Tap to see it in your Garage.',
  }
}

/** Several cards at once (a challenge's prize): one push. */
export function pullsWords(count: number): { title: string; body: string } {
  return { title: `${count} new cars for your Garage`, body: 'Tap to see them in your Garage.' }
}

export function rowWords(row: number, reward: { kind: 'voucher'; amount: number } | { kind: 'stamps'; stamps: number }): { title: string; body: string } {
  const what =
    reward.kind === 'voucher'
      ? `${formatRupees(reward.amount)} off your next booking is ready.`
      : reward.stamps === 1
        ? 'A bonus stamp is on your Shine Card.'
        : `${reward.stamps} bonus stamps are on your Shine Card.`
  return { title: `Row ${row} complete — ${reward.kind === 'voucher' ? `${formatRupees(reward.amount)} off` : 'bonus stamps'}`, body: what }
}

export function seriesWords(seriesName: string): { title: string; body: string } {
  return { title: 'Series complete!', body: `Every car in ${seriesName} is in your Garage. The Garage Legend badge is yours.` }
}

// ─── Fictional names only ────────────────────────────────────────────────────

/**
 * Real makes and models (and words that read as one), lower case. A card's
 * name, colour, stats and line must name none: the cars are invented. Whole
 * words, so "Granite" passes and "Ram" alone does not.
 */
export const REAL_CAR_NAMES: readonly string[] = [
  // Makes
  'abarth', 'acura', 'alfa romeo', 'alpine', 'aston martin', 'audi', 'bentley', 'bmw', 'bugatti', 'buick', 'byd', 'cadillac',
  'caterham', 'chevrolet', 'chevy', 'chrysler', 'citroen', 'citroën', 'cupra', 'dacia', 'daewoo', 'datsun', 'de tomaso', 'dodge',
  'ferrari', 'fiat', 'fisker', 'ford', 'genesis', 'gmc', 'hennessey', 'hindustan', 'honda', 'hummer', 'hyundai', 'infiniti', 'isuzu',
  'jaguar', 'jeep', 'kia', 'koenigsegg', 'lada', 'lamborghini', 'lancia', 'land rover', 'lexus', 'lincoln', 'lotus', 'lucid',
  'mahindra', 'maruti', 'maserati', 'maybach', 'mazda', 'mclaren', 'mercedes', 'mercedes-benz', 'benz', 'mg', 'mini', 'mitsubishi',
  'morgan', 'nissan', 'noble', 'opel', 'pagani', 'peugeot', 'polestar', 'pontiac', 'porsche', 'premier', 'ram', 'renault', 'rimac',
  'rivian', 'rolls-royce', 'rolls royce', 'rover', 'saab', 'saleen', 'seat', 'skoda', 'škoda', 'smart', 'spyker', 'ssangyong',
  'subaru', 'suzuki', 'tata', 'tesla', 'toyota', 'tvr', 'vauxhall', 'volkswagen', 'vw', 'volvo', 'zenvo', 'amg', 'gtr', 'gt-r',
  // Models (the well-known ones, and India's)
  'aventador', 'huracan', 'huracán', 'urus', 'revuelto', 'countach', 'diablo', 'murcielago', 'murciélago', 'gallardo', 'miura',
  'veneno', 'sian', 'sián', 'temerario', 'chiron', 'veyron', 'divo', 'tourbillon', 'bolide', 'mistral', 'agera', 'jesko', 'regera',
  'gemera', 'huayra', 'zonda', 'utopia', 'senna', 'speedtail', 'artura', 'elva', 'valkyrie', 'valhalla', 'vantage', 'vanquish',
  'enzo', 'laferrari', 'sf90', 'roma', 'portofino', 'purosangue', 'testarossa', 'f40', 'f50', 'f8', 'daytona', 'monza', 'dino',
  'carrera', 'taycan', 'cayman', 'boxster', 'macan', 'cayenne', 'panamera', '911', '918', '959', 'skyline', 'supra', 'nsx',
  'corvette', 'stingray', 'viper', 'mustang', 'camaro', 'challenger', 'charger', 'raptor', 'bronco', 'model s', 'model 3',
  'model x', 'model y', 'cybertruck', 'nevera', 'evija', 'emira', 'evora', 'exige', 'elise', 'battista', 'mc20', 'quattroporte',
  'ghibli', 'levante', 'grecale', 'granturismo', 'i8', 'r8', 'phantom', 'ghost', 'wraith', 'cullinan', 'spectre', 'bentayga',
  'continental', 'venom', 'tuatara', 'nexon', 'harrier', 'safari', 'punch', 'tiago', 'altroz', 'curvv', 'sierra', 'thar',
  'scorpio', 'bolero', 'xuv', 'swift', 'dzire', 'baleno', 'brezza', 'ertiga', 'wagonr', 'celerio', 'ciaz', 'jimny', 'vitara',
  'fronx', 'invicto', 'ignis', 'gypsy', 'esteem', 'creta', 'venue', 'verna', 'alcazar', 'tucson', 'santro', 'ioniq', 'exter',
  'seltos', 'sonet', 'carens', 'carnival', 'stinger', 'elevate', 'civic', 'accord', 'amaze', 'innova', 'fortuner', 'glanza',
  'hyryder', 'camry', 'corolla', 'etios', 'hilux', 'land cruiser', 'hector', 'astor', 'gloster', 'comet', 'windsor', 'kushaq',
  'slavia', 'octavia', 'superb', 'kodiaq', 'taigun', 'virtus', 'polo', 'vento', 'tiguan', 'golf', 'kwid', 'kiger', 'triber',
  'duster', 'magnite', 'compass', 'meridian', 'wrangler', 'ambassador', 'contessa', 'volt', 'bolt', 'leaf', 'prius', 'mirai',
  'beetle', 'defender', 'evoque', 'velar', 'f-type', 'e-type', 'giulia', 'stelvio', 'miata', 'wrx', 'impreza', 'lancer', 'pajero',
]

/** The first real make or model in `text`, or null. Whole words and phrases, any case. */
export function realCarNameIn(text: string): string | null {
  const normalised = ` ${text.toLowerCase().replace(/[‘’]/g, "'")} `
  for (const name of REAL_CAR_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`[^a-z0-9à-ž]${escaped}[^a-z0-9à-ž]`).test(normalised)) return name
  }
  return null
}

export const CAR_LIMITS = {
  name: { min: 2, max: 28 },
  colour: { min: 2, max: 24 },
  stat: { min: 2, max: 32 },
  lore: { min: 10, max: 110 },
  seriesName: { min: 2, max: 40 },
} as const

export interface CarEdit {
  name: string
  rarity: GarageRarity
  tone: GarageTone
  paint: string
  colour: string
  stats: [string, string, string]
  lore: string
  enabled: boolean
}

/** Every problem with a car as the team typed it; empty when it can be saved. */
export function carProblems(input: CarEdit): string[] {
  const problems: string[] = []
  const L = CAR_LIMITS
  const length = (label: string, text: string, limit: { min: number; max: number }) => {
    const n = text.trim().length
    if (n < limit.min || n > limit.max) problems.push(`${label} is ${limit.min}–${limit.max} characters`)
  }
  length('The name', input.name, L.name)
  length('The colour', input.colour, L.colour)
  input.stats.forEach((stat, i) => length(`Stat ${i + 1}`, stat, L.stat))
  length('The line', input.lore, L.lore)
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.paint)) problems.push('The paint is a colour like #0F7A78')
  if (!(GARAGE_RARITIES as readonly string[]).includes(input.rarity)) problems.push('Pick a rarity')
  if (!(GARAGE_TONES as readonly string[]).includes(input.tone)) problems.push('Pick light or dark')
  const words = [input.name, input.colour, ...input.stats, input.lore].join(' · ')
  const banned = bannedPhraseIn(words)
  if (banned) problems.push(`Detlio doesn't say "${banned}"`)
  const real = realCarNameIn(words)
  if (real) problems.push(`"${real}" is a real car name. Garage cars are invented: pick another word.`)
  return problems
}

// ─── Art ─────────────────────────────────────────────────────────────────────

/** What one AI picture costs, roughly, in ₹ (the admin's estimate, not a bill). */
export const AI_IMAGE_COST_INR = 4

/** The estimate the bulk button shows: "N pictures, about ₹X". */
export function artCostEstimate(pictures: number): { pictures: number; rupees: number } {
  return { pictures, rupees: pictures * AI_IMAGE_COST_INR }
}

/**
 * The prompt for a card's picture: a fixed template with the car's
 * invented name, its colour and the card's tone. Nothing about any person
 * is ever in it (these are the team's words about a fictional car).
 */
export function garageArtPrompt(input: { name: string; colour: string; tone: GarageTone }): string {
  const clean = (text: string) => text.replace(/[^\p{L}\p{N} '’-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  const background = input.tone === 'dark' ? 'dark charcoal' : 'light grey'
  return [
    `Photo-real studio shot of a fictional, unbranded hypercar named ${clean(input.name)}`,
    `${clean(input.colour)} paint`,
    'side profile at a slight three-quarter angle, facing right',
    'no logos, no badges, no text, no letters, no number plate',
    `${background} seamless studio background, soft reflections on a polished floor`,
    'premium collectible card art, sharp focus',
  ].join(', ')
}

/** Where a card's chosen picture lives in the public bucket. */
export function garageArtKey(seriesNumber: number, carNumber: number): string {
  return `garage/series-${seriesNumber}/${String(carNumber).padStart(2, '0')}.webp`
}

/** Where a car's AI options and uploads wait (the 1-day `ai-temp/` lifecycle rule clears leftovers). */
export function garageTempPrefix(carId: string): string {
  return `ai-temp/garage/${carId}/`
}

/** Whether a key is one of this car's waiting pictures. */
export function isGarageTempKeyFor(key: string, carId: string): boolean {
  const prefix = garageTempPrefix(carId)
  return key.startsWith(prefix) && /^(upload-)?[0-9a-f-]{36}\.webp$/.test(key.slice(prefix.length))
}

/** The bytes of a WebP picture ("RIFF" … "WEBP"), the only kind a card takes. */
export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
}

/** An uploaded card picture is at most this big. */
export const MAX_ART_BYTES = 3 * 1024 * 1024
