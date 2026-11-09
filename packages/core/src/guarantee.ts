import { msg, t } from './i18n/translate'

/**
 * Detlio Guarantee (0051): the words and numbers the apps show for a free
 * redo claim. Twin of the server's apps/server/src/lib/guarantee.ts, which
 * decides everything; guarantee.parity.test.ts there fails if the numbers or
 * the issue list drift apart. Owner decision, 18 Oct 2026: a free redo within
 * 48 hours, decided on before/after photos, with limits against misuse.
 *
 * "Detlio Guarantee" is the feature's name on screens the customer opens
 * (the button, the claim screen, the checkout badge, Help). Notifications and
 * Updates say "free redo": the copy rules ban the word on their own.
 */

export const GUARANTEE_RULES = {
  claimWindowHours: 48,
  minPhotos: 2,
  maxPhotos: 6,
  garageReviewHours: 12,
  garageReviewCapHours: 48,
  detlioDecideHours: 24,
  redoWithinDays: 7,
  maxApprovedClaims: 2,
  approvedClaimsWindowDays: 183,
  reviewRateThreshold: 0.3,
  reviewRateMinBookings: 3,
  otherTextMax: 300,
  garageNoteMax: 500,
  reasonMax: 500,
} as const

export const GUARANTEE_ISSUES = [
  'missed_spots',
  'water_marks',
  'interior_not_cleaned',
  'wrong_service',
  'other',
] as const
export type GuaranteeIssue = (typeof GUARANTEE_ISSUES)[number]

export const ISSUE_LABELS: Record<GuaranteeIssue, string> = {
  missed_spots: msg('Missed spots or dirt left'),
  water_marks: msg('Water marks or streaks'),
  interior_not_cleaned: msg('Interior not cleaned'),
  wrong_service: msg('Wrong service done'),
  other: msg('Something else'),
}

export type ClaimStatus =
  | 'waiting_garage'
  | 'needs_detlio'
  | 'redo_approved'
  | 'redo_booked'
  | 'redo_done'
  | 'refund_approved'
  | 'rejected'
  | 'lapsed'
  /** The customer withdrew it before anyone answered (0066). */
  | 'withdrawn'

/** Short status labels for the garage portal and admin. */
export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  waiting_garage: msg('Waiting for the garage'),
  needs_detlio: msg('With Detlio'),
  redo_approved: msg('Redo approved — customer to pick a time'),
  redo_booked: msg('Redo booked'),
  redo_done: msg('Redo done'),
  refund_approved: msg('Refund instead'),
  rejected: msg('Not approved'),
  lapsed: msg('Closed'),
  withdrawn: msg('Withdrawn by the customer'),
}

/** The feature's name, as the customer's screens say it. */
export const GUARANTEE_NAME = msg('Detlio Guarantee')

/** The checkout badge. */
export const GUARANTEE_BADGE = msg('Covered by Detlio Guarantee')

/** The button on a completed job. */
export const GUARANTEE_BUTTON = msg('Not happy? Detlio Guarantee — free redo')

/**
 * One line under the checkout badge and on the claim screen. This and the
 * list below carry their numbers, so a screen shows them as t(GUARANTEE_SUMMARY):
 * the Tamil is keyed by this exact English, and a changed number falls back
 * to English rather than showing an old one.
 */
export const GUARANTEE_SUMMARY = `Not happy with a wash or detailing? Ask for a free redo within ${GUARANTEE_RULES.claimWindowHours} hours, with photos of the problem.`

/** What the claim screen says about how it is decided. */
export const GUARANTEE_HOW_IT_WORKS = [
  `Take at least ${GUARANTEE_RULES.minPhotos} photos of the problem in the app.`,
  "We compare them with the garage's before and after photos.",
  `The garage answers within ${GUARANTEE_RULES.garageReviewHours} hours of its opening hours. If it doesn't, your redo is approved.`,
  `If the garage disagrees, Detlio decides within ${GUARANTEE_RULES.detlioDecideHours} hours.`,
  `Once approved, pick a free redo time at the same garage within ${GUARANTEE_RULES.redoWithinDays} days.`,
] as const

/** Covers car washes and detailing (and packages of them), as the server's redoCategories. */
export const GUARANTEE_COVERS = msg('Car washes and detailing, including packages of them.')

/** "Respond within 3 h 20 m", for the garage's countdown. */
export function timeLeftLabel(untilIso: string | null, now: number = Date.now()): string | null {
  if (!untilIso) return null
  const left = Date.parse(untilIso) - now
  if (!Number.isFinite(left) || left <= 0) return null
  const minutes = Math.ceil(left / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`
}

/** Whether the claim form is ready to send. */
export function claimFormProblem(input: {
  issues: readonly GuaranteeIssue[]
  otherText: string
  photos: number
}): string | null {
  if (input.issues.length === 0) return t("Pick what's wrong.")
  if (input.issues.includes('other') && !input.otherText.trim()) return t("Say what's wrong in a few words.")
  if (input.photos < GUARANTEE_RULES.minPhotos) {
    return t('Add at least {count} photos of the problem.', { count: GUARANTEE_RULES.minPhotos })
  }
  if (input.photos > GUARANTEE_RULES.maxPhotos) return t('Add at most {count} photos.', { count: GUARANTEE_RULES.maxPhotos })
  return null
}
