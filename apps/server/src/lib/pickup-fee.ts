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
 *   - Who sets the fee: the garage, or Detlio (admin's lock). With Detlio
 *     the garage can't change it and the stored fee applies as Detlio left
 *     it: Detlio's suggestion, or any fee admin set for the garage.
 *   - Admin sets any garage's fee directly, inside the hard caps (not the
 *     garage limits): live at once, no check, the garage's 7 days untouched.
 *   - Each garage may have its own limits (admin's overrides; null is
 *     Detlio's default). The garage is checked against them, and every price
 *     is clamped to the limits that apply now (clampPlan), so narrowing them
 *     never lets a customer pay more than they allow.
 *   - The garage changes its own fee at most once every 7 days (a setting,
 *     or the garage's own); admin's changes don't count and need no check.
 *   - A booked fee never changes: it is locked on the booking (travel_fee).
 *   - The garage keeps the whole pickup fee; Detlio's convenience fee is
 *     never the garage's (lib/payouts.ts, lib/commission.ts).
 */

import {
  FREE_PICKUP_FEE,
  HARD_CAP_LIMITS,
  NO_LIMIT_OVERRIDES,
  clampPlan,
  detlioPlan as detlioPlanOf,
  garageMayChange,
  garageSettings,
  isAboveSuggestion,
  isPickupFeeMode,
  livePlan,
  needsApprovalOf,
  nextGarageChangeAt,
  pickupFeeProblems,
  type GaragePickupFee,
  type PickupFeeLimitOverrides,
  type PickupFeePlan,
  type PickupFeeProblem,
  type PickupFeeSettings,
  type Range,
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
  /** Who set the stored fee: the garage, or Detlio (admin's own fee). */
  pickupFeeSource: string
  pickupFeeLimitFreeKmMin: string | null
  pickupFeeLimitFreeKmMax: string | null
  pickupFeeLimitPerKmMin: string | null
  pickupFeeLimitPerKmMax: string | null
  pickupFeeLimitMinChargeMin: string | null
  pickupFeeLimitMinChargeMax: string | null
  pickupFeeLimitMaxCharge: string | null
  pickupFeeLimitFixedMax: string | null
  pickupFeeLimitAskRaisePct: number | null
  pickupFeeLimitChangeDays: number | null
  pickupFeeNeedsApproval: boolean | null
}

/** The limit columns alone: what Ask for pickup's suggestion needs of a garage. */
export type VendorLimitColumns = Pick<
  VendorFeeColumns,
  | 'pickupFeeLimitFreeKmMin'
  | 'pickupFeeLimitFreeKmMax'
  | 'pickupFeeLimitPerKmMin'
  | 'pickupFeeLimitPerKmMax'
  | 'pickupFeeLimitMinChargeMin'
  | 'pickupFeeLimitMinChargeMax'
  | 'pickupFeeLimitMaxCharge'
  | 'pickupFeeLimitFixedMax'
  | 'pickupFeeLimitAskRaisePct'
  | 'pickupFeeLimitChangeDays'
  | 'pickupFeeNeedsApproval'
>

const num = (value: string | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value)

/** The garage's stored choice. An unknown mode reads as Free, as before. */
export function garageFeeOf(
  row: Pick<VendorFeeColumns, 'pickupFeeMode' | 'pickupFeeFixed' | 'pickupFeeFreeKm' | 'pickupFeePerKm' | 'pickupFeeMin' | 'pickupFeeMax'>
): GaragePickupFee {
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

/** Admin's overrides of the garage limits for this garage (all null: Detlio's defaults). */
export function limitOverridesOf(row: VendorLimitColumns): PickupFeeLimitOverrides {
  // A row read without these columns (an older stand-in) is Detlio's defaults, never NaN limits.
  const pair = (min: string | null | undefined, max: string | null | undefined): Range | null =>
    min == null || max == null ? null : { min: Number(min), max: Number(max) }
  return {
    freeKm: pair(row.pickupFeeLimitFreeKmMin, row.pickupFeeLimitFreeKmMax),
    perKm: pair(row.pickupFeeLimitPerKmMin, row.pickupFeeLimitPerKmMax),
    minCharge: pair(row.pickupFeeLimitMinChargeMin, row.pickupFeeLimitMinChargeMax),
    maxCharge: num(row.pickupFeeLimitMaxCharge),
    fixedMax: num(row.pickupFeeLimitFixedMax),
    askRaisePct: row.pickupFeeLimitAskRaisePct ?? null,
    changeEveryDays: row.pickupFeeLimitChangeDays ?? null,
    needsApproval: row.pickupFeeNeedsApproval ?? null,
  }
}

/** The vendor columns for a garage's overrides. */
export function limitColumns(o: PickupFeeLimitOverrides) {
  const rupee = (value: number | null) => (value === null ? null : value.toFixed(2))
  return {
    pickupFeeLimitFreeKmMin: o.freeKm ? o.freeKm.min.toFixed(1) : null,
    pickupFeeLimitFreeKmMax: o.freeKm ? o.freeKm.max.toFixed(1) : null,
    pickupFeeLimitPerKmMin: rupee(o.perKm?.min ?? null),
    pickupFeeLimitPerKmMax: rupee(o.perKm?.max ?? null),
    pickupFeeLimitMinChargeMin: rupee(o.minCharge?.min ?? null),
    pickupFeeLimitMinChargeMax: rupee(o.minCharge?.max ?? null),
    pickupFeeLimitMaxCharge: rupee(o.maxCharge),
    pickupFeeLimitFixedMax: rupee(o.fixedMax),
    pickupFeeLimitAskRaisePct: o.askRaisePct,
    pickupFeeLimitChangeDays: o.changeEveryDays,
    pickupFeeNeedsApproval: o.needsApproval,
  }
}

/** The settings this garage is priced and checked by: Detlio's formula, its own limits. */
export function settingsForGarage(row: VendorLimitColumns, settings: PickupFeeSettings): PickupFeeSettings {
  return garageSettings(settings, limitOverridesOf(row))
}

/** Whether the stored fee is Detlio's own (admin set it, or kept Detlio's): held only to the hard caps. */
export function isDetlioSet(row: Pick<VendorFeeColumns, 'pickupFeeSource'>): boolean {
  return row.pickupFeeSource === 'detlio'
}

/**
 * The fee customers see for this garage now: Detlio's suggestion while the
 * garage's own fee waits for a check, else the stored fee; then clamped to
 * the limits that apply now (the garage's own, or the hard caps for a fee
 * Detlio set), so no customer pays more than they allow.
 */
export function livePlanOf(row: VendorFeeColumns, settings: PickupFeeSettings): PickupFeePlan {
  const mine = settingsForGarage(row, settings)
  const waiting = row.pickupFeeWaitingSince !== null
  const locked = row.pickupFeeLockedAt !== null
  const plan = livePlan({ fee: garageFeeOf(row), waiting, locked }, mine)
  const detlios = isDetlioSet(row) && !(waiting && !locked)
  return clampPlan(plan, detlios ? HARD_CAP_LIMITS : mine.limits)
}

/**
 * Detlio's suggestion for a trip to one garage (Ask for pickup, Request a
 * visit), clamped to that garage's limits (`garage`: settingsForGarage).
 */
export function suggestionPlan(garage: PickupFeeSettings): PickupFeePlan {
  return clampPlan(detlioPlanOf(garage), garage.limits)
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
  globalSettings: PickupFeeSettings,
  now: Date
): GarageChangePlan {
  if (current.pickupFeeLockedAt) {
    return {
      ok: false,
      code: 'PICKUP_FEE_LOCKED',
      status: 409,
      message: 'Set by Detlio. Ask Detlio to change it.',
    }
  }
  // The garage's own limits, days and approval rule (Detlio's defaults where admin set none).
  const settings = settingsForGarage(current, globalSettings)
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
  const waits = needsApprovalOf(limitOverridesOf(current)) && isAboveSuggestion(fee, settings)
  return { ok: true, fee, status: waits ? 'waiting' : 'live' }
}

/**
 * Admin's own fee for a garage: any mode, any numbers inside the hard caps
 * (never the garage limits: admin is the check). No approval, no 7-day rule.
 */
export function adminFeeProblems(requested: GaragePickupFee, settings: PickupFeeSettings): PickupFeeProblem[] {
  return pickupFeeProblems(requested, { ...settings, limits: HARD_CAP_LIMITS })
}

/**
 * The vendor columns a garage's own change writes: its fee, waiting or not,
 * the garage as its source, and its 7-day clock restarted.
 */
export function garageChangeColumns(fee: GaragePickupFee, status: 'live' | 'waiting', now: Date) {
  return {
    ...feeColumns(fee),
    pickupFeeSource: 'garage' as const,
    pickupFeeWaitingSince: status === 'waiting' ? now : null,
    pickupFeeChangedAt: now,
  }
}

/**
 * The vendor columns admin's own fee writes: the fee, live at once, Detlio
 * as its source. Never `pickupFeeChangedAt`: Detlio's change neither uses up
 * nor restarts the garage's 7 days.
 */
export function adminFeeColumns(fee: GaragePickupFee) {
  return { ...feeColumns(fee), pickupFeeSource: 'detlio' as const, pickupFeeWaitingSince: null }
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

/** The JSON a 'limits' change row keeps. */
export function limitsSnapshot(o: PickupFeeLimitOverrides): Record<string, unknown> {
  return { ...NO_LIMIT_OVERRIDES, ...o }
}
