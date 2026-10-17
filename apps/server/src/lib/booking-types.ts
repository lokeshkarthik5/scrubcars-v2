/**
 * The ways a booking can be done, and the few facts every part of the API
 * reads off the type. Keyed exhaustively, so a new type cannot ship without
 * a name, a notice period or an answer to "is there a customer address".
 *
 *   dropin    At garage: the customer brings the car.
 *   doorstep  Doorstep: the garage's crew works at the customer's address.
 *   pickup    Pickup & drop (0037): the garage collects the car from the
 *             customer's address, works on it at the garage and brings it
 *             back (lib/pickup.ts).
 *
 * The apps' labels are packages/core/src/booking-types.ts
 * (BOOKING_TYPE_LABELS); pickup.parity.test.ts keeps the two together.
 */

import type { bookingTypeEnum } from '../db/schema.js'

export type BookingType = (typeof bookingTypeEnum.enumValues)[number]

export const BOOKING_TYPES: readonly BookingType[] = ['dropin', 'doorstep', 'pickup']

/** What the team, the garage and the customer call each type. */
export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  dropin: 'At garage',
  doorstep: 'Doorstep',
  pickup: 'Pickup & drop',
}

/** A label for a type read from a row typed as a plain string. */
export function bookingTypeLabel(type: string): string {
  return isBookingType(type) ? BOOKING_TYPE_LABELS[type] : 'At garage'
}

export function isBookingType(value: string): value is BookingType {
  return (BOOKING_TYPES as readonly string[]).includes(value)
}

/**
 * Whether the booking is at the customer's address — the crew goes there
 * (doorstep), or the car is collected from there (pickup). Such a booking
 * needs a saved address with a map pin inside the garage's reach, and
 * snapshots it onto the row; the garage's job card shows it with Directions
 * and admin shows it. A drop-in has no address.
 */
export function usesCustomerAddress(type: BookingType): boolean {
  switch (type) {
    case 'doorstep':
    case 'pickup':
      return true
    case 'dropin':
      return false
  }
}
