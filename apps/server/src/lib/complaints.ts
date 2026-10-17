/**
 * Complaints: the customer's reference number ("C-000123") and the response
 * clock the team works to. Pure, with the clock passed in.
 *
 * Owner decision (17 Oct 2026): every complaint gets a number and a visible
 * clock. The two promises are the Contact page's (Consumer Protection
 * (E-Commerce) Rules 2020 rule 4(5), IT Rules 3(2) as amended): acknowledge
 * within 24 hours, resolve within 7 days.
 *
 * The numbers live in packages/core/src/complaints.ts, which the legal page
 * and the apps read; this is its twin for the API, pinned to it by
 * complaints.parity.test.ts. Change both together.
 */

/** Acknowledge a complaint within this many hours of Detlio receiving it. */
export const COMPLAINT_ACKNOWLEDGE_HOURS = 24

/** Resolve a complaint within this many days of Detlio receiving it. */
export const COMPLAINT_RESOLVE_DAYS = 7

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Text with a CHECK (0035), like home_audience, so a new one is a constraint swap. */
export const COMPLAINT_CATEGORIES = [
  'payment_or_refund',
  'service_quality',
  'garage_no_show',
  'damage',
  'app_problem',
  'other',
] as const

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

/** For the ops alert; the apps have their own copy in packages/core. */
export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  payment_or_refund: 'Payment or refund',
  service_quality: 'Quality of the work',
  garage_no_show: "Garage didn't turn up",
  damage: 'Damage to my car',
  app_problem: 'Problem with the app',
  other: 'Something else',
}

/**
 * Where a complaint came from (0039, text + CHECK). 'app' is a customer
 * raising it in the app; the rest are how the team heard it before logging
 * it on the Complaints tab.
 */
export const COMPLAINT_SOURCES = ['app', 'phone', 'whatsapp', 'email', 'in_person', 'other'] as const

export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number]

/** What the team may pick when logging one: everything but the app itself. */
export const LOGGED_COMPLAINT_SOURCES = ['phone', 'whatsapp', 'email', 'in_person', 'other'] as const satisfies readonly Exclude<ComplaintSource, 'app'>[]

export type LoggedComplaintSource = (typeof LOGGED_COMPLAINT_SOURCES)[number]

/** For the ops alert ("By phone"); the apps have their own copy in packages/core. */
export const COMPLAINT_SOURCE_LABELS: Record<ComplaintSource, string> = {
  app: 'In the app',
  phone: 'By phone',
  whatsapp: 'On WhatsApp',
  email: 'By email',
  in_person: 'In person',
  other: 'Some other way',
}

/**
 * How far back the team may date a complaint it logs: the clock starts when
 * Detlio received it, not when someone got round to typing it in, and a
 * week is as far back as anyone needs (the resolve promise is 7 days).
 */
export const MAX_RECEIVED_DAYS_BACK = 7

/**
 * A received time a little in the future is the admin's clock running fast,
 * not a complaint from tomorrow: within this much it is taken as now.
 */
export const RECEIVED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/**
 * When a logged complaint was received, from what the team typed: now when
 * left out; refused when more than 7 days back, or in the future beyond a
 * fast clock's few minutes; otherwise as typed, never later than now.
 */
export function resolveReceivedAt(
  typed: Date | null | undefined,
  now: Date
): { at: Date } | { refusal: 'too_old' | 'in_future' } {
  if (!typed) return { at: now }
  if (typed.getTime() > now.getTime() + RECEIVED_AT_FUTURE_TOLERANCE_MS) return { refusal: 'in_future' }
  if (typed.getTime() < now.getTime() - MAX_RECEIVED_DAYS_BACK * DAY_MS) return { refusal: 'too_old' }
  return { at: typed.getTime() > now.getTime() ? now : typed }
}

export const COMPLAINT_STATUSES = ['open', 'acknowledged', 'resolved', 'closed'] as const

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

/** Matches the columns (0035). */
export const COMPLAINT_MESSAGE_MIN = 10
export const COMPLAINT_MESSAGE_MAX = 1000
export const COMPLAINT_RESOLUTION_MAX = 1000
export const COMPLAINT_ADMIN_NOTE_MAX = 2000

