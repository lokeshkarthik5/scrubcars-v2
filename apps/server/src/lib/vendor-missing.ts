/**
 * What a garage still owes us (0059): the Garages list's Missing chips, the
 * WhatsApp ask to its owner and a collection list's checklist. Worked out
 * from the garage's own data every time, never stored, so a key vanishes as
 * soon as the garage is filled in (and a collection item turns "cleared").
 *
 * Separate from `readiness` (lib/vendor-readiness.ts), on purpose: that
 * checklist is about whether customers can book, and a @p0 test pins it
 * exactly. These keys are about what to ask the owner for.
 *
 * Twin: packages/core/src/onboarding-marks.ts (MISSING_KEYS, the labels,
 * tabs and asks). vendor-missing.parity.test.ts keeps the keys the same.
 * Pure, so every rule is pinned by vendor-missing.test.ts.
 */

import type { DocumentsSummary } from './vendor-documents.js'

/** In this order everywhere: chips, messages and checklists. */
export const MISSING_KEYS = [
  'photos',
  'logo',
  'map_pin',
  'radius_default',
  'bays',
  'hours',
  'services',
  'prices',
  'documents',
  'payout',
] as const
export type MissingKey = (typeof MISSING_KEYS)[number]

export function isMissingKey(value: unknown): value is MissingKey {
  return (
    typeof value === 'string' &&
    (MISSING_KEYS as readonly string[]).includes(value)
  )
}

/** The chip and checklist words, as in the apps: "Map pin". */
export const MISSING_LABELS: Record<MissingKey, string> = {
  photos: 'Photos',
  logo: 'Logo',
  map_pin: 'Map pin',
  radius_default: 'Doorstep radius',
  bays: 'Bays',
  hours: 'Hours',
  services: 'Services',
  prices: 'Prices',
  documents: 'Documents',
  payout: 'Payout details',
}

/** A mark or a collection item: a missing key, or the team's own (with a label). */
export const MARK_KINDS = [...MISSING_KEYS, 'custom'] as const
export type MarkKind = (typeof MARK_KINDS)[number]

/**
 * What a mark or collection item is called: its own label when it has one,
 * else its missing key's. A custom one always has a label (a CHECK); 'Mark'
 * only covers a bad row. The twin of core's markLabel.
 */
export function markLabel(
  kind: string,
  label: string | null | undefined
): string {
  const own = label?.trim()
  if (own) return own
  return isMissingKey(kind) ? MISSING_LABELS[kind] : 'Mark'
}

/** A garage's live plain service (active, packages left out), as priced. */
export interface MissingService {
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  /** Decimal columns arrive as strings. */
  price: string | number | null
  priceHatchback: string | number | null
  priceSedan: string | number | null
  priceSuv: string | number | null
}

/** What the rules read about one garage. */
export interface MissingInput {
  photoCount: number
  logoUrl: string | null
  lat: number | null
  lng: number | null
  doorstepEnabled: boolean
  doorstepRadiusKm: number | null
  /** The garage drew its own doorstep area, which then replaces the radius. */
  hasDoorstepArea: boolean
  bays: number | null
  /** Its weekly rows. A day with no row is closed, as slots.ts reads it. */
  workingHours: ReadonlyArray<{ isClosed: boolean }>
  services: ReadonlyArray<MissingService>
  /** Null while garage documents are off (R2_DOCS_BUCKET unset): nothing to ask. */
  documents: Pick<DocumentsSummary, 'missingRequired' | 'rejected'> | null
  /** A payout account with (account number and IFSC) or a UPI id. */
  hasPayout: boolean
}

/** A price that is not there: null, empty, not a number, or 0 and below. */
function unpriced(value: string | number | null): boolean {
  if (value === null || value === '') return true
  const n = typeof value === 'number' ? value : Number(value)
  return !Number.isFinite(n) || n <= 0
}

/** A service customers can't be charged for as it stands. */
export function serviceUnpriced(service: MissingService): boolean {
  if (unpriced(service.price)) return true
  return (
    service.pricingType === 'per_vehicle' &&
    (unpriced(service.priceHatchback) ||
      unpriced(service.priceSedan) ||
      unpriced(service.priceSuv))
  )
}

/** Whether a payout account row is usable: bank (number and IFSC) or UPI. */
export function payoutUsable(
  account:
    | {
        accountNumber: string | null
        ifsc: string | null
        upiId: string | null
      }
    | null
    | undefined
): boolean {
  if (!account) return false
  const bank = Boolean(account.accountNumber?.trim() && account.ifsc?.trim())
  return bank || Boolean(account.upiId?.trim())
}

/** The garage's missing keys, in MISSING_KEYS order. */
export function vendorMissing(v: MissingInput): MissingKey[] {
  const missing = new Set<MissingKey>()
  if (v.photoCount === 0) missing.add('photos')
  if (!v.logoUrl) missing.add('logo')
  if (v.lat === null || v.lng === null) missing.add('map_pin')
  // A drawn area replaces the radius, so it is not missing then.
  if (v.doorstepEnabled && v.doorstepRadiusKm == null && !v.hasDoorstepArea)
    missing.add('radius_default')
  if (!v.bays) missing.add('bays')
  if (!v.workingHours.some((day) => !day.isClosed)) missing.add('hours')
  if (v.services.length === 0) missing.add('services')
  else if (v.services.some(serviceUnpriced)) missing.add('prices')
  if (v.documents && v.documents.missingRequired + v.documents.rejected > 0)
    missing.add('documents')
  if (!v.hasPayout) missing.add('payout')
  return MISSING_KEYS.filter((key) => missing.has(key))
}
