import {
  DEFAULT_PICKUP_FEE_SETTINGS,
  feeAtRoadKm,
  garagePlan,
  type GaragePickupFee,
  type PickupFeeSettings,
  type SuggestedFormula,
} from '@repo/core/pickup-fee-maths'

/**
 * Issues → Pickup fees and the garage editor's pickup card (0079): the
 * panel's own words for a fee. Pure, tested by pickup-fees.test.ts.
 */

export const PICKUP_FEE_CHECK_FILTERS = ['waiting', 'approved', 'kept'] as const
export type PickupFeeCheckFilter = (typeof PICKUP_FEE_CHECK_FILTERS)[number]

export const PICKUP_FEE_CHECK_LABELS: Record<PickupFeeCheckFilter, string> = {
  waiting: 'Waiting',
  approved: 'Approved',
  kept: 'Kept Detlio’s fee',
}

export function parsePickupFeeFilter(value: string | null): PickupFeeCheckFilter {
  return (PICKUP_FEE_CHECK_FILTERS as readonly string[]).includes(value ?? '') ? (value as PickupFeeCheckFilter) : 'waiting'
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
const km = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Settings with only the formula known: what the panel needs to price a fee. */
export function withFormula(suggested: SuggestedFormula): PickupFeeSettings {
  return { ...DEFAULT_PICKUP_FEE_SETTINGS, suggested }
}

/** "Free 3 km · ₹15/km · ₹99–₹399". */
export function detlioSummary(s: SuggestedFormula): string {
  return `Free ${km(s.freeKm)} km · ${rupees(s.perKm)}/km · ${rupees(s.minCharge)}–${rupees(s.maxCharge)}`
}

/** "By distance · free 3 km · ₹20/km · ₹99–₹399", "Fixed fee · ₹250 for any pickup", "Free". */
export function feeSummaryLine(fee: GaragePickupFee, suggested: SuggestedFormula): string {
  if (fee.mode === 'free') return 'Free'
  if (fee.mode === 'fixed') return `Fixed fee · ${rupees(fee.fixed ?? 0)} for any pickup`
  const p = garagePlan(fee, withFormula(suggested))
  return `By distance · free ${km(p.freeKm)} km · ${rupees(p.perKm)}/km · ${rupees(p.minCharge)}–${rupees(p.maxCharge)}`
}

/**
 * The sample distances a check card compares at, with Detlio's and the
 * garage's fee at each: 2–25 km for a fixed fee (where it differs most), 5–30
 * km otherwise (2 km is free for both).
 */
export function checkColumns(fee: GaragePickupFee, suggested: SuggestedFormula) {
  const settings = withFormula(suggested)
  const kms = fee.mode === 'fixed' ? [2, 5, 10, 15, 25] : [5, 10, 15, 25, 30]
  const detlio = garagePlan({ ...fee, mode: 'distance', freeKm: null, perKm: null, minCharge: null, maxCharge: null }, settings)
  const garage = garagePlan(fee, settings)
  return {
    kms,
    detlio: kms.map((k) => feeAtRoadKm(detlio, k)),
    garage: kms.map((k) => feeAtRoadKm(garage, k)),
  }
}

/**
 * A logged change in a few words, as the garage card lists it: "By
 * distance: ₹15 → ₹20 per km", "Free → By distance (Detlio’s fee)", "Locked
 * to Detlio’s fee".
 */
export function changeLine(
  change: { kind: 'fee' | 'locked' | 'unlocked'; before: GaragePickupFee; after: GaragePickupFee },
  suggested: SuggestedFormula
): string {
  if (change.kind === 'locked') return 'Locked to Detlio’s fee'
  if (change.kind === 'unlocked') return 'Unlocked: the garage can set its fee again'
  const s = withFormula(suggested)
  const isDetlios = (f: GaragePickupFee) =>
    f.mode === 'distance' && f.freeKm === null && f.perKm === null && f.minCharge === null && f.maxCharge === null
  const name = (f: GaragePickupFee) =>
    isDetlios(f) ? 'By distance (Detlio’s fee)' : f.mode === 'fixed' ? `Fixed fee ${rupees(f.fixed ?? 0)}` : f.mode === 'free' ? 'Free' : 'By distance'
  const { before, after } = change
  if (before.mode !== after.mode) return `${name(before)} → ${name(after)}`
  if (after.mode === 'fixed') return `Fixed fee: ${rupees(before.fixed ?? 0)} → ${rupees(after.fixed ?? 0)}`
  if (after.mode === 'free') return 'Free'
  const a = garagePlan(before, s)
  const b = garagePlan(after, s)
  const parts: string[] = []
  if (a.freeKm !== b.freeKm) parts.push(`free ${km(a.freeKm)} → ${km(b.freeKm)} km`)
  if (a.perKm !== b.perKm) parts.push(`${rupees(a.perKm)} → ${rupees(b.perKm)} per km`)
  if (a.minCharge !== b.minCharge) parts.push(`lowest ${rupees(a.minCharge)} → ${rupees(b.minCharge)}`)
  if (a.maxCharge !== b.maxCharge) parts.push(`highest ${rupees(a.maxCharge)} → ${rupees(b.maxCharge)}`)
  return isDetlios(after) && parts.length === 0 ? 'By distance (Detlio’s fee)' : `By distance: ${parts.join(', ') || 'no change'}`
}
