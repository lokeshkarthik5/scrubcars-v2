import type { AdminComplaint, AdminComplaintFilter } from '@repo/core/api/admin'
import { COMPLAINT_ACKNOWLEDGE_HOURS, COMPLAINT_RESOLVE_DAYS } from '@repo/core/complaints'

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
