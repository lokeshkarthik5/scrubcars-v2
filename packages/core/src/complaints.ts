/**
 * Complaints: the reference number a customer is given, and the response
 * clock the team works to. Pure, with the clock passed in.
 *
 * The two promises are the ones the Contact page publishes (apps/users
 * lib/legal/details.ts GRIEVANCE_TIMELINES reads them from here): acknowledge
 * a complaint within 24 hours, resolve it within 7 days. One definition, so
 * the legal page and the clock in admin can never disagree.
 *
 * A twin of apps/server/src/lib/complaints.ts, which is what the API decides
 * with; apps/server/src/lib/complaints.parity.test.ts fails if the two
 * drift, so change both together. No imports, so the server test can load
 * this file directly.
 */

/** Acknowledge a complaint within this many hours of Detlio receiving it. */
export const COMPLAINT_ACKNOWLEDGE_HOURS = 24

/** Resolve a complaint within this many days of Detlio receiving it. */
export const COMPLAINT_RESOLVE_DAYS = 7

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const COMPLAINT_CATEGORIES = [
  'payment_or_refund',
  'service_quality',
  'garage_no_show',
  'damage',
  'app_problem',
  'other',
] as const

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

/** The chips on the complaint form, and the category everywhere it is shown. */
export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  payment_or_refund: 'Payment or refund',
  service_quality: 'Quality of the work',
  garage_no_show: "Garage didn't turn up",
  damage: 'Damage to my car',
  app_problem: 'Problem with the app',
  other: 'Something else',
}

/**
 * Where a complaint came from: 'app' when the customer raised it in the app;
 * otherwise how the team heard it before logging it on the Complaints tab.
 */
export const COMPLAINT_SOURCES = ['app', 'phone', 'whatsapp', 'email', 'in_person', 'other'] as const

export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number]

/** What the team may pick when logging one: everything but the app itself. */
export const LOGGED_COMPLAINT_SOURCES = ['phone', 'whatsapp', 'email', 'in_person', 'other'] as const

export type LoggedComplaintSource = (typeof LOGGED_COMPLAINT_SOURCES)[number]

/** How it reached us, for admin's cards and the log form. */
export const COMPLAINT_SOURCE_LABELS: Record<ComplaintSource, string> = {
  app: 'In the app',
  phone: 'By phone',
  whatsapp: 'On WhatsApp',
  email: 'By email',
  in_person: 'In person',
  other: 'Some other way',
}

/**
 * The line a customer reads on a complaint the team logged for them, so one
 * they never typed in the app makes sense: "You told us by phone".
 */
export const COMPLAINT_SOURCE_CUSTOMER_LINES: Record<Exclude<ComplaintSource, 'app'>, string> = {
  phone: 'You told us by phone',
  whatsapp: 'You told us on WhatsApp',
  email: 'You told us by email',
  in_person: 'You told us in person',
  other: 'You told our team',
}

/** How far back the team may date a complaint it logs. */
export const MAX_RECEIVED_DAYS_BACK = 7

/**
 * open → acknowledged → resolved. Closed is the other way out: a duplicate,
 * a withdrawn complaint, or one that was not a complaint.
 */
export const COMPLAINT_STATUSES = ['open', 'acknowledged', 'resolved', 'closed'] as const

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]

/** The status as the customer reads it in My complaints. */
export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Received',
  acknowledged: 'Being looked into',
  resolved: 'Resolved',
  closed: 'Closed',
}

/** The status as the team reads it in admin. */
export const COMPLAINT_ADMIN_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  closed: 'Closed',
}

/** What a customer may write. Matches the column (varchar(1000)). */
export const COMPLAINT_MESSAGE_MIN = 10
export const COMPLAINT_MESSAGE_MAX = 1000

/** The resolution note the customer sees, and the team's own note. */
export const COMPLAINT_RESOLUTION_MAX = 1000
export const COMPLAINT_ADMIN_NOTE_MAX = 2000

/**
 * "C-000123": the number the customer quotes. Six digits, so the first
 * complaints read like the rest; a seventh digit is simply printed.
 */
export function formatComplaintNumber(seq: number): string {
  return `C-${String(seq).padStart(6, '0')}`
}

/** Whether a complaint needs nothing more from the team. */
export function isComplaintFinished(status: ComplaintStatus): boolean {
  return status === 'resolved' || status === 'closed'
}

/**
 * When it must be acknowledged by, and resolved by. The clock runs from when
 * Detlio received it: the moment an app complaint was made, or the time the
 * team gave when logging a call or a message.
 */
export function complaintDueTimes(receivedAt: Date): { acknowledgeBy: Date; resolveBy: Date } {
  return {
    acknowledgeBy: new Date(receivedAt.getTime() + COMPLAINT_ACKNOWLEDGE_HOURS * HOUR_MS),
    resolveBy: new Date(receivedAt.getTime() + COMPLAINT_RESOLVE_DAYS * DAY_MS),
  }
}

/**
 * Which promise a complaint has missed, if any:
 *
 * - `resolve`: past its resolve-by and not resolved (or closed). Said first,
 *   because it is the bigger miss and an open complaint past 7 days has
 *   missed both.
 * - `acknowledge`: past its acknowledge-by and still open.
 *
 * Right on the due moment is not late yet.
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

export function isComplaintOverdue(
  complaint: { status: ComplaintStatus; receivedAt: Date },
  now: Date
): boolean {
  return complaintOverdue(complaint, now) !== null
}

/** "45 min", "5 h", "3 days": as short as a list row needs. Never negative. */
export function complaintDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} days`
}

/**
 * The clock, as one line for the team: what is due next and how long is
 * left, or how late it is. "Acknowledge within 5 h", "Resolve overdue by
 * 2 days", "Resolved".
 */
export function complaintClockLine(
  complaint: { status: ComplaintStatus; receivedAt: Date },
  now: Date
): string {
  if (complaint.status === 'resolved') return 'Resolved'
  if (complaint.status === 'closed') return 'Closed'
  const due = complaintDueTimes(complaint.receivedAt)
  const late = complaintOverdue(complaint, now)
  if (late === 'resolve') {
    return `Resolve overdue by ${complaintDuration(now.getTime() - due.resolveBy.getTime())}`
  }
  if (late === 'acknowledge') {
    return `Acknowledge overdue by ${complaintDuration(now.getTime() - due.acknowledgeBy.getTime())}`
  }
  if (complaint.status === 'open') {
    return `Acknowledge within ${complaintDuration(due.acknowledgeBy.getTime() - now.getTime())}`
  }
  return `Resolve within ${complaintDuration(due.resolveBy.getTime() - now.getTime())}`
}

/** The line the customer reads once the complaint is in. */
export function complaintReceivedLine(number: string): string {
  return `Complaint ${number} received — we'll get back to you within ${COMPLAINT_ACKNOWLEDGE_HOURS} hours.`
}

const DATE_PARTS = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

/**
 * "17 Oct 2026", in India time whatever the device says. Assembled from
 * parts, as ICU versions punctuate the whole differently.
 */
export function formatComplaintDate(iso: string): string {
  const parts = DATE_PARTS.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')} ${part('month')} ${part('year')}`
}
