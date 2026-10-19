/**
 * The Detlio Garage (0057) for the apps: rarities and their looks, the
 * settings' shape and defaults, the limits and the words the customer app
 * and admin share. The twin of apps/server/src/lib/garage.ts
 * (garage.parity.test.ts): the API draws every card and decides every
 * reward; these are the names and numbers the screens show. Every card is
 * one of the licensed card photos (./card-cars.ts), by id.
 */

export const GARAGE_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
export type GarageRarity = (typeof GARAGE_RARITIES)[number]

export const RARITY_LABELS: Record<GarageRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

export type ArtSource = 'photo' | 'upload'
export type PullSource = 'booking' | 'scratch' | 'challenge' | 'badge' | 'admin'
export type SeriesStatus = 'draft' | 'live' | 'ended'

export const PULL_SOURCE_LABELS: Record<PullSource, string> = {
  booking: 'Booking completed',
  scratch: 'Scratch card',
  challenge: 'Challenge prize',
  badge: 'Badge bonus',
  admin: 'From Detlio',
}

export interface GarageSettings {
  enabled: boolean
  rarityWeights: Record<GarageRarity, number>
  unownedBiasPercent: number
  pityRare: number
  pityLegendary: number
  duplicatesPerStar: number
  rowVoucher: number
  rowFallbackStamps: number
  scratchCardWeight: number
  badgeBonusCards: number
}

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

export const CAR_LIMITS = {
  name: { min: 2, max: 28 },
  colour: { min: 2, max: 24 },
  setting: { min: 2, max: 24 },
  lore: { min: 10, max: 110 },
  seriesName: { min: 2, max: 40 },
} as const

/** Settings a photo is taken in, offered by the admin form. */
export const PHOTO_SETTINGS = ['Studio', 'Track', 'Night street', 'Open road', 'City', 'Coast', 'Garage', 'Showroom'] as const

/** The line every Garage card is shown with: the photos are of real cars. */
export const ILLUSTRATION_LINE = 'Cars shown for illustration only. Not affiliated with any car maker.'

export const ROW_SIZE = 5

/** The Garage's settings in force: what is stored over the defaults. */
export function garageSettings(settings: { garage?: Partial<GarageSettings> } | null | undefined): GarageSettings {
  const stored = settings?.garage ?? {}
  return {
    ...DEFAULT_GARAGE_SETTINGS,
    ...stored,
    rarityWeights: { ...DEFAULT_GARAGE_SETTINGS.rarityWeights, ...(stored.rarityWeights ?? {}) },
  }
}

/**
 * Each rarity's frame and burst: Common silver, Rare blue, Epic purple,
 * Legendary gold. `metal` is the frame's gradient (light → shadow), `glow`
 * the reveal's burst, `ink` the label on the rarity pill.
 */
export const RARITY_LOOKS: Record<GarageRarity, { metal: [string, string, string, string]; glow: string; ink: string; pill: string }> = {
  common: { metal: ['#F4F6F8', '#A8AFB8', '#E3E7EC', '#6D747E'], glow: 'rgba(214,220,230,0.55)', ink: '#14161A', pill: '#D9DDE3' },
  rare: { metal: ['#BFE0FF', '#3B82F6', '#9CCBFF', '#1E4E9E'], glow: 'rgba(80,150,255,0.6)', ink: '#06172F', pill: '#8EC1FF' },
  epic: { metal: ['#E9D5FF', '#9B5CF6', '#D4B4FE', '#5B21B6'], glow: 'rgba(168,110,255,0.62)', ink: '#1C0838', pill: '#C9A6FF' },
  legendary: { metal: ['#FFF4C2', '#D9A62E', '#FFE08A', '#8A5A0F'], glow: 'rgba(255,200,80,0.7)', ink: '#2A1A02', pill: '#F7D06B' },
}

/** "#07/40" */
export function cardNumber(number: number, total: number): string {
  return `#${String(number).padStart(2, '0')}/${total}`
}

/** "17 of 40" */
export function collectedLine(collected: number, total: number): string {
  return `${collected} of ${total}`
}

/** The row a card's number is in (1-based). */
export function rowOf(number: number): number {
  return Math.ceil(number / ROW_SIZE)
}

/** "2 more duplicates to a bonus stamp", "Your next duplicate is a bonus stamp". */
export function duplicatesLine(unconverted: number, perStar: number): string {
  const left = perStar - (unconverted % perStar)
  if (left === 1) return 'Your next duplicate makes a bonus stamp'
  return `${left} more duplicates make a bonus stamp`
}

/** "x2" when a car is owned more than once. */
export function copiesLabel(count: number): string | null {
  return count > 1 ? `×${count}` : null
}
