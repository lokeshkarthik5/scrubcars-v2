/**
 * The pickup fee on the garage's screens (0079): the garage portal
 * (apps/vendors) and the garage app (apps/vendors-app) both build their
 * Settings → Pickup fee part, their Requests card and their Earnings line
 * from these, so the two say and check the same. The maths and the shared
 * words are pickup-fee.ts / pickup-fee-maths.ts.
 */

import { t } from './i18n/translate'
import {
  detlioPlan,
  garagePlan,
  kmFigure,
  pickupFeeProblems,
  pickupLineLabel,
  problemLine,
  rupees,
  type GaragePickupFee,
  type PickupFeeLimits,
  type PickupFeeMode,
  type PickupFeePlan,
  type PickupFeeSettings,
  type SuggestedFormula,
} from './pickup-fee'

// ─── Settings → Hours → Pickup & drop → Pickup fee ──────────────────────────

/** The boxes, as typed. */
export interface FeeDraft {
  mode: PickupFeeMode
  fixed: string
  freeKm: string
  perKm: string
  minCharge: string
  maxCharge: string
}

export type FeeBox = 'fixed' | 'freeKm' | 'perKm' | 'minCharge' | 'maxCharge'

/** The settings the garage's screen checks against (no convenience fee: not the garage's). */
export function feeSettingsOf(view: { suggested: SuggestedFormula; limits: PickupFeeLimits }): PickupFeeSettings {
  return { suggested: view.suggested, limits: view.limits, convenienceFee: 0 }
}

/** The boxes for a saved fee: By distance shows Detlio's numbers where the garage left them. */
export function draftOf(fee: GaragePickupFee, suggested: SuggestedFormula): FeeDraft {
  const text = (value: number | null, fallback: number) => String(value ?? fallback)
  return {
    mode: fee.mode,
    fixed: fee.fixed !== null ? String(fee.fixed) : '',
    freeKm: text(fee.freeKm, suggested.freeKm),
    perKm: text(fee.perKm, suggested.perKm),
    minCharge: text(fee.minCharge, suggested.minCharge),
    maxCharge: text(fee.maxCharge, suggested.maxCharge),
  }
}

/** Digits only (and one point where km allow it), at most `max` characters. */
export function feeBoxText(text: string, decimal: boolean, max = 4): string {
  const cleaned = text.replace(decimal ? /[^\d.]/g : /\D/g, '')
  const [whole, ...rest] = cleaned.split('.')
  const joined = decimal && rest.length > 0 ? `${whole}.${rest.join('').slice(0, 1)}` : (whole ?? '')
  return joined.slice(0, max)
}

