import type { BookingType, Vendor } from '@repo/core/types'

/**
 * What a customer calls each way of being served.
 *
 * One pair of names for every screen that shows the choice. It used to have
 * three — "At Garage" on home and the garage page, "Drop In" in checkout, "At
 * Garage Mode" on the booking — which made one decision read as three
 * different ones. Keyed exhaustively on BookingType, so a new mode cannot ship
 * without a name.
 */
export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  dropin: 'At garage',
  doorstep: 'Doorstep',
}

/** What every screen assumes until the customer says otherwise. */
export const DEFAULT_BOOKING_TYPE: BookingType = 'dropin'

/**
 * The `?mode=` a link should carry for a choice, or null when there is nothing
 * to carry.
 *
 * Only a departure from the default travels. A link without `mode` already
 * means "at the garage", so spelling it out would change every URL in the
 * common case to say nothing new.
 */
export function bookingTypeParam(type: BookingType): BookingType | null {
  return type === DEFAULT_BOOKING_TYPE ? null : type
}

/** Reads a `?mode=` value. Anything unrecognised is "no choice made". */
export function parseBookingType(
  value: string | string[] | null | undefined
): BookingType | null {
  return value === 'dropin' || value === 'doorstep' ? value : null
}

/**
 * The mode a garage will actually be booked in.
 *
 * The customer's choice wins when the garage offers it. When it does not — a
 * Doorstep search led to a garage that has since stopped travelling, or a
 * hand-edited link — the garage's own mode stands in rather than a choice it
 * would refuse at payment. Before the garage has loaded, the choice is taken
 * at its word so the screen does not flicker to the default and back.
 */
export function resolveBookingType(
  preferred: BookingType | null,
  vendor: Pick<Vendor, 'dropinEnabled' | 'doorstepEnabled'> | null
): BookingType {
  if (!vendor) return preferred ?? DEFAULT_BOOKING_TYPE

  const offers = (type: BookingType) =>
    type === 'dropin' ? vendor.dropinEnabled : vendor.doorstepEnabled

  if (preferred && offers(preferred)) return preferred
  if (offers(DEFAULT_BOOKING_TYPE)) return DEFAULT_BOOKING_TYPE
  return vendor.doorstepEnabled ? 'doorstep' : DEFAULT_BOOKING_TYPE
}

/**
 * The short, human-quotable booking number ("#3F2A9C1B" on screen): the first
 * eight characters of the booking's id. Support finds a booking by it, so every
 * screen and message that names a booking uses this one form.
 */
export function bookingReference(id: string): string {
  return id.slice(0, 8).toUpperCase()
}
