import { bookingTypeParam, resolveBookingType } from '@repo/core/booking-types'
import { bookingListTab } from '@repo/core/my-bookings'
import type { Booking, BookingType, Vendor } from '@repo/core/types'

/**
 * Whether a booking's page offers "Book again": once it is over (the Past
 * tab of My bookings). A booking that is still on has nothing to repeat yet,
 * and the old half of a move is not the customer's booking any more.
 */
export function canBookAgain(booking: Pick<Booking, 'status' | 'moved'>): boolean {
  return bookingListTab(booking) === 'past'
}

/**
 * Where "Book again" goes: checkout at the same garage, with the same
 * services in the same order and the same mode, in the query checkout already
 * reads (`service`, comma-separated; `mode`, only when not the default — see
 * bookingTypeParam).
 *
 * Nothing about the old time, car or code travels: those are the new
 * booking's to choose. Checkout drops a service the garage no longer offers
 * and says so (see pickRequestedServices). A booking with no service ids at
 * all (one from before line items) goes to the garage page instead, where the
 * customer can pick.
 */
export function bookAgainPath(
  booking: Pick<Booking, 'vendorId' | 'bookingType' | 'items'>
): string {
  return bookAgainPathFor({
    vendorId: booking.vendorId,
    bookingType: booking.bookingType,
    serviceIds: booking.items.map((item) => item.serviceId),
  })
}

/**
 * bookAgainPath from the bare ids, as Home's Book again tile has them (the
 * server sends the last job's garage, mode and services, not a booking).
 */
export function bookAgainPathFor(job: {
  vendorId: string
  bookingType: BookingType
  serviceIds: string[]
}): string {
  const ids = [...new Set(job.serviceIds.filter(Boolean))]
  const mode = bookingTypeParam(job.bookingType)
  const modeQuery = mode ? `mode=${mode}` : ''

  if (ids.length === 0) {
    return `/garage/${job.vendorId}${modeQuery ? `?${modeQuery}` : ''}`
  }
  return `/book/${job.vendorId}?service=${ids.join(',')}${modeQuery ? `&${modeQuery}` : ''}`
}

/**
 * Where Book again goes when the garage sells none of the last job's
 * services any more: its page, saying so (`withdrawn`), in the old mode. The
 * same link checkout's own redirect builds when every requested service is
 * gone, so the customer reads one explanation whichever way they came.
 */
export function withdrawnPathFor(job: { vendorId: string; bookingType: BookingType }): string {
  const next = new URLSearchParams({ withdrawn: '1' })
  const mode = bookingTypeParam(job.bookingType)
  if (mode) next.set('mode', mode)
  return `/garage/${job.vendorId}?${next.toString()}`
}

/**
 * Reads checkout's `?service=` against what the garage sells today.
 *
 * `requested` is every id asked for, once each, in the order given — that
 * order is the customer's, and the summary and the booking's line items keep
 * it. `picked` is those still on sale, in the same order. The difference is
 * what the garage stopped offering since the link was made (an old booking
 * repeated, a tab left open), which checkout tells the customer about rather
 * than booking something else in its place.
 */
export function pickRequestedServices<T extends { id: string }>(
  param: string | null | undefined,
  catalogue: readonly T[]
): { requested: string[]; picked: T[] } {
  const requested = [...new Set((param ?? '').split(',').map((id) => id.trim()).filter(Boolean))]
  const picked = requested
    .map((id) => catalogue.find((service) => service.id === id))
    .filter((service): service is T => service != null)
  return { requested, picked }
}

/**
 * The mode a checkout link asked for that the garage no longer offers, or
 * null when there is nothing to say.
 *
 * Book again carries the old booking's mode, but a garage can switch doorstep
 * or at-garage off after the fact, and checkout then books the mode it still
 * offers (see resolveBookingType). Where the garage offers only one mode the
 * toggle is hidden, so without this the only trace of the switch is the
 * notice line under the time picker, and a customer could pay for an
 * at-garage job expecting a visit at home. Null until the garage has loaded:
 * before then the choice is taken at its word.
 */
export function unofferedMode(
  asked: BookingType | null,
  vendor: Pick<Vendor, 'dropinEnabled' | 'doorstepEnabled'> | null
): BookingType | null {
  if (!asked || !vendor) return null
  return resolveBookingType(asked, vendor) === asked ? null : asked
}
