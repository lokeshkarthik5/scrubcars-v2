/**
 * The pickup fee's maths (0079), the server's copy. The apps' copy is
 * packages/core/src/pickup-fee-maths.ts; the server does not depend on
 * @repo/core, so the rules live in both. Everything below the marker line
 * must stay byte for byte the same in both: pickup-fee.parity.test.ts
 * compares the two files and runs both over the same grid of distances.
 * Change one, copy it to the other.
 *
 * No imports, no words, no clock: plain numbers in, plain numbers out.
 */

// ── shared below: keep identical in apps/server/src/lib/pickup-fee-maths.ts ──

/** Free (the default, and how pickup worked before 0079), one fee, or by road km. */
export const PICKUP_FEE_MODES = ['free', 'fixed', 'distance'] as const
export type PickupFeeMode = (typeof PICKUP_FEE_MODES)[number]

export function isPickupFeeMode(value: unknown): value is PickupFeeMode {
  return typeof value === 'string' && (PICKUP_FEE_MODES as readonly string[]).includes(value)
}

/** A "By distance" fee's four numbers. */
export interface DistanceNumbers {
  /** Road km with no fee. */
  freeKm: number
  /** ₹ for each road km after the free part. */
  perKm: number
  /** The lowest fee, whenever one is charged at all. */
  minCharge: number
  /** The highest fee, however far. */
  maxCharge: number
}

/** Detlio's suggested fee: what "By distance" starts on and every Ask for pickup suggests. */
export interface SuggestedFormula extends DistanceNumbers {
  /** Fees are rounded to the nearest this many rupees (₹110, not ₹107). */
  roundTo: number
  /** Straight-line km from the garage's pin × this = road km. */
  roadFactor: number
}

export interface Range {
  min: number
  max: number
}

/** What garages may set, inside the hard caps. Admin-editable. */
export interface PickupFeeLimits {
  freeKm: Range
  perKm: Range
  minCharge: Range
  /** By distance's highest charge may be at most this. */
  maxCharge: number
  /** A fixed fee may be at most this. */
  fixedMax: number
  /** Ask for pickup: how far above the suggestion a garage may go, in %. */
  askRaisePct: number
  /** A garage may change its own fee once in this many days. */
  changeEveryDays: number
}

/** Admin Settings → Pickup fee, as stored (admin_settings 'pickup_fee'). */
export interface PickupFeeSettings {
  suggested: SuggestedFormula
  limits: PickupFeeLimits
  /** Detlio's own fee on each booking, in ₹. 0 is off: customers see nothing. */
  convenienceFee: number
}

/**
 * The hard caps (owner, 15 Nov 2026). The server refuses anything outside
 * them whatever admin sets; admin's limits must sit inside them.
 */
export const PICKUP_FEE_HARD_CAPS = {
  freeKm: { min: 0, max: 5 },
  perKm: { min: 5, max: 30 },
  minCharge: { min: 49, max: 149 },
  maxCharge: 599,
  fixedMax: 299,
  askRaisePct: { min: 0, max: 50 },
  changeEveryDays: { min: 1, max: 30 },
  roadFactor: { min: 1, max: 2 },
  roundTo: [1, 5, 10] as readonly number[],
  convenienceFee: { min: 0, max: 99 },
} as const

export const DEFAULT_PICKUP_FEE_SETTINGS: PickupFeeSettings = {
  suggested: { freeKm: 3, perKm: 15, minCharge: 99, maxCharge: 399, roundTo: 10, roadFactor: 1.3 },
  limits: {
    freeKm: { min: 0, max: 5 },
    perKm: { min: 5, max: 30 },
    minCharge: { min: 49, max: 149 },
    maxCharge: 599,
    fixedMax: 299,
    askRaisePct: 25,
    changeEveryDays: 7,
  },
  convenienceFee: 0,
}

/** The road distances the preview tables show. */
export const PICKUP_FEE_PREVIEW_KM = [2, 5, 10, 15, 25, 30] as const

/** A garage's own choice, as stored on the garage. A null distance number is Detlio's. */
export interface GaragePickupFee {
  mode: PickupFeeMode
  fixed: number | null
  freeKm: number | null
  perKm: number | null
  minCharge: number | null
  maxCharge: number | null
}

