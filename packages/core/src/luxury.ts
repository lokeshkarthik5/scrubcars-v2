import { msg, t as translate, type Translate } from './i18n/translate'

const t: Translate = translate

/**
 * Luxury car specialists (0083, owner-approved screens 21 Nov 2026,
 * reference/mockups/luxury-specialists). A garage the Detlio team has
 * approved for luxury cars shows a quiet grey "Luxury specialist" badge, and
 * a customer whose main car is a luxury make sees "Specialists for your
 * <Make>" above Nearby garages.
 *
 * The rules that decide (who may apply, who shows the badge, the team's
 * decisions) are the server's (apps/server/src/lib/luxury.ts); the brands,
 * the limits and the waiting days here are kept equal to it by its
 * luxury.parity.test.ts. The make normalising (a customer types their make
 * freely) lives only here: only the apps read a customer's car.
 *
 * No imports but the translator: the server's parity test loads this file
 * by path.
 */

// ─── The makes ───────────────────────────────────────────────────────────────

/**
 * The makes whose owners see "Specialists for your <Make>". A fixed list to
 * start (owner, 21 Nov 2026): the team can change it later. Volkswagen,
 * Skoda, Jeep, Toyota and the rest are on a garage's brand list but do not
 * open the row.
 */
export const LUXURY_MAKES = [
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Volvo',
  'Jaguar',
  'Land Rover',
  'Porsche',
  'Lexus',
  'Mini',
  'Maserati',
  'Bentley',
  'Rolls-Royce',
] as const
export type LuxuryMake = (typeof LUXURY_MAKES)[number]

/**
 * The brands a garage can say it handles, in the form's order: the luxury
 * makes, then the dearer cars of other makes, then Other. Stored as these
 * exact values (the server refuses anything else).
 */
export const LUXURY_BRANDS = [
  ...LUXURY_MAKES,
  'Volkswagen',
  'Skoda',
  'Jeep',
  'Toyota',
  'MG',
  'Kia',
  'Other',
] as const
export type LuxuryBrand = (typeof LUXURY_BRANDS)[number]

/** The form's chip for a brand: the models meant, where only some count. */
export const LUXURY_BRAND_CHIP_LABELS: Partial<Record<LuxuryBrand, string>> = {
  Toyota: 'Toyota (Fortuner, Camry, Vellfire)',
  MG: 'MG (Gloster)',
  Kia: 'Kia (Carnival, EV6)',
  Other: msg('Other'),
}

export function brandChipLabel(brand: LuxuryBrand): string {
  const label = LUXURY_BRAND_CHIP_LABELS[brand]
  return label ? t(label) : brand
}

export function isLuxuryBrand(value: string): value is LuxuryBrand {
  return (LUXURY_BRANDS as readonly string[]).includes(value)
}

/**
 * What a customer may type for each luxury make, written the way
 * `makeWords` leaves it (lower case, letters and digits, one space). A
 * typed make counts when it is one of these or starts with one followed by
 * a space ("bmw 320d", "range rover evoque").
 */
const MAKE_ALIASES: Record<LuxuryMake, readonly string[]> = {
  // Common misspellings too ("Mercedez", "Porche", "Beamer"): the field is typed freely.
  BMW: ['bmw', 'b m w', 'beemer', 'bimmer', 'beamer'],
  'Mercedes-Benz': [
    'mercedes benz',
    'mercedes',
    'mercedez',
    'mercedez benz',
    'merc',
    'benz',
    'mb',
    'mercedes amg',
    'amg',
    'maybach',
    'mercedes maybach',
  ],
  Audi: ['audi'],
  Volvo: ['volvo'],
  Jaguar: ['jaguar', 'jag'],
  'Land Rover': ['land rover', 'landrover', 'range rover', 'rangerover', 'defender', 'discovery', 'evoque', 'velar'],
  Porsche: ['porsche', 'porshe', 'porche'],
  Lexus: ['lexus'],
  Mini: ['mini', 'mini cooper', 'minicooper'],
  Maserati: ['maserati'],
  Bentley: ['bentley'],
  'Rolls-Royce': ['rolls royce', 'rollsroyce', 'rolls', 'rolls-royce', 'roll royce'],
}