const parse = (text: string): number | null => {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/** The fee the boxes describe. An empty distance box is Detlio's number. */
export function feeOfDraft(draft: FeeDraft): GaragePickupFee {
  if (draft.mode === 'free') return { mode: 'free', fixed: null, freeKm: null, perKm: null, minCharge: null, maxCharge: null }
  if (draft.mode === 'fixed') {
    return { mode: 'fixed', fixed: parse(draft.fixed), freeKm: null, perKm: null, minCharge: null, maxCharge: null }
  }
  return {
    mode: 'distance',
    fixed: null,
    freeKm: parse(draft.freeKm),
    perKm: parse(draft.perKm),
    minCharge: parse(draft.minCharge),
    maxCharge: parse(draft.maxCharge),
  }
}

/** What each box says is wrong (the box refuses it), empty when the fee can be saved. */
export function draftProblems(draft: FeeDraft, settings: PickupFeeSettings): Partial<Record<FeeBox, string>> {
  const out: Partial<Record<FeeBox, string>> = {}
  for (const problem of pickupFeeProblems(feeOfDraft(draft), settings)) {
    if (!out[problem.field]) out[problem.field] = problemLine(problem)
  }
  return out
}

/** The plan the boxes describe, for the "What customers pay" table. */
export function draftPlan(draft: FeeDraft, settings: PickupFeeSettings): PickupFeePlan {
  return garagePlan(feeOfDraft(draft), settings)
}

/** Whether the distance boxes hold exactly Detlio's numbers ("These are Detlio's numbers."). */
export function isDetliosDraft(draft: FeeDraft, suggested: SuggestedFormula): boolean {
  const fee = feeOfDraft(draft)
  return (
    fee.mode === 'distance' &&
    (fee.freeKm ?? suggested.freeKm) === suggested.freeKm &&
    (fee.perKm ?? suggested.perKm) === suggested.perKm &&
    (fee.minCharge ?? suggested.minCharge) === suggested.minCharge &&
    (fee.maxCharge ?? suggested.maxCharge) === suggested.maxCharge
  )
}

/** Whether the boxes say what is saved: nothing to save. */
export function draftIsSaved(draft: FeeDraft, saved: GaragePickupFee, settings: PickupFeeSettings): boolean {
  const a = garagePlan(feeOfDraft(draft), settings)
  const b = garagePlan(saved, settings)
  if (a.mode !== b.mode) return false
  if (a.mode === 'fixed') return a.fixed === b.fixed
  if (a.mode === 'distance') {
    return a.freeKm === b.freeKm && a.perKm === b.perKm && a.minCharge === b.minCharge && a.maxCharge === b.maxCharge
  }
  return true
}

/** "Road km = straight line from your garage’s pin × 1.3. Rounded to the nearest ₹10. …" */
export function roadKmFootnote(suggested: SuggestedFormula): string {
  return t(
    "Road km = straight line from your garage’s pin × {factor}. Rounded to the nearest ₹{round}. Never more than the booking's service price.",
    { factor: suggested.roadFactor, round: suggested.roundTo }
  )
}

/** Detlio's plan, for the Detlio column. */
export function detlioPlanOf(view: { suggested: SuggestedFormula; limits: PickupFeeLimits }): PickupFeePlan {
  return detlioPlan(feeSettingsOf(view))
}

/** Kept: "Detlio kept its fee: <reason>". */
export function keptLine(reason: string | null): string {
  return reason ? t('Detlio kept its suggested fee: {reason}', { reason }) : t('Detlio kept its suggested fee.')
}

// ─── Requests ────────────────────────────────────────────────────────────────

/** The card's tag above the services. */
export function requestTag(mode: 'doorstep' | 'pickup', passedOn: boolean): string {
  if (passedOn) return t('Passed on to you')
  return mode === 'pickup' ? t('New request · Ask for pickup') : t('New request · outside your area')
}

/** The label above the fee chips. */
export function requestFeeLabel(mode: 'doorstep' | 'pickup'): string {
  return mode === 'pickup'
    ? t('Pickup fee (the customer sees it before paying)')
    : t('Travel fee (the customer sees it before paying)')
}

/** The radiogroup's name. */
export function requestFeeGroupName(mode: 'doorstep' | 'pickup'): string {
  return mode === 'pickup' ? t('Pickup fee') : t('Travel fee')
}

/** A fee chip: "₹120" (a suggested fee) or "None" for ₹0. */
export function feeChipLabel(fee: number): string {
  return fee > 0 ? rupees(fee) : t('None')
}

/** "₹120 is Detlio’s suggestion for 11 km. You can ask up to 25% more. You keep the whole fee." */
export function requestFeeNote(suggested: number, roadKm: number | null, raisePct: number): string {
  const km = roadKm !== null ? kmFigure(roadKm) : null
  if (suggested <= 0) {
    return km
      ? t('{km} km is inside Detlio’s free distance, so there is no fee. You keep any fee you ask.', { km })
      : t('Detlio suggests no fee for this trip.')
  }
  return km
    ? t('{fee} is Detlio’s suggestion for {km} km. You can ask up to {pct}% more. You keep the whole fee.', {
        fee: rupees(suggested),
        km,
        pct: raisePct,
      })
    : t('{fee} is Detlio’s suggestion. You can ask up to {pct}% more. You keep the whole fee.', {
        fee: rupees(suggested),
        pct: raisePct,
      })
}

/** "You don't offer pickup yet · 11 km by road", or "3.9 km beyond your 5 km · 9 km from you". */
export function requestDistanceLine(request: {
  beyond: string
  distanceKm: number
  roadKm?: number | null
  offersPickup?: boolean
}): string {
  if (request.offersPickup === false) {
    return request.roadKm != null
      ? `${request.beyond} · ${t('{km} km by road', { km: kmFigure(request.roadKm) })}`
      : request.beyond
  }
  return `${request.beyond} · ${t('{km} km from you', { km: request.distanceKm })}`
}

/** "You earn {amount} + the pickup fee" / "+ any travel fee" (a template: the amount is filled by the screen). */
export function earnTemplate(mode: 'doorstep' | 'pickup'): string {
  return mode === 'pickup' ? t('You earn {amount} + the pickup fee') : t('You earn {amount} + any travel fee')
}

/** The accepted card's line. */
export function acceptedLine(input: {
  mode: 'doorstep' | 'pickup'
  start: string
  fee: number
  confirmBy: string
}): string {
  const vars = { start: input.start, fee: rupees(input.fee), time: input.confirmBy }
  return input.mode === 'pickup'
    ? t('Accepted · starts {start} · pickup fee {fee} · customer confirms by {time}', vars)
    : t('Accepted · starts {start} · travel fee {fee} · customer confirms by {time}', vars)
}

/** The fee chips for a request: the server's, or ₹0/₹100/₹200 from an older API. */
export function requestFeeChoices(request: { feeChoices?: number[] }, legacy: readonly number[]): number[] {
  return request.feeChoices && request.feeChoices.length > 0 ? request.feeChoices : [...legacy]
}

/** The chip picked at first: Detlio's suggestion (the first), or ₹0 on an older request. */
export function defaultFeeChoice(request: { feeChoices?: number[]; suggestedFee?: number | null }): number {
  if (request.suggestedFee != null) return request.suggestedFee
  return request.feeChoices?.[0] ?? 0
}

// ─── Earnings ────────────────────────────────────────────────────────────────

/** The statement's fee line: "Pickup & drop · 6.2 km (yours, no commission)" or the travel fee's. */
export function earningsFeeLabel(line: { bookingType?: string | null; roadKm?: number | null }): string {
  return line.bookingType === 'pickup'
    ? t('{line} (yours, no commission)', { line: pickupLineLabel(line.roadKm) })
    : t('Travel fee (yours, no commission)')
}