/** The default: Free, as every garage was before 0079. */
export const FREE_PICKUP_FEE: GaragePickupFee = {
  mode: 'free',
  fixed: null,
  freeKm: null,
  perKm: null,
  minCharge: null,
  maxCharge: null,
}

/** A fee fully worked out: everything a screen or the server needs to price one address. */
export interface PickupFeePlan extends DistanceNumbers {
  mode: PickupFeeMode
  /** The fixed fee; 0 unless mode is 'fixed'. */
  fixed: number
  roundTo: number
  roadFactor: number
}

/** Detlio's suggested fee as a plan (By distance). */
export function detlioPlan(settings: PickupFeeSettings): PickupFeePlan {
  const s = settings.suggested
  return {
    mode: 'distance',
    fixed: 0,
    freeKm: s.freeKm,
    perKm: s.perKm,
    minCharge: s.minCharge,
    maxCharge: s.maxCharge,
    roundTo: s.roundTo,
    roadFactor: s.roadFactor,
  }
}

/** The garage's own choice as a plan, Detlio's numbers filling any it left empty. */
export function garagePlan(fee: GaragePickupFee, settings: PickupFeeSettings): PickupFeePlan {
  const s = settings.suggested
  return {
    mode: fee.mode,
    fixed: fee.mode === 'fixed' ? (fee.fixed ?? 0) : 0,
    freeKm: fee.freeKm ?? s.freeKm,
    perKm: fee.perKm ?? s.perKm,
    minCharge: fee.minCharge ?? s.minCharge,
    maxCharge: fee.maxCharge ?? s.maxCharge,
    roundTo: s.roundTo,
    roadFactor: s.roadFactor,
  }
}

/** What decides the fee customers see. */
export interface GarageFeeState {
  fee: GaragePickupFee
  /** A fee above Detlio's suggestion, not checked yet. */
  waiting: boolean
  /** Admin's "Lock to Detlio's fee". */
  locked: boolean
}

/**
 * The fee customers see: Detlio's while the garage is locked to it or its
 * fee above the suggestion waits for a check; otherwise the garage's own.
 */
export function livePlan(state: GarageFeeState, settings: PickupFeeSettings): PickupFeePlan {
  if (state.locked || state.waiting) return detlioPlan(settings)
  return garagePlan(state.fee, settings)
}

/** Road km from straight-line km, to one decimal: what the fee and the screens use. */
export function roadKmFor(straightKm: number, roadFactor: number): number {
  return Math.round(straightKm * roadFactor * 10) / 10
}

/**
 * The fee for one road distance, before the service-price cap. By distance:
 * nothing inside the free km, then per km, rounded to the nearest `roundTo`
 * (halves up), then at least the lowest and at most the highest charge.
 * Worked in tenths of a km and whole rupees, so no float drifts a fee.
 */
export function feeAtRoadKm(plan: PickupFeePlan, roadKm: number): number {
  if (plan.mode === 'free') return 0
  if (plan.mode === 'fixed') return Math.max(0, Math.round(plan.fixed))
  const tenths = Math.round(roadKm * 10)
  const freeTenths = Math.round(plan.freeKm * 10)
  if (tenths <= freeTenths) return 0
  const step = plan.roundTo > 0 ? plan.roundTo : 1
  const rounded = Math.round(((tenths - freeTenths) * plan.perKm) / (10 * step)) * step
  return Math.min(plan.maxCharge, Math.max(plan.minCharge, rounded))
}

/**
 * The pickup fee for an address `straightKm` from the garage's pin, and the
 * road km it was worked out on. Never more than the booking's service price
 * (`servicePrice`, whole rupees down; null when not known yet).
 */
export function tripFee(
  plan: PickupFeePlan,
  straightKm: number,
  servicePrice: number | null = null
): { roadKm: number; fee: number } {
  const roadKm = roadKmFor(straightKm, plan.roadFactor)
  const fee = feeAtRoadKm(plan, roadKm)
  return { roadKm, fee: servicePrice === null ? fee : Math.max(0, Math.min(fee, Math.floor(servicePrice))) }
}

/** How far the "above Detlio's suggestion" check looks, in road km. */
const COMPARE_UP_TO_TENTHS = 1000

/**
 * Whether a garage's choice charges more than Detlio's suggestion anywhere
 * (road km 0 to 100, every 0.1 km). Such a fee waits for Detlio; one at or
 * below it goes live at once. Free never does.
 */