/** Lower case, accents and punctuation gone, one space between words: "Mercedes-Benz " → "mercedes benz". */
export function makeWords(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Longest first, so "mercedes benz" is tried before "mercedes" (both are the
// same make, but "mini cooper" must never lose to a shorter alias of another).
const ALIASES: ReadonlyArray<{ alias: string; make: LuxuryMake }> = (
  Object.entries(MAKE_ALIASES) as Array<[LuxuryMake, readonly string[]]>
)
  .flatMap(([make, aliases]) => aliases.map((alias) => ({ alias: makeWords(alias), make })))
  .sort((a, b) => b.alias.length - a.alias.length)

/**
 * The luxury make a customer's typed make means, or null for any other make
 * (or nothing). "Benz", "merc", "Mercedes Benz", "MB" → Mercedes-Benz;
 * "Range Rover" → Land Rover; "rolls royce" → Rolls-Royce; any case or
 * spacing. Only the start of the text counts, so "Maruti Swift" is never a
 * Mini and "Hyundai Venue" never anything.
 */
export function luxuryMakeOf(typed: string | null | undefined): LuxuryMake | null {
  if (!typed) return null
  const words = makeWords(typed)
  if (!words) return null
  for (const { alias, make } of ALIASES) {
    if (words === alias || words.startsWith(`${alias} `)) return make
  }
  return null
}

// ─── The customer list ───────────────────────────────────────────────────────

/**
 * "Specialists for your <Make>" shows only with at least this many
 * specialists in the list (owner, 21 Nov 2026: one card on its own looks
 * like an advert). The filter chip still finds a single one.
 */
export const SPECIALIST_ROW_MIN = 2

/** What a garage card or page carries when it shows the badge; null when it does not. */
export interface LuxuryBadge {
  /** The brands the team approved, in the form's order. */
  brands: string[]
}

/**
 * The row above Nearby garages: the customer's luxury make and the
 * specialists among the garages listed that the team approved for that make
 * (the heading promises "for your BMW"), or null when it does not show
 * (not a luxury make, the Luxury specialists filter already on, or fewer
 * than SPECIALIST_ROW_MIN specialists).
 */
export function specialistRow<G extends { luxury?: LuxuryBadge | null }>(
  customerMake: string | null | undefined,
  garages: readonly G[],
  filterOn = false
): { make: LuxuryMake; garages: G[] } | null {
  if (filterOn) return null
  const make = luxuryMakeOf(customerMake)
  if (!make) return null
  const specialists = garages.filter((garage) => handlesMake(garage, make))
  return specialists.length >= SPECIALIST_ROW_MIN ? { make, garages: specialists } : null
}

/**
 * A garage shows the badge and the team approved it for this make: what the
 * row keeps, and what `GET /vendors?luxuryMake=<make>` keeps on the server
 * (luxurySpecialistFor), so the row's "See all N" and the list it opens agree.
 */
export function handlesMake(garage: { luxury?: LuxuryBadge | null }, make: LuxuryMake): boolean {
  return garage.luxury != null && garage.luxury.brands.includes(make)
}

/** The list's and the map's parameter for "Specialists for your <Make>": `luxuryMake=BMW`. */
export const LUXURY_MAKE_PARAM = 'luxuryMake'

/** A link's `luxuryMake` as a luxury make, or null for anything else (only exact LUXURY_MAKES values). */
export function luxuryMakeParam(value: string | readonly string[] | null | undefined): LuxuryMake | null {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && (LUXURY_MAKES as readonly string[]).includes(first) ? (first as LuxuryMake) : null
}

/**
 * "Handles BMW · Mercedes-Benz · …" on the garage page: the brands to
 * name, Other left out, each saying whether it is the customer's own make
 * (shown in white).
 */
export function handlesBrands(
  brands: readonly string[],
  customerMake: string | null | undefined
): Array<{ brand: string; mine: boolean }> {
  const mine = luxuryMakeOf(customerMake)
  return brands
    .filter((brand) => brand !== 'Other')
    .map((brand) => ({ brand, mine: mine !== null && brand === mine }))
}

// ─── Words ───────────────────────────────────────────────────────────────────

export const LUXURY_NAME = msg('Luxury car specialist')
export const LUXURY_BADGE_LABEL = msg('Luxury specialist')
export const LUXURY_FILTER_LABEL = msg('Luxury specialists')
/** The row's and the filtered heading's quiet line. */
export const LUXURY_APPROVED_LINE = msg('Approved by Detlio for luxury cars')

/**
 * "What this means": what Detlio checked, in plain words. Every line is one
 * the team checks before approving: a badge must never claim what nobody
 * checked.
 */
export const LUXURY_STANDARDS: readonly string[] = [
  msg('Showed Detlio photos of at least 3 jobs it did on luxury cars.'),
  msg('Has a covered or indoor bay, so the car isn’t worked on in the sun or rain.'),
  msg('Told Detlio the products it uses (like its ceramic and PPF brands) and who does the work.'),
  msg('Is a Silver or Gold garage on Detlio.'),
]
export const LUXURY_SHEET_INTRO = msg('Detlio shows this badge on a garage that:')
export const LUXURY_SHEET_BRANDS = msg('Brands it handles')
export const LUXURY_SHEET_FOOT = msg(
  'Any garage on Detlio can work on any car. Prices are the same for everyone, by car size: hatchback, sedan or SUV.'
)

/** The map peek's words after the count while the filter is on: "specialists near you", "specialist in Madurai". */
export function luxuryPeekWords(
  count: number,
  more: boolean,
  located: boolean,
  cityName: string,
  t: Translate = translate
): string {
  const one = count === 1 && !more
  if (located) return one ? t('specialist near you') : t('specialists near you')
  return one ? t('specialist in {city}', { city: cityName }) : t('specialists in {city}', { city: cityName })
}

/**
 * The map's query parameter for the "Luxury specialists" filter: the list's
 * map peek and "Map" link add `luxury=1` while the filter is on, and /map
 * (website and app) reads it, so the map shows what the list did.
 */
export const LUXURY_PARAM = 'luxury'

/** Whether a link's `luxury` parameter turns the filter on ("1" or "true"; the first of several). */
export function luxuryParamOn(value: string | readonly string[] | null | undefined): boolean {
  const first = Array.isArray(value) ? value[0] : value
  return first === '1' || first === 'true'
}

/** The map's count words while the filter is on: "specialists near you", "specialist here". */
export function luxuryMapWords(count: number, nearby: boolean, t: Translate = translate): string {
  if (nearby) return count === 1 ? t('specialist near you') : t('specialists near you')
  return count === 1 ? t('specialist here') : t('specialists here')
}

/** The map's empty line while the filter is on. */
export const LUXURY_MAP_EMPTY = msg('No luxury specialists in this area yet.')

/** The quiet line under the "Luxury specialists" heading. */
export function luxuryCaption(nearestFirst: boolean, t: Translate = translate): string {
  return nearestFirst ? t('Approved by Detlio for luxury cars · nearest first') : t(LUXURY_APPROVED_LINE)
}

// ─── Applying (the garage app) ───────────────────────────────────────────────

/** The same numbers as the server's LUXURY_RULES (parity test). */
export const LUXURY_LIMITS = {
  minPhotos: 3,
  maxPhotos: 8,
  captionMax: 40,
  productsMax: 300,
  staffMax: 200,
  noteMax: 300,
  /** After a decline, the garage may apply again this many days later. */
  reapplyDays: 30,
  /** One past-job photo, as uploaded: the server signs the size into the upload. */
  photoMaxBytes: 8 * 1024 * 1024,
} as const
export type LuxuryLimits = { readonly [K in keyof typeof LUXURY_LIMITS]: number }

export const LUXURY_STATUSES = ['review', 'more', 'approved', 'declined', 'removed'] as const
export type LuxuryStatus = (typeof LUXURY_STATUSES)[number]

/** One photo of a past luxury job: its public URL and an optional caption ("BMW 5 Series"). */
export interface LuxuryPhoto {
  url: string
  caption: string | null
}

/** What the garage fills in. Products and staff are optional. */
export interface LuxuryApplicationInput {
  brands: LuxuryBrand[]
  photos: LuxuryPhoto[]
  coveredBay: boolean | null
  products: string
  staff: string
}

/**
 * Whether "Send for review" can be pressed: a brand, at least 3 photos and
 * a bay answer (the server checks the same, and the lengths).
 */
export function canSendApplication(input: LuxuryApplicationInput): boolean {
  return (
    input.brands.length > 0 &&
    input.photos.length >= LUXURY_LIMITS.minPhotos &&
    input.photos.length <= LUXURY_LIMITS.maxPhotos &&
    input.coveredBay !== null &&
    input.products.trim().length <= LUXURY_LIMITS.productsMax &&
    input.staff.trim().length <= LUXURY_LIMITS.staffMax
  )
}

/**
 * Which screen the garage sees at Settings → Luxury car specialist, from
 * GET /vendors/me/luxury:
 *   locked    below Silver, with nothing approved: the tier card and what to get ready
 *   form      Silver or Gold, never sent (or applying again after a decline's wait)
 *   review    sent, waiting for the team
 *   more      the team asked for more: its note, and the form opens again
 *   approved  showing the badge
 *   hidden    approved, but below Silver now: hidden until Silver again
 *   declined  declined: the note, and the day it may apply again
 *   removed   the team removed the badge: the note; may apply again
 */
export type GarageLuxuryScreen = 'locked' | 'form' | 'review' | 'more' | 'approved' | 'hidden' | 'declined' | 'removed'

export function garageLuxuryScreen(state: {
  silverOrGold: boolean
  status: LuxuryStatus | null
  /** Declined only: the IST date it may apply again, or null once it may. */
  reapplyOn?: string | null
}): GarageLuxuryScreen {
  const { silverOrGold, status } = state
  if (status === 'approved') return silverOrGold ? 'approved' : 'hidden'
  if (status === 'review') return 'review'
  if (status === 'more') return silverOrGold ? 'more' : 'locked'
  if (status === 'declined' && state.reapplyOn) return 'declined'
  if (status === 'removed') return 'removed'
  return silverOrGold ? 'form' : 'locked'
}

/** The status chip's words, as admin and the garage say them. */
export const LUXURY_STATUS_LABELS: Record<LuxuryStatus, string> = {
  review: msg('Under review'),
  more: msg('Asked for more'),
  approved: msg('Approved'),
  declined: msg('Declined'),
  removed: msg('Removed'),
}
