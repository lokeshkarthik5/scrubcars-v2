import type { Booking } from '@repo/core/types'

/**
 * The two halves of the customer's My bookings: what is still to happen, and
 * what is over. Pure and clock-free, so the split is unit-tested.
 */
export type BookingListTab = 'upcoming' | 'past'

/** The tab a link opens on when it names none. */
export const DEFAULT_BOOKING_LIST_TAB: BookingListTab = 'upcoming'

/**
 * Which tab a booking is listed under, or null when it is not listed at all.
 *
 * Decided by status alone, not by the clock: a confirmed booking whose time
 * has passed is still Upcoming, because the garage has not finished it and the
 * customer may still need to act on it. Only a status that has ended moves a
 * booking to Past.
 *
 * Not listed: the old half of a move. A reschedule used to retire it as
 * 'rescheduled', and today cancels it (`moved`); either way the customer's
 * booking is the new one, which carries the payment, and listing the old one
 * too would show one job twice, one of them as "Cancelled".
 *
 * Every status is placed by name, so a new one fails the build here until
 * someone decides where it goes.
 */
export function bookingListTab(
  booking: Pick<Booking, 'status' | 'moved'>
): BookingListTab | null {
  switch (booking.status) {
    case 'pending':
    case 'confirmed':
    case 'in_progress':
      return 'upcoming'
    // Completed, declined by the garage, cancelled by anyone, a no-show of
    // either side: all of them cancelled or completed on the row.
    case 'completed':
      return 'past'
    case 'cancelled':
      return booking.moved ? null : 'past'
    case 'rescheduled':
      return null
    default: {
      // Unreachable while the switch covers BookingStatus. At run time it is
      // a status from a server newer than this build, which is shown under
      // Past rather than hidden: a booking missing from the list is the worse
      // mistake.
      const unplaced: never = booking.status
      void unplaced
      return 'past'
    }
  }
}

/** Reads `?tab=`. Anything but "past" is the default tab. */
export function parseBookingListTab(value: string | null | undefined): BookingListTab {
  return value === 'past' ? 'past' : DEFAULT_BOOKING_LIST_TAB
}

/**
 * The scheduled start in ms. An unreadable one counts as the far future, which
 * a server's ISO string never is; it only keeps the sort well-defined.
 */
const startOf = (booking: Pick<Booking, 'scheduledAtIso'>) => {
  const ms = Date.parse(booking.scheduledAtIso)
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
}

/**
 * The customer's bookings split into the two tabs, each in the order it is
 * read: Upcoming soonest first, Past most recent first.
 *
 * Ordered by the real start time (`scheduledAtIso`), never the display string,
 * which sorts "1 Nov" before "9 Oct". Ties fall back to the id so the order
 * does not shuffle between refreshes.
 */
export function splitBookingList<
  T extends Pick<Booking, 'id' | 'status' | 'moved' | 'scheduledAtIso'>,
>(bookings: readonly T[]): Record<BookingListTab, T[]> {
  const byStart = (a: T, b: T) => startOf(a) - startOf(b) || a.id.localeCompare(b.id)

  const upcoming = bookings.filter((b) => bookingListTab(b) === 'upcoming').sort(byStart)
  const past = bookings
    .filter((b) => bookingListTab(b) === 'past')
    .sort((a, b) => byStart(b, a))

  return { upcoming, past }
}
