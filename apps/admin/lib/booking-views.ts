/**
 * The Bookings list's saved views (0059, pattern 03): Needs action, Today,
 * Upcoming, Completed, Cancelled and All, with counts from
 * `GET /admin/bookings/views`. They replace the six status chips and the
 * "Needs action first" box. Pure, tested in booking-views.test.ts.
 */
import type {
  AdminBooking,
  AdminBookingFilters,
  AdminBookingView,
  AdminBookingViewCounts,
} from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'

export const BOOKING_VIEWS: ReadonlyArray<{
  value: AdminBookingView
  label: string
}> = [
  { value: 'needs_action', label: 'Needs action' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
]

export function isBookingView(value: unknown): value is AdminBookingView {
  return BOOKING_VIEWS.some((view) => view.value === value)
}

/**
 * The view a list opens on with no `?view=`: Needs action, the work to do
 * now. A search looks everywhere instead, since a reference read out over
 * the phone is wanted whatever state the booking is in.
 */
export function defaultView(q: string | null | undefined): AdminBookingView {
  return q?.trim() ? 'all' : 'needs_action'
}

/** `?view=` read as an allow-list, else the default for the search. */
export function parseView(
  value: string | null | undefined,
  q: string | null | undefined
): AdminBookingView {
  return isBookingView(value) ? value : defaultView(q)
}

/** What `?view=` holds for a chosen view: nothing when it is the default. */
export function viewParam(
  view: AdminBookingView,
  q: string | null | undefined
): string | null {
  return view === defaultView(q) ? null : view
}

/** The API's `view` filter: All is no filter. */
export function viewFilter(
  view: AdminBookingView
): Exclude<AdminBookingView, 'all'> | undefined {
  return view === 'all' ? undefined : view
}

/** Each view with its count, or none while counts are unknown. */
export function viewsWithCounts(
  counts: AdminBookingViewCounts | undefined | null
): Array<{ value: AdminBookingView; label: string; count?: number }> {
  return BOOKING_VIEWS.map((view) => ({
    ...view,
    count: counts ? counts[view.value] : undefined,
  }))
}

/**
 * An API older than the views answers `/bookings/views` with 404 and
 * ignores `?view=`. Then the views show without counts and the panel
 * applies them to the loaded rows itself (matchesView), so a view never
 * shows rows it shouldn't.
 */
export function viewsUnsupported(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

const IST_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const istDay = (at: number) => Math.floor((at + IST_MS) / DAY_MS)

/**
 * Paid and waiting for its garage (not a Test booking), or money owed back:
 * the server's `needs_action`, as Today's waiting list reads it.
 */
export function bookingNeedsAction(
  b: Pick<AdminBooking, 'status' | 'payment' | 'markedTest' | 'refundOwed'>
): boolean {
  if (b.refundOwed) return true
  return b.status === 'pending' && b.payment?.status === 'paid' && !b.markedTest
}

/**
 * A view's rule on one booking, for an API older than the views: Today is
 * the slot's day in India, Upcoming any later day not cancelled, and
 * Completed and Cancelled the status.
 */
export function matchesView(
  b: Pick<
    AdminBooking,
    'status' | 'payment' | 'markedTest' | 'refundOwed' | 'scheduledAt'
  >,
  view: AdminBookingView,
  now: number
): boolean {
  switch (view) {
    case 'needs_action':
      return bookingNeedsAction(b)
    case 'today':
      return istDay(Date.parse(b.scheduledAt)) === istDay(now)
    case 'upcoming':
      return (
        istDay(Date.parse(b.scheduledAt)) > istDay(now) &&
        b.status !== 'cancelled'
      )
    case 'completed':
      return b.status === 'completed'
    case 'cancelled':
      return b.status === 'cancelled'
    default:
      return true
  }
}

/** What an empty view says. */
export function emptyViewText(
  view: AdminBookingView,
  filtered: boolean
): string {
  if (filtered)
    return 'Nothing matches these filters. Try a reference, a receipt number, a phone number or a name.'
  switch (view) {
    case 'needs_action':
      return 'Nothing needs action. No booking is waiting for its garage, and no refund is owed.'
    case 'today':
      return 'No bookings today.'
    case 'upcoming':
      return 'No bookings coming up.'
    case 'completed':
      return 'No completed bookings yet.'
    case 'cancelled':
      return 'No cancelled bookings.'
    default:
      return 'Bookings will appear here once customers start booking.'
  }
}

// ─── Type and Payment filters (mockup 03) ────────────────────────────────────

export type BookingTypeFilter = NonNullable<AdminBookingFilters['bookingType']>
export type PaymentFilter = NonNullable<AdminBookingFilters['payment']>

/** `?type=`: how the car is served, in the panel's words. */
export const TYPE_FILTERS: ReadonlyArray<{
  value: BookingTypeFilter
  label: string
}> = [
  { value: 'dropin', label: BOOKING_TYPE_LABELS.dropin },
  { value: 'doorstep', label: BOOKING_TYPE_LABELS.doorstep },
  { value: 'pickup', label: BOOKING_TYPE_LABELS.pickup },
]

/** `?payment=`: paid online, to pay at the garage, or a refund owed. */
export const PAYMENT_FILTERS: ReadonlyArray<{
  value: PaymentFilter
  label: string
}> = [
  { value: 'paid', label: 'Paid' },
  { value: 'pay_later', label: 'Pay at garage' },
  { value: 'refund_owed', label: 'Money owed' },
]

/** `?type=` read as an allow-list; anything else is no filter. */
export function parseTypeFilter(
  value: string | null | undefined
): BookingTypeFilter | null {
  return TYPE_FILTERS.find((f) => f.value === value)?.value ?? null
}

/** `?payment=` read as an allow-list; anything else is no filter. */
export function parsePaymentFilter(
  value: string | null | undefined
): PaymentFilter | null {
  return PAYMENT_FILTERS.find((f) => f.value === value)?.value ?? null
}

// ─── The Today view's groups ─────────────────────────────────────────────────

export const NEEDS_ATTENTION_GROUP = 'Needs attention'
export const ON_TRACK_GROUP = 'Today · on track'
/** The order they show in: what needs a call first (mockup 03). */
export const TODAY_GROUPS = [NEEDS_ATTENTION_GROUP, ON_TRACK_GROUP] as const

/**
 * A Today booking's group, from its row tone: late or due soon needs
 * attention, everything else is on track. No groups in the other views.
 */
export function todayGroup(
  view: AdminBookingView,
  tone: 'urgent' | 'attention' | null
): string | null {
  if (view !== 'today') return null
  return tone ? NEEDS_ATTENTION_GROUP : ON_TRACK_GROUP
}