/**
 * How many complaints one customer may have waiting at once, and make in an
 * hour. Enough for anyone with a real problem (each booking can have one,
 * and the team answers within a day); a wall for a script or a stuck button,
 * which would otherwise fill the team's Telegram group.
 */
export const MAX_UNFINISHED_COMPLAINTS = 5
export const MAX_COMPLAINTS_PER_HOUR = 3

/** "C-000123". Six digits; a seventh is simply printed. */
export function formatComplaintNumber(seq: number): string {
  return `C-${String(seq).padStart(6, '0')}`
}

export function isComplaintFinished(status: ComplaintStatus): boolean {
  return status === 'resolved' || status === 'closed'
}

/**
 * When it must be acknowledged and resolved by. The clock runs from when
 * Detlio received it (0039 `received_at`): the moment an app complaint was
 * made, or the time the team gave when logging a call or a message.
 */
export function complaintDueTimes(receivedAt: Date): { acknowledgeBy: Date; resolveBy: Date } {
  return {
    acknowledgeBy: new Date(receivedAt.getTime() + COMPLAINT_ACKNOWLEDGE_HOURS * HOUR_MS),
    resolveBy: new Date(receivedAt.getTime() + COMPLAINT_RESOLVE_DAYS * DAY_MS),
  }
}

/**
 * Which promise a complaint has missed: `resolve` past its resolve-by while
 * not resolved or closed (said first: the bigger miss), `acknowledge` past
 * its acknowledge-by while still open. Right on the moment is not late.
 */
export function complaintOverdue(
  complaint: { status: ComplaintStatus; receivedAt: Date },
  now: Date
): 'acknowledge' | 'resolve' | null {
  if (isComplaintFinished(complaint.status)) return null
  const due = complaintDueTimes(complaint.receivedAt)
  if (now.getTime() > due.resolveBy.getTime()) return 'resolve'
  if (complaint.status === 'open' && now.getTime() > due.acknowledgeBy.getTime()) {
    return 'acknowledge'
  }
  return null
}

/**
 * The same rule as complaintOverdue, as the two received times the admin
 * list's SQL compares against: a complaint is overdue when it is open and
 * was received before `openReceivedBefore`, or is not finished and was
 * received before `unfinishedReceivedBefore`. Worked out here so the SQL
 * never restates the hours.
 */
export function overdueCutoffs(now: Date): { openReceivedBefore: Date; unfinishedReceivedBefore: Date } {
  return {
    openReceivedBefore: new Date(now.getTime() - COMPLAINT_ACKNOWLEDGE_HOURS * HOUR_MS),
    unfinishedReceivedBefore: new Date(now.getTime() - COMPLAINT_RESOLVE_DAYS * DAY_MS),
  }
}

/** Why a customer may not raise another complaint just now, if they may not. */
export type ComplaintSubmitRefusal = 'too_many_open' | 'too_many_recent'

export function complaintSubmitRefusal(counts: {
  /** Their complaints still open or acknowledged. */
  unfinished: number
  /** Their complaints made in the last hour, whatever their status. */
  lastHour: number
}): ComplaintSubmitRefusal | null {
  if (counts.unfinished >= MAX_UNFINISHED_COMPLAINTS) return 'too_many_open'
  if (counts.lastHour >= MAX_COMPLAINTS_PER_HOUR) return 'too_many_recent'
  return null
}

/** What the team can do to a complaint. */
export type ComplaintAction = 'acknowledge' | 'resolve' | 'close'

/**
 * The statuses each action may start from. Acknowledging is only for an
 * open one. Resolving answers it, so it may skip the acknowledgement (which
 * is then stamped at the same moment: the answer is the response). Closing
 * is the other way out (a duplicate, withdrawn, not a complaint) and may
 * follow a resolution. Nothing reopens a closed complaint; a new one is made.
 */
export const COMPLAINT_ACTION_FROM: Record<ComplaintAction, readonly ComplaintStatus[]> = {
  acknowledge: ['open'],
  resolve: ['open', 'acknowledged'],
  close: ['open', 'acknowledged', 'resolved'],
}

export function canTakeComplaintAction(status: ComplaintStatus, action: ComplaintAction): boolean {
  return COMPLAINT_ACTION_FROM[action].includes(status)
}