export function isAboveSuggestion(fee: GaragePickupFee, settings: PickupFeeSettings): boolean {
  if (fee.mode === 'free') return false
  const mine = garagePlan(fee, settings)
  const detlio = detlioPlan(settings)
  for (let tenths = 0; tenths <= COMPARE_UP_TO_TENTHS; tenths++) {
    if (feeAtRoadKm(mine, tenths / 10) > feeAtRoadKm(detlio, tenths / 10)) return true
  }
  return false
}

/** Which box a limit problem is about. */
export type PickupFeeField = 'fixed' | 'freeKm' | 'perKm' | 'minCharge' | 'maxCharge'

export type PickupFeeProblem =
  | { field: 'fixed'; code: 'FIXED_REQUIRED' | 'FIXED_TOO_HIGH'; max: number }
  | { field: 'freeKm' | 'perKm' | 'minCharge'; code: 'OUT_OF_RANGE'; min: number; max: number }
  | { field: 'maxCharge'; code: 'MAX_TOO_HIGH'; max: number }
  | { field: 'maxCharge'; code: 'MAX_BELOW_MIN'; min: number }

function wholeIn(value: number | null, range: Range): boolean {
  return value !== null && Number.isFinite(value) && value >= range.min && value <= range.max
}

/**
 * What is outside the limits in a garage's (or admin's) choice; empty when
 * it is fine. Fixed: a whole ₹1 to the fixed limit. By distance: each
 * number inside its range (an empty one is Detlio's, which is), the highest
 * charge at least the lowest. Free has nothing to check.
 */
