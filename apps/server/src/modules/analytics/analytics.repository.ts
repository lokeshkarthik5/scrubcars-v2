import { eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { analyticsEvents, bookingItems, bookings, payments } from '../../db/schema.js'

export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert

export const analyticsRepository = {
  /** One insert for a whole batch: a single short statement on the one connection. */
  insertEvents(rows: NewAnalyticsEvent[]) {
    if (rows.length === 0) return Promise.resolve()
    return db.insert(analyticsEvents).values(rows).then(() => undefined)
  },

  /**
   * What booking_paid and booking_cancelled say about a booking: its garage,
   * type, how many services, what was paid and in which Razorpay mode, and
   * where its payment stands. Ids and enums only; nothing about the
   * customer.
   */
  async bookingFacts(bookingId: string) {
    const [row] = await db
      .select({
        vendorId: bookings.vendorId,
        bookingType: bookings.bookingType,
        amount: bookings.amount,
        paymentStatus: payments.status,
        gatewayMode: payments.gatewayMode,
        serviceCount: sql<number>`(select count(*)::int from ${bookingItems} where ${bookingItems.bookingId} = ${bookings.id})`,
      })
      .from(bookings)
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .where(eq(bookings.id, bookingId))
      .limit(1)
    return row ?? null
  },

  /**
   * Deletes up to `limit` events from before `cutoff`, oldest first. By id
   * through a LIMITed subquery on the occurred_at index, so one call is one
   * bounded index range however much has piled up.
   */
  async deleteOlderThan(cutoff: Date, limit: number): Promise<number> {
    const deleted = await db
      .delete(analyticsEvents)
      .where(
        inArray(
          analyticsEvents.id,
          db
            .select({ id: analyticsEvents.id })
            .from(analyticsEvents)
            .where(lt(analyticsEvents.occurredAt, cutoff))
            .orderBy(analyticsEvents.occurredAt)
            .limit(limit)
        )
      )
      .returning({ id: analyticsEvents.id })
    return deleted.length
  },
}
