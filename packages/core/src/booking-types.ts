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
  pickup: 'Pickup & drop',
}

/** What every screen assumes until the customer says otherwise. */
export const DEFAULT_BOOKING_TYPE: BookingType = 'dropin'

/**
 * How far ahead a booking must start: 1 hour at the garage, 3 for doorstep
 * and pickup & drop. Mirrors MIN_NOTICE_MS in apps/server/src/lib/slots.ts,
 * which is what actually enforces it — change both together.
 */
export const MIN_NOTICE_MINS: Record<BookingType, number> = {
  dropin: 60,
  doorstep: 180,
  pickup: 180,
}

/** Whether a slot starts far enough ahead. Exactly on the line counts, as on the server. */
export function meetsNotice(iso: string, type: BookingType, now: number = Date.now()): boolean {
  return new Date(iso).getTime() >= now + MIN_NOTICE_MINS[type] * 60_000
}

/** "At-garage bookings need at least 1 hour's notice." */
export function noticeSentence(type: BookingType): string {
  const hours = MIN_NOTICE_MINS[type] / 60
  const notice = hours === 1 ? "1 hour's notice" : `${hours} hours' notice`
  switch (type) {
    case 'doorstep':
      return `Doorstep visits need at least ${notice}.`
    case 'pickup':
      return `Pickup & drop needs at least ${notice}.`
    case 'dropin':
      return `At-garage bookings need at least ${notice}.`
  }
}

/**
 * Once the garage has accepted, cancelling or moving a booking closes this
 * long before its start. Mirrors CANCELLATION_CUTOFF_MS on the server.
 */
export const CONFIRMED_CHANGE_CUTOFF_MINS = 120

/**
 * How many times a booking can be moved, across its whole reschedule chain.
 * Mirrors MAX_RESCHEDULES in apps/server/src/modules/bookings/bookings.service.ts,
 * which enforces it — change both together.
 */
export const MAX_RESCHEDULES = 2

/** How many days, today included, the slot picker offers. */
export const BOOKING_DAYS_AHEAD = 7

/**
 * How long a checkout lasts before it expires, in minutes. Mirrors
 * INTENT_TTL_MS in apps/server/src/modules/booking-intents/booking-intents.service.ts.
 */
export const CHECKOUT_MINUTES = 30

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

/**
 * Reads a `?mode=` value. Anything unrecognised is "no choice made".
 * Pickup & drop is a customer choice like the other two; a garage that does
 * not offer it is caught by resolveBookingType, as for doorstep.
 */
export function parseBookingType(value: string | string[] | null | undefined): BookingType | null {
  return value === 'dropin' || value === 'doorstep' || value === 'pickup' ? value : null
}

/** Every mode, in the order the switches show them. */
export const BOOKING_TYPES: readonly BookingType[] = ['dropin', 'doorstep', 'pickup']

type ModeFlags = Pick<Vendor, 'dropinEnabled' | 'doorstepEnabled'> & Partial<Pick<Vendor, 'pickupEnabled'>>

/** Whether a garage offers a mode. `pickupEnabled` is absent from older servers: off. */
export function offersBookingType(vendor: ModeFlags, type: BookingType): boolean {
  switch (type) {
    case 'dropin':
      return vendor.dropinEnabled
    case 'doorstep':
      return vendor.doorstepEnabled
    case 'pickup':
      return vendor.pickupEnabled === true
  }
}

/**
 * The modes a garage offers, in switch order. The garage page and checkout
 * show their switch only when this has two or more.
 */
export function offeredBookingTypes(vendor: ModeFlags): BookingType[] {
  return BOOKING_TYPES.filter((type) => offersBookingType(vendor, type))
}

/**
 * The mode a garage will actually be booked in.
 *
 * The customer's choice wins when the garage offers it. When it does not — a
 * Doorstep search led to a garage that has since stopped travelling, or a
 * hand-edited link — the garage's own mode stands in rather than a choice it
 * would refuse at payment: at the garage first, then doorstep, then pickup &
 * drop. Before the garage has loaded, the choice is taken at its word so the
 * screen does not flicker to the default and back.
 */
export function resolveBookingType(preferred: BookingType | null, vendor: ModeFlags | null): BookingType {
  if (!vendor) return preferred ?? DEFAULT_BOOKING_TYPE
  if (preferred && offersBookingType(vendor, preferred)) return preferred
  return offeredBookingTypes(vendor)[0] ?? DEFAULT_BOOKING_TYPE
}

/**
 * The short, human-quotable booking number ("#3F2A9C1B" on screen): the first
 * eight characters of the booking's id. Support finds a booking by it, so every
 * screen and message that names a booking uses this one form.
 */
export function bookingReference(id: string): string {
  return id.slice(0, 8).toUpperCase()
}
