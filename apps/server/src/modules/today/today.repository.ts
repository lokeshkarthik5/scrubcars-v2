import { and, asc, count, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, payments, users, vendors } from '../../db/schema.js'

/** "Foam wash + Interior": a booking's services, in the order they were added. */
const serviceNames = sql<string>`coalesce((
  select string_agg(bi.name, ' + ' order by bi.created_at, bi.id)
  from booking_items bi where bi.booking_id = ${bookings.id}
), '')`

/** Paid, waiting for the garage, not Test, starting after `after`. */
const waitingWhere = (after: Date) =>
  and(
    eq(bookings.status, 'pending'),
    eq(payments.status, 'paid'),
    isNull(bookings.markedTestAt),
    gt(bookings.scheduledAt, after)
  )

export const todayRepository = {
  /**
   * Paid bookings still waiting for their garage, starting after `after`:
   * the pending digest's rule (opsRepository.listPaidPendingBookings), with
   * the customer and the services for the inbox's line. Unpaid bookings are
   * left out, as garages only see paid ones; so are bookings ops marked Test.
   */
  listWaitingBookings(after: Date, limit: number) {
    return db
      .select({
        id: bookings.id,
        scheduledAt: bookings.scheduledAt,
        amount: bookings.amount,
        respondBy: bookings.respondBy,
        garageName: vendors.businessName,
        garagePhone: vendors.phone,
        customerName: users.name,
        services: serviceNames,
      })
      .from(bookings)
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .leftJoin(users, eq(users.id, bookings.userId))
      .where(waitingWhere(after))
      .orderBy(asc(bookings.scheduledAt))
      .limit(limit)
  },

  /** How many there are in all, for when the list above is cut short. */
  async countWaitingBookings(after: Date) {
    const [row] = await db
      .select({ n: count() })
      .from(bookings)
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .where(waitingWhere(after))
    return row?.n ?? 0
  },

  /** The day's bookings by slot time, Test ones left out: "Coming up today". */
  listDay(start: Date, end: Date) {
    return db
      .select({
        id: bookings.id,
        scheduledAt: bookings.scheduledAt,
        status: bookings.status,
        bookingType: bookings.bookingType,
        customerName: users.name,
        garageName: vendors.businessName,
        services: serviceNames,
      })
      .from(bookings)
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .leftJoin(users, eq(users.id, bookings.userId))
      .where(
        and(
          gte(bookings.scheduledAt, start),
          lt(bookings.scheduledAt, end),
          isNull(bookings.markedTestAt)
        )
      )
      .orderBy(asc(bookings.scheduledAt))
      .limit(300)
  },
}
