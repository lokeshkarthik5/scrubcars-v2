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
import type { CarType } from '../../lib/offers.js'
import { WASH_CATEGORIES } from '../home/home.repository.js'
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

  // ─── Estimated reach (GET /admin/discounts/home-reach) ──────────────────
  //
  // Whole-customer-base reads, for one admin looking at one form. Fine at
  // pilot size (hundreds of customers); each runs only for the audience that
  // needs it (discountsService.homeReach), so "Everyone" reads no booking
  // history or location at all.

  /**
   * Who an offer can reach at all: signed-up customers who can use the app
   * (as `noticesRepository.countCustomers` counts them), each with the types
   * of their current cars.
   */
  async listReachCustomers(): Promise<{ userId: string; carTypes: CarType[] }[]> {
    const rows = await db.execute<{ user_id: string; car_types: CarType[] | null }>(sql`
      SELECT u.id AS user_id,
             array_agg(DISTINCT v.vehicle_type::text) FILTER (WHERE v.id IS NOT NULL) AS car_types
        FROM users u
        LEFT JOIN user_vehicles v ON v.user_id = u.id AND v.archived_at IS NULL
       WHERE u.is_customer AND u.status = 'active'
       GROUP BY u.id
    `)
    return Array.from(rows).map((row) => ({ userId: row.user_id, carTypes: row.car_types ?? [] }))
  },

  /**
   * Each customer's garages with a booking whose payment went through: the
   * rule Home's `bookedVendorIds` reads, for every customer at once.
   */
  async paidBookingGarages(): Promise<Map<string, Set<string>>> {
    const rows = await db.execute<{ user_id: string; vendor_id: string }>(sql`
      SELECT DISTINCT b.user_id, b.vendor_id
        FROM bookings b
        JOIN payments p ON p.booking_id = b.id
       WHERE p.status IN ('paid', 'collected', 'refunded')
    `)
    const byUser = new Map<string, Set<string>>()
    for (const row of rows) {
      const set = byUser.get(row.user_id) ?? new Set<string>()
      set.add(row.vendor_id)
      byUser.set(row.user_id, set)
    }
    return byUser
  },

  /**
   * Km from each customer's nearest pinned saved address to a garage. Home
   * measures from where the customer is when they open it, which is never
   * stored, so this is the estimate the form labels as one.
   */
  async nearestAddressKm(vendorId: string): Promise<Map<string, number>> {
    const rows = await db.execute<{ user_id: string; km: number | string }>(sql`
      SELECT a.user_id,
             min(gis.ST_Distance(
               v.geo,
               gis.ST_SetSRID(gis.ST_MakePoint(a.lng, a.lat), 4326)::gis.geography
             )) / 1000 AS km
        FROM user_addresses a
        JOIN vendors v ON v.id = ${vendorId} AND v.geo IS NOT NULL
       WHERE a.lat IS NOT NULL AND a.lng IS NOT NULL
       GROUP BY a.user_id
    `)
    return new Map(Array.from(rows).map((row) => [row.user_id, Number(row.km)]))
  },

  /**
   * What each current car's wash bar is built from, for every customer: its
   * own interval, its last finished wash (the categories and the pre-0024
   * fallback of `homeRepository.lastWashByCar`), and whether a paid job is
   * ahead of it or under way (Home's "booked", which is never overdue).
   */
  async carWashFacts(now: Date) {
    const nowAt = sql`${now.toISOString()}::timestamptz`
    const washCategories = sql.join(WASH_CATEGORIES.map((c) => sql`${c}`), sql`, `)
    const rows = await db.execute<{
      user_id: string
      wash_interval_days: number | null
      last_wash_at: Date | string | null
      booked: boolean
    }>(sql`
      SELECT v.user_id,
             v.wash_interval_days,
             (SELECT max(coalesce(b.completed_at, b.scheduled_at))
                FROM bookings b
               WHERE b.vehicle_id = v.id
                 AND b.status = 'completed'
                 AND (
                   EXISTS (
                     SELECT 1 FROM booking_items bi
                       JOIN services s ON s.id = bi.service_id
                      WHERE bi.booking_id = b.id AND s.category IN (${washCategories})
                   )
                   OR (
                     NOT EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id)
                     AND EXISTS (
                       SELECT 1 FROM services s
                        WHERE s.id = b.service_id AND s.category IN (${washCategories})
                     )
                   )
                 )) AS last_wash_at,
             EXISTS (
               SELECT 1 FROM bookings b
                 JOIN payments p ON p.booking_id = b.id
                WHERE b.vehicle_id = v.id
                  AND p.status IN ('paid', 'collected')
                  AND (b.status = 'in_progress'
                       OR (b.status IN ('pending', 'confirmed') AND b.scheduled_at > ${nowAt}))
             ) AS booked
        FROM user_vehicles v
        JOIN users u ON u.id = v.user_id
       WHERE v.archived_at IS NULL AND u.is_customer AND u.status = 'active'
    `)
    return Array.from(rows).map((row) => ({
      userId: row.user_id,
      intervalDays: row.wash_interval_days === null ? null : Number(row.wash_interval_days),
      lastWashAt: row.last_wash_at === null ? null : new Date(row.last_wash_at),
      booked: row.booked === true,
    }))
  },

  /**
   * Whether a garage is live for customers, by the rule Home's offer read
   * uses (active, verified, pinned, not paused). Null when there is no such
   * garage.
   */
  async vendorIsPublic(vendorId: string): Promise<boolean | null> {
    const [row] = await db.execute<{ public: boolean }>(sql`
      SELECT (v.status = 'active' AND v.is_verified AND v.geo IS NOT NULL
               AND v.bookings_paused_at IS NULL) AS public
        FROM vendors v
       WHERE v.id = ${vendorId}
    `)
    return row ? row.public === true : null
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
