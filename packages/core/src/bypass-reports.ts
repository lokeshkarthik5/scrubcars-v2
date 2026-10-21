/**
 * "Did the garage ask you to book directly?" (0052) for the apps: the words
 * the customer, the garage portal and admin show, and the numbers behind
 * them. The rules are the server's (apps/server/src/lib/bypass-reports.ts,
 * BYPASS_RULES); its bypass-reports.parity.test.ts keeps these equal.
 *
 * No imports: the server's parity test loads this file by path.
 */

/** The same numbers as the server's BYPASS_RULES (parity test). */
export const BYPASS_NUMBERS = {
  reportWindowDays: 30,
  maxReportsPerYear: 5,
  yearDays: 365,
  rewardRupees: 100,
  strikeWindowDays: 180,
  strikeAlertAt: 2,
  noteMax: 500,
  dismissReasonMax: 300,
} as const

export type BypassKind = 'book_directly' | 'lower_price' | 'pay_directly' | 'gave_number' | 'other'

/** In the order the customer sees them. */
export const BYPASS_KINDS: readonly BypassKind[] = [
  'book_directly',
  'lower_price',
  'pay_directly',
  'gave_number',
  'other',
]

export const BYPASS_KIND_LABELS: Record<BypassKind, string> = {
  book_directly: 'Asked me to book directly next time',
  lower_price: 'Offered a lower price outside Detlio',
  pay_directly: 'Asked me to pay cash or UPI directly',
  gave_number: 'Gave their number for future bookings',
  other: 'Something else',
}

export type BypassStatus = 'new' | 'confirmed' | 'dismissed'
export type BypassRewardStatus = 'none' | 'owed' | 'granted'

// ─── The customer's words ────────────────────────────────────────────────────

/** The question, on the booking page and in Help. */
export const BYPASS_QUESTION = 'Did the garage ask you to book directly or pay outside Detlio?'

/** The short version, for a link. */
export const BYPASS_QUESTION_SHORT = 'Did the garage ask you to book directly?'

/** Under the form: who sees it. */
export const BYPASS_ANONYMITY_LINE = 'The garage is never told who reported it.'

/** Under the form, only while Detlio credit is on. */
export function bypassRewardLine(rewardRupees: number = BYPASS_NUMBERS.rewardRupees): string {
  return `If we confirm it, we add ₹${rewardRupees} to your Detlio credit (once per garage).`
}

/** After sending. */
export const BYPASS_THANKS_TITLE = 'Thanks for telling us'
export const BYPASS_THANKS_BODY = 'We’ll look into it. The garage is never told who reported it.'

/** What a customer reads about a report they made, by where it stands. */
export function bypassReportStatusLine(report: {
  status: BypassStatus
  reward: BypassRewardStatus
  rewardRupees?: number
}): string {
  const amount = report.rewardRupees ?? BYPASS_NUMBERS.rewardRupees
  if (report.status === 'new') return 'You reported this booking. We’re looking into it.'
  if (report.status === 'dismissed') return 'You reported this booking. We looked into it — thank you for telling us.'
  if (report.reward === 'granted') return `We confirmed your report — ₹${amount} added to your Detlio credit. Thank you.`
  if (report.reward === 'owed') return `We confirmed your report. Your ₹${amount} reward is on its way. Thank you.`
  return 'We confirmed your report. Thank you for telling us.'
}

// ─── The garage's words ──────────────────────────────────────────────────────

/** The garage portal's reminder, in the agreement/terms style: calm, one line. */
export const GARAGE_NON_SOLICITATION_LINE =
  'Asking Detlio customers to book directly breaks your agreement and can lead to suspension.'

// ─── Admin's words ───────────────────────────────────────────────────────────

export const BYPASS_STATUS_LABELS: Record<BypassStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
}

export const BYPASS_REWARD_LABELS: Record<BypassRewardStatus, string> = {
  none: 'No reward',
  owed: 'Reward owed (credit is off)',
  granted: 'Reward added',
}

/** "2 strikes", "1 strike". */
export function strikesLabel(strikes: number): string {
  return `${strikes} ${strikes === 1 ? 'strike' : 'strikes'}`
}

/** Highlighted in admin: 2 or more. */
export function strikesHighlighted(strikes: number): boolean {
  return strikes >= BYPASS_NUMBERS.strikeAlertAt
}
