import { and, asc, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookings,
  discountRedemptions,
  discounts,
  payments,
  services,
  userVehicles,
  vendors,
} from '../../db/schema.js'

// A redemption only counts against a limit once the booking is genuinely
// consumed: paid for and not cancelled. An abandoned checkout or a cancelled
// booking hands the allowance back to the customer.
//
// This predicate is the single definition of "used"; both limit checks and the
// admin list's counts are built from it, so they can never disagree.
const CONSUMED = and(ne(bookings.status, 'cancelled'), eq(payments.status, 'paid'))

export const discountsRepository = {
  findByCode(code: string) {
    return db.query.discounts.findFirst({
      where: sql`lower(${discounts.code}) = lower(${code})`,
    })
  },

  findById(id: string) {
    return db.query.discounts.findFirst({ where: eq(discounts.id, id) })
  },

  /**
   * How many times this discount has actually been consumed — optionally
   * narrowed to one customer, which is the per-user limit check.
   */
  async countConsumed(discountId: string, userId?: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(discountRedemptions)
      .innerJoin(bookings, eq(bookings.id, discountRedemptions.bookingId))
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .where(
        and(
          eq(discountRedemptions.discountId, discountId),
          userId ? eq(discountRedemptions.userId, userId) : undefined,
          CONSUMED
        )
      )

    return row?.value ?? 0
  },

  /** Whether any redemption row exists at all — the delete gate. */
  async hasRedemptions(discountId: string): Promise<boolean> {
    const [row] = await db
      .select({ value: count() })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountId, discountId))

    return (row?.value ?? 0) > 0
  },

  /**
   * Usage figures for every discount in one grouped pass — never a count query
   * per row. `redemptionCount` is the size of the audit trail (what gates
   * deletion); `consumedCount` and `totalSaved` only count paid, uncancelled
   * bookings (what gates the limits).
   */
  async usageByDiscount() {
    const rows = await db
      .select({
        discountId: discountRedemptions.discountId,
        redemptionCount: count(),
        consumedCount: sql<number>`count(*) filter (where ${CONSUMED})`,
        totalSaved: sql<string>`coalesce(sum(${discountRedemptions.discountAmount}) filter (where ${CONSUMED}), 0)`,
      })
      .from(discountRedemptions)
      .innerJoin(bookings, eq(bookings.id, discountRedemptions.bookingId))
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .groupBy(discountRedemptions.discountId)

    return new Map(
      rows.map((row) => [
        row.discountId,
        {
          redemptionCount: Number(row.redemptionCount),
          consumedCount: Number(row.consumedCount),
          totalSaved: Number(row.totalSaved).toFixed(2),
        },
      ])
    )
  },

  listDiscounts(filters: { q?: string; active?: boolean }) {
    const conditions = [
      filters.active === undefined
        ? undefined
        : eq(discounts.isActive, filters.active),
      filters.q
        ? or(
            ilike(discounts.code, `%${filters.q}%`),
            ilike(discounts.description, `%${filters.q}%`)
          )
        : undefined,
    ].filter(Boolean)

    return db.query.discounts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        vendor: { columns: { id: true, businessName: true } },
      },
      orderBy: [desc(discounts.createdAt)],
    })
  },

  findDetailById(id: string) {
    return db.query.discounts.findFirst({
      where: eq(discounts.id, id),
      with: {
        vendor: { columns: { id: true, businessName: true } },
      },
    })
  },

  async createDiscount(values: typeof discounts.$inferInsert) {
    const [row] = await db.insert(discounts).values(values).returning()
    return row
  },

  async updateDiscount(
    id: string,
    values: Partial<typeof discounts.$inferInsert>
  ) {
    const [row] = await db
      .update(discounts)
      .set(values)
      .where(eq(discounts.id, id))
      .returning()
    return row
  },

  async deleteDiscount(id: string) {
    await db.delete(discounts).where(eq(discounts.id, id))
  },

  /** Vendor picker for the admin form: active garages, alphabetical. */
  listVendorOptions() {
    return db
      .select({ id: vendors.id, businessName: vendors.businessName })
      .from(vendors)
      .where(ne(vendors.status, 'archived'))
      .orderBy(asc(vendors.businessName))
  },

  /**
   * The service and vehicle behind a preview request. The subtotal is always
   * recomputed from these — a client-sent amount is never trusted.
   */
  async findPricingContext(input: {
    vendorId: string
    serviceId: string
    userId: string
    vehicleId: string
  }) {
    const [service] = await db
      .select({
        id: services.id,
        pricingType: services.pricingType,
        price: services.price,
        priceHatchback: services.priceHatchback,
        priceSedan: services.priceSedan,
        priceSuv: services.priceSuv,
        isActive: services.isActive,
      })
      .from(services)
      .where(
        and(
          eq(services.id, input.serviceId),
          eq(services.vendorId, input.vendorId)
        )
      )
      .limit(1)

    const [vehicle] = await db
      .select({
        id: userVehicles.id,
        vehicleType: userVehicles.vehicleType,
      })
      .from(userVehicles)
      .where(
        and(
          eq(userVehicles.id, input.vehicleId),
          eq(userVehicles.userId, input.userId)
        )
      )
      .limit(1)

    return { service: service ?? null, vehicle: vehicle ?? null }
  },
}
