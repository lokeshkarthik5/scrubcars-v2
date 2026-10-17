import { and, asc, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, payments, vendors } from '../../db/schema.js'

export const opsRepository = {
  /**
   * Paid bookings still waiting for their garage, starting after `after`.
   *
   * "Waiting since" is the later of the booking's creation and its payment:
   * equal for a normal checkout; the move time for a rescheduled booking (a
   * new row carrying the old payment); the payment time for one paid later.
   * Unpaid bookings are left out — garages only see paid ones.
   */
  listPaidPendingBookings(after: Date) {
    return db
      .select({
        id: bookings.id,
        scheduledAt: bookings.scheduledAt,
        bookingType: bookings.bookingType,
        amount: bookings.amount,
        waitingSince: sql<Date>`greatest(${bookings.createdAt}, ${payments.paidAt})`.mapWith(
          bookings.createdAt
        ),
        garageName: vendors.businessName,
        garagePhone: vendors.phone,
      })
      .from(bookings)
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(
        and(
          eq(bookings.status, 'pending'),
          eq(payments.status, 'paid'),
          gt(bookings.scheduledAt, after)
        )
      )
      .orderBy(asc(bookings.scheduledAt))
  },

  /**
   * Accepted, paid pickup & drop jobs whose time is between `after` and
   * `before` with no Picked up: the driver has not collected the car.
   * `waitingSince` is the slot, which is what the digest measures late from.
   */
  listUncollectedPickups(after: Date, before: Date) {
    return db
      .select({
        id: bookings.id,
        scheduledAt: bookings.scheduledAt,
        bookingType: bookings.bookingType,
        amount: bookings.amount,
        waitingSince: bookings.scheduledAt,
        garageName: vendors.businessName,
        garagePhone: vendors.phone,
      })
      .from(bookings)
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(
        and(
          eq(bookings.bookingType, 'pickup'),
          eq(bookings.status, 'confirmed'),
          isNull(bookings.pickedUpAt),
          eq(payments.status, 'paid'),
          gt(bookings.scheduledAt, after),
          lte(bookings.scheduledAt, before)
        )
      )
      .orderBy(asc(bookings.scheduledAt))
  },
}
