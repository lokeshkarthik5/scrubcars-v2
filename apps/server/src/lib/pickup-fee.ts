/**
 * The pickup fee (0079, owner-approved screens, 15 Nov 2026): the server's
 * rules on top of the shared maths (lib/pickup-fee-maths.ts, the apps' copy
 * in packages/core). Pure, so every checkpoint is pinned by
 * pickup-fee.test.ts:
 *
 *   - Free is the default and today's behaviour; a garage picks a fixed fee
 *     or By distance within the limits (the hard caps whatever admin says).
 *   - Approval: a fee at or below Detlio's suggestion goes live at once; one
 *     above it waits (Issues → Pickup fees) and customers see Detlio's fee.
 *   - Lock: admin's "Lock to Detlio's fee"; the garage can't change it.
 *   - The garage changes its own fee at most once every 7 days (a setting);
 *     admin's changes don't count and need no check.
 *   - A booked fee never changes: it is locked on the booking (travel_fee).
 *   - The garage keeps the whole pickup fee; Detlio's convenience fee is
 *     never the garage's (lib/payouts.ts, lib/commission.ts).
 */

import {
  FREE_PICKUP_FEE,
  garageMayChange,
  isAboveSuggestion,
  isPickupFeeMode,
  livePlan,
  nextGarageChangeAt,
  pickupFeeProblems,
  type GaragePickupFee,
  type PickupFeePlan,
  type PickupFeeProblem,
  type PickupFeeSettings,
} from './pickup-fee-maths.js'

export * from './pickup-fee-maths.js'

/** The vendor columns the fee lives in. */
export interface VendorFeeColumns {
  pickupFeeMode: string
  pickupFeeFixed: string | null
  pickupFeeFreeKm: string | null
  pickupFeePerKm: string | null
  pickupFeeMin: string | null
  pickupFeeMax: string | null
  pickupFeeWaitingSince: Date | null
  pickupFeeLockedAt: Date | null
  pickupFeeChangedAt?: Date | null
}

const num = (value: string | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value)

/** The garage's stored choice. An unknown mode reads as Free, as before. */
export function garageFeeOf(row: VendorFeeColumns): GaragePickupFee {
  if (!isPickupFeeMode(row.pickupFeeMode) || row.pickupFeeMode === 'free') return { ...FREE_PICKUP_FEE }
  return {
    mode: row.pickupFeeMode,
    fixed: row.pickupFeeMode === 'fixed' ? num(row.pickupFeeFixed) : null,
    freeKm: row.pickupFeeMode === 'distance' ? num(row.pickupFeeFreeKm) : null,
    perKm: row.pickupFeeMode === 'distance' ? num(row.pickupFeePerKm) : null,
    minCharge: row.pickupFeeMode === 'distance' ? num(row.pickupFeeMin) : null,
    maxCharge: row.pickupFeeMode === 'distance' ? num(row.pickupFeeMax) : null,
  }
}

/** The fee customers see for this garage now. */
export function livePlanOf(row: VendorFeeColumns, settings: PickupFeeSettings): PickupFeePlan {
  return livePlan(
    { fee: garageFeeOf(row), waiting: row.pickupFeeWaitingSince !== null, locked: row.pickupFeeLockedAt !== null },
    settings
  )
}

/**
 * A choice as it is stored: numbers equal to Detlio's are kept empty, so the
 * garage follows Detlio's formula when admin changes it; the other mode's
 * numbers are cleared.
 */
export function normaliseFee(fee: GaragePickupFee, settings: PickupFeeSettings): GaragePickupFee {
  if (fee.mode === 'free') return { ...FREE_PICKUP_FEE }
  if (fee.mode === 'fixed') return { ...FREE_PICKUP_FEE, mode: 'fixed', fixed: fee.fixed }
  const s = settings.suggested
  const keep = (value: number | null, detlio: number) => (value === null || value === detlio ? null : value)
  return {
    mode: 'distance',
    fixed: null,
    freeKm: keep(fee.freeKm, s.freeKm),
    perKm: keep(fee.perKm, s.perKm),
    minCharge: keep(fee.minCharge, s.minCharge),
    maxCharge: keep(fee.maxCharge, s.maxCharge),
  }
}

/** The vendor columns for a choice. */
export function feeColumns(fee: GaragePickupFee) {
  const text = (value: number | null) => (value === null ? null : value.toFixed(2))
  return {
    pickupFeeMode: fee.mode,
    pickupFeeFixed: text(fee.fixed),
    pickupFeeFreeKm: fee.freeKm === null ? null : fee.freeKm.toFixed(1),
    pickupFeePerKm: text(fee.perKm),
    pickupFeeMin: text(fee.minCharge),
    pickupFeeMax: text(fee.maxCharge),
  }
}

