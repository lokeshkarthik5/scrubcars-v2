import { and, asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingItems,
  bookingTimeProposals,
  bookings,
  payments,
  servicePackageItems,
  services,
  vendors,
} from '../../db/schema.js'

export const garageResponseRepository = {
  /**
   * Paid pending bookings past their garage's deadline to answer, with no
   * suggested times waiting for the customer (0042): what the cron cancels
   * as not accepted in time. Oldest deadline first, at most `limit` (a
   * bounded batch per run). The cancel's own conditional write checks all of
   * it again.
   */
  listOverdue(now: Date, limit: number) {
    return db
      .select({
        id: bookings.id,
        status: bookings.status,
        respondBy: bookings.respondBy,
        pickedUpAt: bookings.pickedUpAt,
        paymentStatus: payments.status,
        hasOpenProposal: sql<boolean>`exists (
          select 1 from ${bookingTimeProposals}
           where ${bookingTimeProposals.bookingId} = ${bookings.id}
             and ${bookingTimeProposals.status} = 'open'
        )`,
      })
      .from(bookings)
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.status, 'pending'),
          eq(payments.status, 'paid'),
          isNotNull(bookings.respondBy),
          lte(bookings.respondBy, sql`${now.toISOString()}::timestamptz`),
          sql`not exists (
            select 1 from ${bookingTimeProposals}
             where ${bookingTimeProposals.bookingId} = ${bookings.id}
               and ${bookingTimeProposals.status} = 'open'
          )`
        )
      )
      .orderBy(asc(bookings.respondBy))
      .limit(limit)
  },

  /**
   * Bookings the cron cancelled as not accepted in time in [start, end),
   * counted per garage, most first: the 07:00 roll-up's "yesterday" line.
   * Test-marked bookings are left out, as from every figure.
   */
  async countMissedPerGarage(start: Date, end: Date) {
    const rows = await db
      .select({
        vendorId: bookings.vendorId,
        garageName: vendors.businessName,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(
        and(
          sql`${bookings.responseMissedAt} >= ${start.toISOString()}::timestamptz`,
          sql`${bookings.responseMissedAt} < ${end.toISOString()}::timestamptz`,
          sql`${bookings.markedTestAt} is null`
        )
      )
      .groupBy(bookings.vendorId, vendors.businessName)
      .orderBy(sql`count(*) desc`, asc(vendors.businessName))
    return rows.map((row) => ({ ...row, count: Number(row.count) }))
  },

  /**
   * The categories of a booking's services, with a package's member
   * services' categories beside it (lib/response-deadline.ts
   * wantedCategories decides what to look for).
   */
  async bookedCategories(bookingId: string) {
    const items = await db
      .select({ serviceId: bookingItems.serviceId, category: services.category })
      .from(bookingItems)
      .innerJoin(services, eq(services.id, bookingItems.serviceId))
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(asc(bookingItems.sortOrder))

    const packageIds = items.filter((item) => item.category === 'package').map((item) => item.serviceId)
    const members =
      packageIds.length === 0
        ? []
        : await db
            .select({ packageId: servicePackageItems.packageId, category: services.category })
            .from(servicePackageItems)
            .innerJoin(services, eq(services.id, servicePackageItems.serviceId))
            .where(inArray(servicePackageItems.packageId, packageIds))

    return items.map((item) => ({
      category: item.category as string,
      memberCategories: members
        .filter((member) => member.packageId === item.serviceId)
        .map((member) => member.category as string),
    }))
  },
}
