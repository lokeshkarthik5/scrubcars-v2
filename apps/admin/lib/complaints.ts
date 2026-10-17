import type { AdminComplaint, AdminComplaintFilter } from '@repo/core/api/admin'
import {
  COMPLAINT_ACKNOWLEDGE_HOURS,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_MESSAGE_MIN,
  COMPLAINT_RESOLVE_DAYS,
  COMPLAINT_SOURCE_LABELS,
  MAX_RECEIVED_DAYS_BACK,
} from '@repo/core/complaints'
import { normaliseIndianMobile } from '@repo/core/phone'

/**
 * Wording for the Complaints tab: its chips, what each means, and what a
 * complaint's row says about its clock. The clock itself (due times, what is
 * overdue) is packages/core/src/complaints.ts, the same numbers the Contact
 * page publishes; the server decides `overdue` for each complaint it sends.
 */

export const COMPLAINT_FILTERS = ['open', 'overdue', 'resolved', 'all'] as const satisfies readonly AdminComplaintFilter[]

export const COMPLAINT_FILTER_LABELS: Record<AdminComplaintFilter, string> = {
  open: 'Open',
  overdue: 'Overdue',
  resolved: 'Resolved',
  all: 'All',
}

const DEFAULT_FILTER: AdminComplaintFilter = 'open'

/** The chip in the URL (?show=), or Open. */
export function parseComplaintFilter(value: string | null | undefined): AdminComplaintFilter {
  return value && (COMPLAINT_FILTERS as readonly string[]).includes(value)
    ? (value as AdminComplaintFilter)
    : DEFAULT_FILTER
}

/** The list with a chip chosen: `/complaints` for the default, so Back is tidy. */
export function complaintsListHref(show: AdminComplaintFilter): string {
  return show === DEFAULT_FILTER ? '/complaints' : `/complaints?show=${show}`
}

/** The line under the chips: what the chosen one holds. */
export function complaintFilterHint(show: AdminComplaintFilter): string {
  switch (show) {
    case 'open':
      return 'Waiting on us: not acknowledged yet, or acknowledged and not resolved. Oldest first.'
    case 'overdue':
      return `Not acknowledged within ${COMPLAINT_ACKNOWLEDGE_HOURS} hours, or not resolved within ${COMPLAINT_RESOLVE_DAYS} days. Oldest first.`
    case 'resolved':
      return 'Resolved or closed. Newest first.'
    case 'all':
      return 'Every complaint. Newest first.'
  }
}

/** What being overdue means for this one, in a few words, or null. */
export function overdueLabel(complaint: Pick<AdminComplaint, 'overdue'>): string | null {
  if (complaint.overdue === 'acknowledge') return `Not acknowledged in ${COMPLAINT_ACKNOWLEDGE_HOURS} h`
  if (complaint.overdue === 'resolve') return `Not resolved in ${COMPLAINT_RESOLVE_DAYS} days`
  return null
}

/** What the team can do next, for the detail's buttons. Mirrors COMPLAINT_ACTION_FROM on the server. */
export function complaintActions(status: AdminComplaint['status']) {
  return {
    acknowledge: status === 'open',
    resolve: status === 'open' || status === 'acknowledged',
    close: status !== 'closed',
  }
}

// ─── Logged complaints ───────────────────────────────────────────────────────

/**
 * How it reached us, for a card: "In the app", or "By phone · logged by
 * Ravi" for one the team logged.
 */
export function complaintSourceLine(complaint: Pick<AdminComplaint, 'source' | 'loggedBy'>): string {
  const how = COMPLAINT_SOURCE_LABELS[complaint.source]
  return complaint.source === 'app' || !complaint.loggedBy ? how : `${how} · logged by ${complaint.loggedBy}`
}

/** The ten digits of a whole Indian mobile as typed, or null while it is not one yet. */
export function wholeMobile(typed: string): string | null {
  const digits = normaliseIndianMobile(typed)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

/** A whole booking reference as typed ("#3F2A9C1B", "3f2a9c1b"), or null while it is not one yet. */
export function wholeBookingRef(typed: string): string | null {
  const ref = typed.trim().replace(/^#/, '').toLowerCase()
  return /^[0-9a-f]{8}$/.test(ref) ? ref : null
}

const HOUR_MS = 60 * 60 * 1000

/**
 * What stops the log form from being sent, one line per field, or nothing.
 * The server checks the same (and refuses with its own words); this is so
 * the button says why before anyone presses it. `receivedAt` is the ISO
 * time the form's India-time field reads as, null when it is not a time.
 */
export function logComplaintProblems(
  form: {
    phone: string
    /** Whether the phone is an account's (null while not looked up yet). */
    hasAccount: boolean | null
    customerName: string
    message: string
    bookingRef: string
    receivedAt: string | null
    loggedBy: string
  },
  now: Date
): string[] {
  const problems: string[] = []
  if (!wholeMobile(form.phone)) problems.push('Enter their 10-digit mobile number.')
  if (form.hasAccount === false && !form.customerName.trim()) {
    problems.push("No account has this number: type the customer's name.")
  }
  const words = form.message.trim().length
  if (words < COMPLAINT_MESSAGE_MIN) {
    problems.push(`Write what they said: at least ${COMPLAINT_MESSAGE_MIN} characters.`)
  } else if (words > COMPLAINT_MESSAGE_MAX) {
    problems.push(`What they said can be at most ${COMPLAINT_MESSAGE_MAX} characters.`)
  }
  if (form.bookingRef.trim() && !wholeBookingRef(form.bookingRef)) {
    problems.push('A booking reference is 8 letters and numbers, like #3F2A9C1B.')
  }
  if (!form.receivedAt) {
    problems.push('Say when it was received.')
  } else {
    const at = Date.parse(form.receivedAt)
    if (at > now.getTime() + 5 * 60 * 1000) problems.push("When it was received can't be in the future.")
    else if (at < now.getTime() - MAX_RECEIVED_DAYS_BACK * 24 * HOUR_MS) {
      problems.push(`It can be dated at most ${MAX_RECEIVED_DAYS_BACK} days back.`)
    }
  }
  if (form.loggedBy.trim().length < 2) problems.push('Type your name.')
  return problems
}