export function sameFee(a: GaragePickupFee, b: GaragePickupFee): boolean {
  return (
    a.mode === b.mode &&
    a.fixed === b.fixed &&
    a.freeKm === b.freeKm &&
    a.perKm === b.perKm &&
    a.minCharge === b.minCharge &&
    a.maxCharge === b.maxCharge
  )
}

export type GarageChangeRefusal =
  | { code: 'PICKUP_FEE_LOCKED'; status: 409; message: string }
  | { code: 'PICKUP_FEE_TOO_SOON'; status: 409; message: string; nextChangeAt: Date }
  | { code: 'PICKUP_FEE_OUT_OF_LIMITS'; status: 400; message: string; problems: PickupFeeProblem[] }
  | { code: 'PICKUP_FEE_UNCHANGED'; status: 409; message: string }

export type GarageChangePlan =
  | { ok: true; fee: GaragePickupFee; status: 'live' | 'waiting' }
  | ({ ok: false } & GarageChangeRefusal)

/**
 * What the garage's own change does: refused while locked, within 7 days of
 * its last change, outside the limits, or when nothing changed; otherwise it
 * goes live at once, or waits for Detlio when it is above the suggestion.
 */
export function planGarageChange(
  current: VendorFeeColumns,
  requested: GaragePickupFee,
  settings: PickupFeeSettings,
  now: Date
): GarageChangePlan {
  if (current.pickupFeeLockedAt) {
    return {
      ok: false,
      code: 'PICKUP_FEE_LOCKED',
      status: 409,
      message: 'Detlio has set your pickup fee. To change it, call Detlio support.',
    }
  }
  const last = current.pickupFeeChangedAt ?? null
  if (!garageMayChange(last, settings.limits.changeEveryDays, now)) {
    const nextChangeAt = nextGarageChangeAt(last, settings.limits.changeEveryDays)!
    return {
      ok: false,
      code: 'PICKUP_FEE_TOO_SOON',
      status: 409,
      message: `You can change your fee once every ${settings.limits.changeEveryDays} days. Your next change: from ${istDayLabel(nextChangeAt)}.`,
      nextChangeAt,
    }
  }
  const problems = pickupFeeProblems(requested, settings)
  if (problems.length > 0) {
    return { ok: false, code: 'PICKUP_FEE_OUT_OF_LIMITS', status: 400, message: problemMessage(problems[0]!), problems }
  }
  const fee = normaliseFee(requested, settings)
  if (sameFee(fee, garageFeeOf(current)) && current.pickupFeeWaitingSince === null) {
    return { ok: false, code: 'PICKUP_FEE_UNCHANGED', status: 409, message: 'That is already your fee.' }
  }
  return { ok: true, fee, status: isAboveSuggestion(fee, settings) ? 'waiting' : 'live' }
}

/** Admin's set or override: within the limits, no check, no 7-day rule. */
export function adminFeeProblems(requested: GaragePickupFee, settings: PickupFeeSettings): PickupFeeProblem[] {
  return pickupFeeProblems(requested, settings)
}

/** A limit problem as one sentence (the apps show their own words under each box). */
export function problemMessage(problem: PickupFeeProblem): string {
  switch (problem.code) {
    case 'FIXED_REQUIRED':
      return `Type a fixed fee of ₹1 to ₹${problem.max}.`
    case 'FIXED_TOO_HIGH':
      return `Up to ₹${problem.max} for a fixed fee. That’s Detlio’s limit.`
    case 'OUT_OF_RANGE': {
      const name = problem.field === 'freeKm' ? 'Free up to' : problem.field === 'perKm' ? 'Then per km' : 'Lowest charge'
      const range = problem.field === 'freeKm' ? `${problem.min}–${problem.max} km` : `₹${problem.min}–₹${problem.max}`
      return `${name} must be ${range}.`
    }
    case 'MAX_TOO_HIGH':
      return `Highest charge: up to ₹${problem.max}.`
    case 'MAX_BELOW_MIN':
      return `Highest charge must be at least the lowest charge (₹${problem.min}).`
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "22 Nov" in IST. */
export function istDayLabel(at: Date): string {
  const ist = new Date(at.getTime() + (5 * 60 + 30) * 60_000)
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`
}

/** The JSON a change row keeps for a fee. */
export function feeSnapshot(fee: GaragePickupFee): Record<string, unknown> {
  return { ...fee }
}
