import {
  DEFAULT_PICKUP_FEE_SETTINGS,
  NO_LIMIT_OVERRIDES,
  feeAtRoadKm,
  garagePlan,
  type GaragePickupFee,
  type PickupFeeLimitOverrides,
  type PickupFeeLimits,
  type PickupFeePlan,
  type PickupFeeSettings,
  type Range,
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
  change: {
    kind: 'fee' | 'locked' | 'unlocked' | 'limits'
    before: GaragePickupFee
    after: GaragePickupFee
    limits?: { before: PickupFeeLimitOverrides; after: PickupFeeLimitOverrides } | null
  },
  suggested: SuggestedFormula
): string {
  if (change.kind === 'limits') return change.limits ? limitsChangeLine(change.limits.before, change.limits.after) : 'Limits changed'
  if (change.kind === 'locked') {
    const kept = JSON.stringify(change.before) === JSON.stringify(change.after)
    return kept ? 'Set by Detlio: the garage can’t change its fee' : `Set by Detlio: ${feeSummaryLine(change.after, suggested)}`
  }
  if (change.kind === 'unlocked') return 'Set by the garage: it can change its fee again'
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

/** The fee that applies, from its plan: "Free", "Fixed fee · ₹250 for any pickup", "By distance · free 3 km · ₹15/km · ₹99–₹399". */
export function planSummaryLine(plan: PickupFeePlan): string {
  if (plan.mode === 'free') return 'Free'
  if (plan.mode === 'fixed') return `Fixed fee · ${rupees(plan.fixed)} for any pickup`
  return `By distance · free ${km(plan.freeKm)} km · ${rupees(plan.perKm)}/km · ${rupees(plan.minCharge)}–${rupees(plan.maxCharge)}`
}

// ─── One garage's own limits ─────────────────────────────────────────────────

/** The limit boxes, as typed; an empty box is Detlio's default. */
export interface LimitsDraft {
  freeKmMin: string
  freeKmMax: string
  perKmMin: string
  perKmMax: string
  minChargeMin: string
  minChargeMax: string
  maxCharge: string
  fixedMax: string
  askRaisePct: string
  changeEveryDays: string
  /** '' Detlio's default (yes), 'yes' or 'no'. */
  needsApproval: '' | 'yes' | 'no'
}

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/** The boxes for a garage's stored overrides. */
export function limitsDraftOf(o: PickupFeeLimitOverrides): LimitsDraft {
  return {
    freeKmMin: text(o.freeKm?.min),
    freeKmMax: text(o.freeKm?.max),
    perKmMin: text(o.perKm?.min),
    perKmMax: text(o.perKm?.max),
    minChargeMin: text(o.minCharge?.min),
    minChargeMax: text(o.minCharge?.max),
    maxCharge: text(o.maxCharge),
    fixedMax: text(o.fixedMax),
    askRaisePct: text(o.askRaisePct),
    changeEveryDays: text(o.changeEveryDays),
    needsApproval: o.needsApproval === null ? '' : o.needsApproval ? 'yes' : 'no',
  }
}

export const EMPTY_LIMITS_DRAFT: LimitsDraft = limitsDraftOf(NO_LIMIT_OVERRIDES)

/**
 * The overrides the boxes describe, or why not: a box that isn't a number,
 * or a range with only one end typed (both ends, or neither for Detlio's
 * default). The caps are checked by limitOverridesProblems.
 */
export function overridesOfDraft(d: LimitsDraft): { ok: true; overrides: PickupFeeLimitOverrides } | { ok: false; problem: string } {
  const read = (value: string): number | null | 'bad' => {
    const trimmed = value.trim().replace(/^₹/, '').replace(/%$/, '')
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : 'bad'
  }
  const fields: Array<[string, string]> = [
    ['Free up to', d.freeKmMin], ['Free up to', d.freeKmMax], ['Per km', d.perKmMin], ['Per km', d.perKmMax],
    ['Lowest charge', d.minChargeMin], ['Lowest charge', d.minChargeMax], ['Highest charge', d.maxCharge],
    ['Fixed fee limit', d.fixedMax], ['Ask for pickup', d.askRaisePct], ['Days between changes', d.changeEveryDays],
  ]
  for (const [label, value] of fields) {
    if (read(value) === 'bad') return { ok: false, problem: `${label}: type a number, or leave it empty for Detlio’s default.` }
  }
  const one = (value: string) => read(value) as number | null
  const pair = (label: string, min: string, max: string): Range | null | string => {
    const a = one(min)
    const b = one(max)
    if (a === null && b === null) return null
    if (a === null || b === null) return `${label}: type both ends, or leave both empty for Detlio’s default.`
    return { min: a, max: b }
  }
  const freeKm = pair('Free up to', d.freeKmMin, d.freeKmMax)
  const perKm = pair('Per km', d.perKmMin, d.perKmMax)
  const minCharge = pair('Lowest charge', d.minChargeMin, d.minChargeMax)
  for (const r of [freeKm, perKm, minCharge]) if (typeof r === 'string') return { ok: false, problem: r }
  return {
    ok: true,
    overrides: {
      freeKm: freeKm as Range | null,
      perKm: perKm as Range | null,
      minCharge: minCharge as Range | null,
      maxCharge: one(d.maxCharge),
      fixedMax: one(d.fixedMax),
      askRaisePct: one(d.askRaisePct),
      changeEveryDays: one(d.changeEveryDays),
      needsApproval: d.needsApproval === '' ? null : d.needsApproval === 'yes',
    },
  }
}

/** "Default 0–5 km", "Default ₹5–₹30", "Default ₹599": Detlio's default under a limit box. */
export function defaultLimitHint(
  field: 'freeKm' | 'perKm' | 'minCharge' | 'maxCharge' | 'fixedMax' | 'askRaisePct' | 'changeEveryDays',
  d: PickupFeeLimits
): string {
  switch (field) {
    case 'freeKm':
      return `Default ${km(d.freeKm.min)}–${km(d.freeKm.max)} km`
    case 'perKm':
      return `Default ${rupees(d.perKm.min)}–${rupees(d.perKm.max)}`
    case 'minCharge':
      return `Default ${rupees(d.minCharge.min)}–${rupees(d.minCharge.max)}`
    case 'maxCharge':
      return `Default up to ${rupees(d.maxCharge)}`
    case 'fixedMax':
      return `Default up to ${rupees(d.fixedMax)}`
    case 'askRaisePct':
      return `Default ${d.askRaisePct}%`
    case 'changeEveryDays':
      return `Default every ${d.changeEveryDays} days`
  }
}

/**
 * A 'limits' change in a few words: "Limits: per km ₹5–₹12, fixed up to
 * ₹150", "Limits: back to Detlio’s defaults".
 */
export function limitsChangeLine(before: PickupFeeLimitOverrides, after: PickupFeeLimitOverrides): string {
  const parts: string[] = []
  const range = (r: Range | null, unit: (n: number) => string) => (r ? `${unit(r.min)}–${unit(r.max)}` : 'default')
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (!same(before.freeKm, after.freeKm)) parts.push(`free ${range(after.freeKm, (n) => `${km(n)} km`)}`)
  if (!same(before.perKm, after.perKm)) parts.push(`per km ${range(after.perKm, rupees)}`)
  if (!same(before.minCharge, after.minCharge)) parts.push(`lowest ${range(after.minCharge, rupees)}`)
  if (before.maxCharge !== after.maxCharge) parts.push(`highest ${after.maxCharge === null ? 'default' : `up to ${rupees(after.maxCharge)}`}`)
  if (before.fixedMax !== after.fixedMax) parts.push(`fixed ${after.fixedMax === null ? 'default' : `up to ${rupees(after.fixedMax)}`}`)
  if (before.askRaisePct !== after.askRaisePct) parts.push(`Ask for pickup ${after.askRaisePct === null ? 'default' : `+${after.askRaisePct}%`}`)
  if (before.changeEveryDays !== after.changeEveryDays) {
    parts.push(`changes ${after.changeEveryDays === null ? 'default' : `every ${after.changeEveryDays} days`}`)
  }
  if (before.needsApproval !== after.needsApproval) {
    parts.push(after.needsApproval === null ? 'approval default' : after.needsApproval ? 'needs approval' : 'no approval needed')
  }
  const cleared = Object.values(after).every((v) => v === null)
  if (cleared) return 'Limits: back to Detlio’s defaults'
  return `Limits: ${parts.join(', ') || 'no change'}`
}
