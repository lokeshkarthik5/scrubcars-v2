/**
 * The admin Requests page (0064): its filters, and what each request says
 * where it stands. Pure, unit-tested in requests.test.ts. Which filter a
 * request is under, and its state, come from the API (customer reach's own
 * rules); this only words them.
 */
import type {
  AdminRequest,
  AdminRequestFilter,
} from '@repo/core/api/admin-requests'
import { istClock, istStartLabel } from '@repo/core/booking-requests'

export const REQUEST_FILTERS: ReadonlyArray<{
  value: AdminRequestFilter
  label: string
}> = [
  { value: 'open', label: 'Open' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'failed', label: 'Failed' },
  { value: 'all', label: 'All' },
]

/** The page's `?filter=`: Open unless it names another. */
export function parseRequestFilter(value: string | null): AdminRequestFilter {
  return REQUEST_FILTERS.some((option) => option.value === value)
    ? (value as AdminRequestFilter)
    : 'open'
}

/** The page's `?zone=`: a zone's slug, or none. */
export function parseZoneSlug(value: string | null): string | null {
  return value && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) ? value : null
}

/** The page's address for a filter and zone (Open and no zone: the bare page). */
export function requestsHref(
  filter: AdminRequestFilter,
  zone: string | null
): string {
  const params = new URLSearchParams()
  if (filter !== 'open') params.set('filter', filter)
  if (zone) params.set('zone', zone)
  const query = params.toString()
  return query ? `/requests?${query}` : '/requests'
}

/** "1 h 20 min", "12 min", "under a minute"; null once it has passed. */
export function timeLeft(iso: string, now: number): string | null {
  const ms = Date.parse(iso) - now
  if (ms <= 0) return null
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** "40 min ago", "2 h 5 min ago", "just now". */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes} min ago`
  if (hours >= 24) return `${Math.floor(hours / 24)} d ago`
  return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`
}

/** The chip on a request: where it stands. */
export function requestStateLabel(
  request: Pick<AdminRequest, 'state'>
): string {
  switch (request.state) {
    case 'waiting':
      return 'Waiting for the garage'
    case 'accepted':
      return 'Accepted, not paid yet'
    case 'booked':
      return 'Booked'
    case 'lapsed':
      return 'Yes lapsed'
    case 'no_garage':
      return 'Nobody accepted'
    case 'cancelled':
      return 'Cancelled'
  }
}

/** The chip's tone, by the same states. */
export function requestStateTone(
  request: Pick<AdminRequest, 'state'>
): 'attention' | 'progress' | 'done' | 'late' | 'closed' {
  switch (request.state) {
    case 'waiting':
      return 'attention'
    case 'accepted':
      return 'progress'
    case 'booked':
      return 'done'
    case 'no_garage':
      return 'late'
    default:
      return 'closed'
  }
}

/**
 * The line with the clock on it: how long an open one has had and has
 * left, or how a closed one ended.
 */
export function requestClockLine(
  request: Pick<
    AdminRequest,
    | 'state'
    | 'sentAt'
    | 'respondBy'
    | 'confirmBy'
    | 'acceptedStartAt'
    | 'travelFee'
    | 'cancelledBy'
    | 'cancelledByName'
    | 'cancelReason'
    | 'garage'
  >,
  now: number
): string {
  switch (request.state) {
    case 'waiting': {
      const left = timeLeft(request.respondBy, now)
      return `Sent to ${request.garage.name} ${timeAgo(request.sentAt, now)}, no answer yet · ${left ? `${left} left to answer` : 'time to answer is up'}`
    }
    case 'accepted': {
      const left = request.confirmBy ? timeLeft(request.confirmBy, now) : null
      const start = request.acceptedStartAt
        ? `starts ${istStartLabel(request.acceptedStartAt)}`
        : 'accepted'
      const by = request.confirmBy
        ? ` · customer to confirm by ${istClock(request.confirmBy)}${left ? ` (${left} left)` : ''}`
        : ''
      return `${request.garage.name} said yes, ${start}${by}`
    }
    case 'booked':
      return `Booked with ${request.garage.name}${request.acceptedStartAt ? ` for ${istStartLabel(request.acceptedStartAt)}` : ''}`
    case 'lapsed':
      return `${request.garage.name} said yes; the customer did not confirm in time`
    case 'no_garage':
      return 'Nobody accepted: the last garage said no or did not answer in time'
    case 'cancelled':
      return request.cancelledBy === 'detlio'
        ? `Cancelled by ${request.cancelledByName ?? 'Detlio'}: “${request.cancelReason ?? ''}”`
        : 'Cancelled by the customer'
  }
}

/** "Passed on from Marina Auto Spa (couldn't take it)", or null for a request still at its first garage. */
export function chainLine(request: Pick<AdminRequest, 'chain'>): string | null {
  const earlier = request.chain.slice(0, -1)
  if (earlier.length === 0) return null
  return `Passed on from ${earlier
    .map(
      (row) =>
        `${row.garage.name} (${row.reply === 'declined' ? 'couldn’t take it' : 'no answer in time'})`
    )
    .join(', ')}`
}

/** Waiting for the garage's answer: "Call garage" is offered. */
export function needsGarageCall(request: Pick<AdminRequest, 'state'>): boolean {
  return request.state === 'waiting'
}

/** Open (waiting or accepted): Cancel is offered. */
export function canCancelRequest(
  request: Pick<AdminRequest, 'filter'>
): boolean {
  return request.filter === 'open'
}
