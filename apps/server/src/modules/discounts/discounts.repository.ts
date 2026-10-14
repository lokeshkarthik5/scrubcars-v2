import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { DISCOUNT_HELD, DISCOUNT_REALIZED } from './discounts.predicates.js'
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
   * How many times this discount is currently held — optionally narrowed to
   * one customer, which is the per-user limit check. See DISCOUNT_HELD for why
   * this counts unpaid bookings.
   */
  async countHeld(discountId: string, userId?: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(discountRedemptions)
      .innerJoin(bookings, eq(bookings.id, discountRedemptions.bookingId))
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .where(
        and(
          eq(discountRedemptions.discountId, discountId),
          userId ? eq(discountRedemptions.userId, userId) : undefined,
          DISCOUNT_HELD
        )
      )

    return row?.value ?? 0
  },

  /**
   * `countHeld` for many codes at once, for the offers on Home: one grouped
   * pass giving each code's uses in total and this customer's own. Counted
   * with DISCOUNT_HELD, exactly as resolveDiscount counts them, so a code the
   * customer could no longer use never shows as an offer.
   */
  async countHeldMany(
    discountIds: string[],
    userId: string
  ): Promise<Map<string, { total: number; byUser: number }>> {
    if (discountIds.length === 0) return new Map()
    const rows = await db
      .select({
        discountId: discountRedemptions.discountId,
        total: count(),
        byUser: sql<number>`count(*) filter (where ${discountRedemptions.userId} = ${userId})`,
      })
      .from(discountRedemptions)
      .innerJoin(bookings, eq(bookings.id, discountRedemptions.bookingId))
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .where(and(inArray(discountRedemptions.discountId, discountIds), DISCOUNT_HELD))
      .groupBy(discountRedemptions.discountId)

    return new Map(
      rows.map((row) => [row.discountId, { total: Number(row.total), byUser: Number(row.byUser) }])
    )
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
   * Usage figures in one grouped pass — never a count query per row.
   *
   * `redemptionCount` is the size of the audit trail (what gates deletion),
   * `heldCount` is what the limits compare against, and `realizedCount` /
   * `totalSaved` are money that actually landed. Pass a `discountId` to scope
   * the aggregate to one row instead of grouping the whole table.
   */
  async usageByDiscount(discountId?: string) {
    const rows = await db
      .select({
        discountId: discountRedemptions.discountId,
        redemptionCount: count(),
        heldCount: sql<number>`count(*) filter (where ${DISCOUNT_HELD})`,
        realizedCount: sql<number>`count(*) filter (where ${DISCOUNT_REALIZED})`,
        totalSaved: sql<string>`coalesce(sum(${discountRedemptions.discountAmount}) filter (where ${DISCOUNT_REALIZED}), 0)`,
      })
      .from(discountRedemptions)
      .innerJoin(bookings, eq(bookings.id, discountRedemptions.bookingId))
      .innerJoin(payments, eq(payments.bookingId, bookings.id))
      .where(
        discountId
          ? eq(discountRedemptions.discountId, discountId)
          : undefined
      )
      .groupBy(discountRedemptions.discountId)

    return new Map(
      rows.map((row) => [
        row.discountId,
        {
          redemptionCount: Number(row.redemptionCount),
          heldCount: Number(row.heldCount),
          realizedCount: Number(row.realizedCount),
          totalSaved: Number(row.totalSaved).toFixed(2),
        },
      ])
    )
  },

  listDiscounts(filters: { q?: string; active?: boolean }) {
    // % and _ are wildcards to LIKE; an admin searching "20%" means the
    // characters, not "anything after 20".
    const term = filters.q?.replace(/[\\%_]/g, (ch) => `\\${ch}`)

    const conditions = [
      filters.active === undefined
        ? undefined
        : eq(discounts.isActive, filters.active),
      term
        ? or(
            ilike(discounts.code, `%${term}%`),
            ilike(discounts.description, `%${term}%`)
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

  async vendorExists(vendorId: string): Promise<boolean> {
    const row = await db.query.vendors.findFirst({
      where: eq(vendors.id, vendorId),
      columns: { id: true },
    })
    return Boolean(row)
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
   * The services and vehicle behind a preview request. The subtotal is always
   * recomputed from these — a client-sent amount is never trusted.
   */
  async findPricingContext(input: {
    vendorId: string
    serviceIds: string[]
    userId: string
    vehicleId: string
  }) {
    const rows = await db
      .select({
        id: services.id,
        name: services.name,
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
          eq(services.vendorId, input.vendorId),
          inArray(services.id, input.serviceIds)
        )
      )

    const [vehicle] = await db
      .select({
        id: userVehicles.id,
        vehicleType: userVehicles.vehicleType,
      })
      .from(userVehicles)
      .where(
        and(
          eq(userVehicles.id, input.vehicleId),
          eq(userVehicles.userId, input.userId),
          // Same rule as the booking draft: a car the customer has archived is
          // not one a promo can be priced against.
          isNull(userVehicles.archivedAt)
        )
      )
      .limit(1)

    // Returned in the caller's order, not the database's, so the line that
    // fails a pricing check can be named by position as the customer sees it.
    const byId = new Map(rows.map((row) => [row.id, row]))

    return {
      services: input.serviceIds.map((id) => byId.get(id) ?? null),
      vehicle: vehicle ?? null,
    }
  },
}