export function pickupFeeProblems(fee: GaragePickupFee, settings: PickupFeeSettings): PickupFeeProblem[] {
  const limits = settings.limits
  const problems: PickupFeeProblem[] = []
  if (fee.mode === 'fixed') {
    if (fee.fixed === null || !Number.isInteger(fee.fixed) || fee.fixed < 1) {
      problems.push({ field: 'fixed', code: 'FIXED_REQUIRED', max: limits.fixedMax })
    } else if (fee.fixed > limits.fixedMax) {
      problems.push({ field: 'fixed', code: 'FIXED_TOO_HIGH', max: limits.fixedMax })
    }
  }
  if (fee.mode === 'distance') {
    const plan = garagePlan(fee, settings)
    if (!wholeIn(plan.freeKm, limits.freeKm) || Math.round(plan.freeKm * 10) !== plan.freeKm * 10) {
      problems.push({ field: 'freeKm', code: 'OUT_OF_RANGE', ...limits.freeKm })
    }
    if (!wholeIn(plan.perKm, limits.perKm) || !Number.isInteger(plan.perKm)) {
      problems.push({ field: 'perKm', code: 'OUT_OF_RANGE', ...limits.perKm })
    }
    if (!wholeIn(plan.minCharge, limits.minCharge) || !Number.isInteger(plan.minCharge)) {
      problems.push({ field: 'minCharge', code: 'OUT_OF_RANGE', ...limits.minCharge })
    }
    if (!Number.isInteger(plan.maxCharge) || plan.maxCharge > limits.maxCharge) {
      problems.push({ field: 'maxCharge', code: 'MAX_TOO_HIGH', max: limits.maxCharge })
    } else if (plan.maxCharge < plan.minCharge) {
      problems.push({ field: 'maxCharge', code: 'MAX_BELOW_MIN', min: plan.minCharge })
    }
  }
  return problems
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When the garage may change its own fee again: `changeEveryDays` after its
 * last change, or now (null) when it never has. Detlio's changes don't count.
 */
export function nextGarageChangeAt(lastGarageChangeAt: Date | null, changeEveryDays: number): Date | null {
  if (!lastGarageChangeAt) return null
  return new Date(lastGarageChangeAt.getTime() + changeEveryDays * DAY_MS)
}

/** Whether the garage may change its fee now (the 7-day rule). */
export function garageMayChange(lastGarageChangeAt: Date | null, changeEveryDays: number, now: Date): boolean {
  const next = nextGarageChangeAt(lastGarageChangeAt, changeEveryDays)
  return next === null || now.getTime() >= next.getTime()
}

/**
 * Ask for pickup (and Request a visit): the most a garage may ask, from
 * Detlio's suggestion — up to `askRaisePct` more, rounded down to the
 * rounding step, never past the highest-charge limit or the service price,
 * never below the suggestion. Nothing to ask when the suggestion is free.
 */
export function askMaxFee(suggestion: number, settings: PickupFeeSettings, servicePrice: number | null = null): number {
  if (suggestion <= 0) return 0
  const step = settings.suggested.roundTo > 0 ? settings.suggested.roundTo : 1
  const raised = Math.floor((suggestion * (100 + settings.limits.askRaisePct)) / 100 / step) * step
  let max = Math.min(raised, settings.limits.maxCharge)
  if (servicePrice !== null) max = Math.min(max, Math.floor(servicePrice))
  return Math.max(suggestion, max)
}

/** The fee chips on the garage's request card: the suggestion, then up to three steps to the most. */
export function askFeeChoices(suggestion: number, max: number, roundTo: number): number[] {
  const choices = [suggestion]
  if (max <= suggestion) return choices
  const step = roundTo > 0 ? roundTo : 1
  for (let k = 1; k <= 3; k++) {
    const value = Math.min(max, Math.round((suggestion + ((max - suggestion) * k) / 3) / step) * step)
    if (value > choices[choices.length - 1]!) choices.push(value)
  }
  if (choices[choices.length - 1] !== max) choices.push(max)
  return choices
}

/** Whether a garage's yes asks an allowed fee: a whole ₹0 up to the most. */
export function isAllowedAskFee(fee: number, max: number): boolean {
  return Number.isInteger(fee) && fee >= 0 && fee <= max
}

function numberIn(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * The stored settings over the defaults, field by field: a missing or
 * out-of-cap value is the default, so a row written by an older or newer
 * panel never breaks a price.
 */
export function parsePickupFeeSettings(value: unknown): PickupFeeSettings {
  const caps = PICKUP_FEE_HARD_CAPS
  const d = DEFAULT_PICKUP_FEE_SETTINGS
  const stored = objectOf(value)
  const sug = objectOf(stored.suggested)
  const lim = objectOf(stored.limits)
  const range = (raw: unknown, cap: Range, fallback: Range): Range => {
    const r = objectOf(raw)
    const min = numberIn(r.min, cap.min, cap.max)
    const max = numberIn(r.max, cap.min, cap.max)
    return min !== null && max !== null && min <= max ? { min, max } : { ...fallback }
  }
  const roundTo = caps.roundTo.includes(sug.roundTo as number) ? (sug.roundTo as number) : d.suggested.roundTo
  return {
    suggested: {
      freeKm: numberIn(sug.freeKm, caps.freeKm.min, caps.freeKm.max) ?? d.suggested.freeKm,
      perKm: numberIn(sug.perKm, caps.perKm.min, caps.perKm.max) ?? d.suggested.perKm,
      minCharge: numberIn(sug.minCharge, caps.minCharge.min, caps.minCharge.max) ?? d.suggested.minCharge,
      maxCharge: numberIn(sug.maxCharge, 1, caps.maxCharge) ?? d.suggested.maxCharge,
      roundTo,
      roadFactor: numberIn(sug.roadFactor, caps.roadFactor.min, caps.roadFactor.max) ?? d.suggested.roadFactor,
    },
    limits: {
      freeKm: range(lim.freeKm, caps.freeKm, d.limits.freeKm),
      perKm: range(lim.perKm, caps.perKm, d.limits.perKm),
      minCharge: range(lim.minCharge, caps.minCharge, d.limits.minCharge),
      maxCharge: numberIn(lim.maxCharge, 1, caps.maxCharge) ?? d.limits.maxCharge,
      fixedMax: numberIn(lim.fixedMax, 1, caps.fixedMax) ?? d.limits.fixedMax,
      askRaisePct: numberIn(lim.askRaisePct, caps.askRaisePct.min, caps.askRaisePct.max) ?? d.limits.askRaisePct,
      changeEveryDays:
        numberIn(lim.changeEveryDays, caps.changeEveryDays.min, caps.changeEveryDays.max) ?? d.limits.changeEveryDays,
    },
    convenienceFee: numberIn(stored.convenienceFee, caps.convenienceFee.min, caps.convenienceFee.max) ?? d.convenienceFee,
  }
}

/**
 * Why admin's settings can't be saved, as plain sentences; empty when they
 * can. Every number whole (km and the road factor may have one decimal),
 * inside the hard caps, ranges the right way round, and Detlio's own fee
 * inside the limits it sets for garages.
 */
export function pickupFeeSettingsProblems(s: PickupFeeSettings): string[] {
  const caps = PICKUP_FEE_HARD_CAPS
  const problems: string[] = []
  const whole = (n: number) => Number.isInteger(n)
  const tenth = (n: number) => Number.isFinite(n) && Math.round(n * 10) === n * 10
  const inside = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max
  const sug = s.suggested
  const lim = s.limits
  if (!tenth(sug.freeKm) || !inside(sug.freeKm, lim.freeKm.min, lim.freeKm.max)) {
    problems.push(`Free up to must be ${lim.freeKm.min}–${lim.freeKm.max} km.`)
  }
  if (!whole(sug.perKm) || !inside(sug.perKm, lim.perKm.min, lim.perKm.max)) {
    problems.push(`Then per km must be ₹${lim.perKm.min}–₹${lim.perKm.max}.`)
  }
  if (!whole(sug.minCharge) || !inside(sug.minCharge, lim.minCharge.min, lim.minCharge.max)) {
    problems.push(`Lowest charge must be ₹${lim.minCharge.min}–₹${lim.minCharge.max}.`)
  }
  if (!whole(sug.maxCharge) || !inside(sug.maxCharge, sug.minCharge, lim.maxCharge)) {
    problems.push(`Highest charge must be at least the lowest and at most ₹${lim.maxCharge}.`)
  }
  if (!caps.roundTo.includes(sug.roundTo)) problems.push('Round to the nearest ₹1, ₹5 or ₹10.')
  if (!tenth(sug.roadFactor) || !inside(sug.roadFactor, caps.roadFactor.min, caps.roadFactor.max)) {
    problems.push(`Road factor must be ${caps.roadFactor.min}–${caps.roadFactor.max}.`)
  }
  const range = (label: string, r: Range, cap: Range, unit: (n: number) => string) => {
    const ok = r.min <= r.max && inside(r.min, cap.min, cap.max) && inside(r.max, cap.min, cap.max)
    if (!ok) problems.push(`${label} limits must be within ${unit(cap.min)}–${unit(cap.max)}.`)
  }
  range('Free up to', lim.freeKm, caps.freeKm, (n) => `${n} km`)
  range('Per km', lim.perKm, caps.perKm, (n) => `₹${n}`)
  range('Lowest charge', lim.minCharge, caps.minCharge, (n) => `₹${n}`)
  if (!whole(lim.perKm.min) || !whole(lim.perKm.max) || !whole(lim.minCharge.min) || !whole(lim.minCharge.max)) {
    problems.push('Rupee limits must be whole rupees.')
  }
  if (!whole(lim.maxCharge) || !inside(lim.maxCharge, lim.minCharge.max, caps.maxCharge)) {
    problems.push(`Highest charge limit must be ₹${lim.minCharge.max}–₹${caps.maxCharge}.`)
  }
  if (!whole(lim.fixedMax) || !inside(lim.fixedMax, 1, caps.fixedMax)) {
    problems.push(`Fixed fee limit must be ₹1–₹${caps.fixedMax}.`)
  }
  if (!whole(lim.askRaisePct) || !inside(lim.askRaisePct, caps.askRaisePct.min, caps.askRaisePct.max)) {
    problems.push(`Ask for pickup must be ${caps.askRaisePct.min}–${caps.askRaisePct.max}%.`)
  }
  if (!whole(lim.changeEveryDays) || !inside(lim.changeEveryDays, caps.changeEveryDays.min, caps.changeEveryDays.max)) {
    problems.push(`Fee changes must be once in ${caps.changeEveryDays.min}–${caps.changeEveryDays.max} days.`)
  }
  if (!whole(s.convenienceFee) || !inside(s.convenienceFee, caps.convenienceFee.min, caps.convenienceFee.max)) {
    problems.push(`Convenience fee must be ₹${caps.convenienceFee.min}–₹${caps.convenienceFee.max}.`)
  }
  return problems
}

/**
 * Detlio's convenience fee on a booking: the setting, but never on a booking
 * with nothing else to pay (a free wash, an inspection with no fee, a free
 * redo), so a ₹0 booking stays ₹0.
 */
export function convenienceFeeFor(settings: PickupFeeSettings, chargeBeforeFee: number): number {
  return chargeBeforeFee > 0 ? settings.convenienceFee : 0
}
