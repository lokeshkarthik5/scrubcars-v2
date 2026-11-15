/**
 * The pickup fee (0079, owner-approved screens, 15 Nov 2026): the words the
 * customer apps, the garage apps and admin show, on top of the maths in
 * pickup-fee-maths.ts (the server's twin is checked byte for byte).
 *
 * Each garage picks Free (the default, as before), a fixed fee, or By
 * distance; Detlio sets the suggested formula, the limits and its own
 * convenience fee (₹0, off) in admin. The garage keeps the whole pickup fee.
 */

// Relative imports: the server's parity test loads this file by path.
import { msg, t } from './i18n/translate'
import {
  PICKUP_FEE_PREVIEW_KM,
  feeAtRoadKm,
  garagePlan,
  type GaragePickupFee,
  type PickupFeeLimits,
  type PickupFeeMode,
  type PickupFeePlan,
  type PickupFeeProblem,
  type PickupFeeSettings,
} from './pickup-fee-maths'

export * from './pickup-fee-maths'

// ─── Numbers as words ────────────────────────────────────────────────────────

/** "₹1,250". */
export function rupees(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`
}

/** "6.2" or "11": a km figure as the screens write it. */
export function kmFigure(km: number): string {
  const tenth = Math.round(km * 10) / 10
  return Number.isInteger(tenth) ? String(tenth) : tenth.toFixed(1)
}

// ─── The customer's side ─────────────────────────────────────────────────────

/** The chip on a Pickup & drop list card: "Pickup ₹99" or "Free pickup". */
export function pickupChipLabel(fee: number): string {
  return fee > 0 ? t('Pickup {fee}', { fee: rupees(fee) }) : t('Free pickup')
}

/** The checkout, booking and receipt line: "Pickup & drop · 6.2 km" ("Pickup & drop" when the km aren't known). */
export function pickupLineLabel(roadKm: number | null | undefined): string {
  return roadKm != null && roadKm > 0 ? t('Pickup & drop · {km} km', { km: kmFigure(roadKm) }) : t('Pickup & drop')
}

/** Checkout, under Pay, for a pickup with a fee. */
export const PICKUP_FEE_FULL_LINE = msg("This is the full pickup fee. The garage can't ask for more.")
/** Checkout's cancellation policy ends with this on a pickup booking. */
export const PICKUP_FEE_REFUND_LINE = msg("If the garage cancels or doesn't turn up, the pickup fee is refunded in full.")
/** Detlio's own line at checkout, on the booking and the receipt, only while it is above ₹0. */
export const CONVENIENCE_FEE_LABEL = msg('Detlio convenience fee')
/** The bypass report reason this round adds. */
export const PICKUP_MONEY_REASON = msg('Asked for extra pickup money')

/** The booking page's note under the pickup fee row. */
export function pickupRefundNote(garage: string): string {
  return t(
    "The pickup fee is the full price for collecting and returning your car. If {garage} cancels or doesn't turn up, it's refunded in full.",
    { garage }
  )
}

/**
 * The garage page's line under the mode switch. With a fee: "Pickup & drop
 * ₹99 to Home (6.2 km by road)." Free, or no address: today's "Free pickup &
 * drop." Either way followed by what the garage does.
 */
export function garagePageFeeLine(input: {
  fee: number | null
  roadKm: number | null
  placeLabel: string | null
}): { lead: string; amount: string | null; rest: string } {
  if (input.fee !== null && input.fee > 0) {
    const where =
      input.placeLabel && input.roadKm !== null
        ? t(' to {place} ({km} km by road).', { place: input.placeLabel, km: kmFigure(input.roadKm) })
        : '.'
    return { lead: t('Pickup & drop'), amount: rupees(input.fee), rest: where }
  }
  return { lead: t('Free pickup & drop.'), amount: null, rest: '' }
}

/** Ask for pickup: "Detlio suggests about ₹120 for 11 km by road; the garage confirms. Free to ask." */
export function askSuggestionLine(fee: number, roadKm: number): string {
  if (fee <= 0) return t('No pickup fee for {km} km by road; the garage confirms. Free to ask.', { km: kmFigure(roadKm) })
  return t('Ask them to collect yours. Detlio suggests about {fee} for {km} km by road; the garage confirms. Free to ask.', {
    fee: rupees(fee),
    km: kmFigure(roadKm),
  })
}

/** The request card's fee line while the garage decides. */
export function requestFeeWaitingLine(suggested: number, max: number): string {
  if (suggested <= 0) return t('Pickup fee: none. They confirm it.')
  return t('Pickup fee: about {fee}, at most {max}. They confirm it.', { fee: rupees(suggested), max: rupees(max) })
}

/** Under an accepted request's fee line. */
export function requestFeeAcceptedNote(suggested: number, max: number): string {
  return t('Detlio suggested {fee}; the garage can ask up to {max}.', { fee: rupees(suggested), max: rupees(max) })
}

// ─── The garage's side ───────────────────────────────────────────────────────

export const PICKUP_FEE_MODE_LABELS: Record<PickupFeeMode, string> = {
  free: msg('Free'),
  fixed: msg('Fixed fee'),
  distance: msg('By distance'),
}

export const GARAGE_KEEPS_FEE_LINE = msg('You keep the whole fee. Detlio takes no commission on it.')
export const PICKUP_FEE_INTRO = msg('What the customer pays for pickup & drop, on top of the services.')
export const FREE_MODE_LINE = msg('Customers see Free pickup. This is how it works today.')
export const FIXED_MODE_LINE = msg(
  "The same fee for every address you collect from. Never more than the booking's service price."
)
export const DISTANCE_MODE_LINE = msg(
  "Worked out for each address. Detlio's suggestion is filled in; change it within the limits shown."
)
export const DETLIO_NUMBERS_LINE = msg('These are Detlio’s numbers.')
export const ROAD_KM_FOOTNOTE = msg(
  "Road km = straight line from your garage’s pin × {factor}. Rounded to the nearest ₹{round}. Never more than the booking's service price."
)
export const ABOVE_SUGGESTION_TITLE = msg('Above Detlio’s suggestion')
export const ABOVE_SUGGESTION_BODY = msg(
  'Detlio checks it before customers see it (usually within a day). Until then customers see the suggested fee.'
)
export const SET_BY_DETLIO_TITLE = msg('Set by Detlio')

/** "You can change your fee once every 7 days. A booked fee never changes." */
export function changeRuleLine(days: number): string {
  return t('You can change your fee once every {days} days. A booked fee never changes.', { days })
}

/** The locked notice: "Detlio’s fee: free up to 3 km, then ₹15 a km, ₹99–₹399. To change it, call Detlio support." */
export function lockedLine(plan: PickupFeePlan): string {
  return t('Detlio’s fee: free up to {free} km, then {perKm} a km, {min}–{max}. To change it, call Detlio support.', {
    free: kmFigure(plan.freeKm),
    perKm: rupees(plan.perKm),
    min: rupees(plan.minCharge),
    max: rupees(plan.maxCharge),
  })
}

/** "Sent to Detlio 15 Nov, 10:20 am. Your next change: from 22 Nov." */
export function sentLine(sentAtIso: string, nextChangeIso: string | null): string {
  const sent = t('Sent to Detlio {at}.', { at: istDayTime(sentAtIso) })
  return nextChangeIso ? `${sent} ${t('Your next change: from {day}.', { day: istDay(nextChangeIso) })}` : sent
}

/** "Your next change: from 22 Nov." */
export function nextChangeLine(nextChangeIso: string): string {
  return t('Your next change: from {day}.', { day: istDay(nextChangeIso) })
}

/** The hint under each box. */
export function limitHint(field: 'freeKm' | 'perKm' | 'minCharge' | 'maxCharge' | 'fixed', limits: PickupFeeLimits): string {
  switch (field) {
    case 'freeKm':
      return `${kmFigure(limits.freeKm.min)}–${kmFigure(limits.freeKm.max)} km`
    case 'perKm':
      return `${rupees(limits.perKm.min)}–${rupees(limits.perKm.max)}`
    case 'minCharge':
      return `${rupees(limits.minCharge.min)}–${rupees(limits.minCharge.max)}`
    case 'maxCharge':
      return t('Up to {max}', { max: rupees(limits.maxCharge) })
    case 'fixed':
      return t('Up to {max} for a fixed fee. That’s Detlio’s limit.', { max: rupees(limits.fixedMax) })
  }
}

/** A limit problem as the box under it says it. */
export function problemLine(problem: PickupFeeProblem): string {
  switch (problem.code) {
    case 'FIXED_REQUIRED':
      return t('Type a fee of ₹1 to {max}.', { max: rupees(problem.max) })
    case 'FIXED_TOO_HIGH':
      return t('Up to {max} for a fixed fee. That’s Detlio’s limit.', { max: rupees(problem.max) })
    case 'OUT_OF_RANGE':
      return problem.field === 'freeKm'
        ? t('{min}–{max} km', { min: kmFigure(problem.min), max: kmFigure(problem.max) })
        : `${rupees(problem.min)}–${rupees(problem.max)}`
    case 'MAX_TOO_HIGH':
      return t('Up to {max}', { max: rupees(problem.max) })
    case 'MAX_BELOW_MIN':
      return t('At least the lowest charge ({min}).', { min: rupees(problem.min) })
  }
}

/** One row of a "What customers pay" table. */
export interface FeePreviewRow {
  km: number
  /** "2 km by road". */
  label: string
  detlio: number
  /** The garage's fee at that distance (equal to Detlio's on a plain table). */
  garage: number
}

/** The preview table's rows for a plan, against Detlio's. */
export function feePreviewRows(plan: PickupFeePlan, detlio: PickupFeePlan): FeePreviewRow[] {
  return PICKUP_FEE_PREVIEW_KM.map((km) => ({
    km,
    label: t('{km} km by road', { km }),
    detlio: feeAtRoadKm(detlio, km),
    garage: feeAtRoadKm(plan, km),
  }))
}

/** A fee cell: "Free", "₹110", or "₹399 (top)" when it is the plan's highest charge on a distance plan. */
export function feeCell(fee: number, plan?: PickupFeePlan, markTop = false): string {
  if (fee <= 0) return t('Free')
  if (markTop && plan && plan.mode === 'distance' && fee >= plan.maxCharge) return t('{fee} (top)', { fee: rupees(fee) })
  return rupees(fee)
}

/** Admin's and the garage's summary of a choice: "By distance · free 3 km · ₹20/km · ₹99–₹399". */
export function feeSummary(fee: GaragePickupFee, settings: PickupFeeSettings): string {
  if (fee.mode === 'free') return t('Free')
  if (fee.mode === 'fixed') return t('Fixed fee · {fee} for any pickup', { fee: rupees(fee.fixed ?? 0) })
  const plan = garagePlan(fee, settings)
  return t('By distance · free {free} km · {perKm}/km · {min}–{max}', {
    free: kmFigure(plan.freeKm),
    perKm: rupees(plan.perKm),
    min: rupees(plan.minCharge),
    max: rupees(plan.maxCharge),
  })
}

/** Whether a distance choice is exactly Detlio's numbers. */
function isDetliosNumbers(fee: GaragePickupFee, settings: PickupFeeSettings): boolean {
  const plan = garagePlan(fee, settings)
  const s = settings.suggested
  return plan.freeKm === s.freeKm && plan.perKm === s.perKm && plan.minCharge === s.minCharge && plan.maxCharge === s.maxCharge
}

/**
 * A logged change in a few words: "Free → By distance (Detlio's fee)",
 * "By distance: ₹15 → ₹20 per km", "Fixed fee: ₹150 → ₹250".
 */
export function describeFeeChange(before: GaragePickupFee, after: GaragePickupFee, settings: PickupFeeSettings): string {
  const name = (fee: GaragePickupFee) =>
    fee.mode === 'distance' && isDetliosNumbers(fee, settings)
      ? t('By distance (Detlio’s fee)')
      : fee.mode === 'fixed'
        ? t('Fixed fee {fee}', { fee: rupees(fee.fixed ?? 0) })
        : t(PICKUP_FEE_MODE_LABELS[fee.mode])
  if (before.mode !== after.mode) return `${name(before)} → ${name(after)}`
  if (after.mode === 'fixed') return t('Fixed fee: {from} → {to}', { from: rupees(before.fixed ?? 0), to: rupees(after.fixed ?? 0) })
  if (after.mode === 'distance') {
    const a = garagePlan(before, settings)
    const b = garagePlan(after, settings)
    const parts: string[] = []
    if (a.freeKm !== b.freeKm) parts.push(t('free {from} → {to} km', { from: kmFigure(a.freeKm), to: kmFigure(b.freeKm) }))
    if (a.perKm !== b.perKm) parts.push(t('{from} → {to} per km', { from: rupees(a.perKm), to: rupees(b.perKm) }))
    if (a.minCharge !== b.minCharge) parts.push(t('lowest {from} → {to}', { from: rupees(a.minCharge), to: rupees(b.minCharge) }))
    if (a.maxCharge !== b.maxCharge) parts.push(t('highest {from} → {to}', { from: rupees(a.maxCharge), to: rupees(b.maxCharge) }))
    return `${t('By distance')}: ${parts.length ? parts.join(', ') : t('no change')}`
  }
  return t('Free')
}

// ─── IST dates ───────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const IST_MS = (5 * 60 + 30) * 60_000

/** "22 Nov" in IST. */
export function istDay(iso: string): string {
  const at = new Date(new Date(iso).getTime() + IST_MS)
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`
}

/** "15 Nov, 10:20 am" in IST. */
export function istDayTime(iso: string): string {
  const at = new Date(new Date(iso).getTime() + IST_MS)
  const hour = at.getUTCHours()
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${istDay(iso)}, ${h12}:${String(at.getUTCMinutes()).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`
}
