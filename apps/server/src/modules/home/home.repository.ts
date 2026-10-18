import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingItems,
  bookings,
  complaints,
  discounts,
  notices,
  noticeDismissals,
  offerDismissals,
  services,
  userVehicles,
  users,
  vendorClosures,
  vendorWorkingHours,
} from '../../db/schema.js'
import type { HomeOfferRow } from '../../lib/offers.js'
import type { BookingType } from '../../lib/booking-types.js'
import { LISTED_TO_CUSTOMERS, NOT_IN_BIN, PICKUP_OFFERED } from '../vendors/vendors.predicates.js'

// Issued one at a time on purpose. Production keeps a single connection
// (db/index.ts); overlapping them would not run any faster there. Home makes
// about a dozen of them; the 30-day bound on the booking read is what keeps
// them cheap, with the indexes 0031 added.

/** Statuses of a booking still to happen or under way. */
const ACTIVE = ['pending', 'confirmed', 'in_progress'] as const

/** Categories that wash the car, for the wash bar's "last wash". */
export const WASH_CATEGORIES = ['car_wash', 'detailing', 'package'] as const

export const homeRepository = {
  findUser(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        name: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        updatesSeenAt: true,
      },
    })
  },

  /** The customer's current cars (archived ones are history, not cars). */
  listCars(userId: string) {
    return db.query.userVehicles.findMany({
      where: and(eq(userVehicles.userId, userId), isNull(userVehicles.archivedAt)),
      columns: {
        id: true,
        make: true,
        model: true,
        color: true,
        licensePlate: true,
        vehicleType: true,
        isDefault: true,
        washIntervalDays: true,
      },
      orderBy: [asc(userVehicles.make), asc(userVehicles.model)],
    })
  },

  /**
   * The bookings Home and Updates read: anything still to happen, anything
   * that moved in the last `since` window (made, done, cancelled, billed,
   * photographed or refunded), and any bill still waiting to be paid however
   * old. One relational read, so one round trip.
   */
  listHubBookings(userId: string, since: Date) {
    // Raw fragments take the time as ISO text, as the rest of the codebase
    // does: postgres-js is not handed a Date inside a sql`` template.
    const sinceAt = sql`${since.toISOString()}::timestamptz`
    return db.query.bookings.findMany({
      where: and(
        eq(bookings.userId, userId),
        or(
          inArray(bookings.status, [...ACTIVE]),
          gte(bookings.scheduledAt, since),
          gte(bookings.createdAt, since),
          gte(bookings.completedAt, since),
          gte(bookings.cancelledAt, since),
          sql`exists (
            select 1 from booking_charges c
             where c.booking_id = ${bookings.id}
               and (c.status = 'due' or c.created_at >= ${sinceAt} or c.paid_at >= ${sinceAt})
          )`,
          sql`exists (
            select 1 from refund_records r
             where r.booking_id = ${bookings.id} and r.recorded_at >= ${sinceAt}
               and r.gateway_status is distinct from 'failed'
          )`,
          sql`exists (
            select 1 from job_photos p
             where p.booking_id = ${bookings.id} and p.created_at >= ${sinceAt}
               and p.uploaded_by_role = 'garage'
          )`
        )
      ),
      columns: {
        id: true,
        status: true,
        bookingType: true,
        scheduledAt: true,
        createdAt: true,
        acceptedAt: true,
        startedAt: true,
        completedAt: true,
        cancelledAt: true,
        cancelledBy: true,
        cancelledOnBehalfOf: true,
        noShow: true,
        // Cancelled because the garage did not accept in time (0042).
        responseMissedAt: true,
        // A free redo, and a refund instead of one (0051).
        guaranteeRedo: true,
        guaranteeRefundAt: true,
        rescheduledFromId: true,
        rescheduleCount: true,
        reviewPromptDismissedAt: true,
        vehicleId: true,
        vendorId: true,
        // Pickup & drop's handover steps (0037); never its codes.
        pickedUpAt: true,
        atGarageAt: true,
        outForDeliveryAt: true,
        deliveredAt: true,
      },
      with: {
        vendor: { columns: { id: true, businessName: true, bookingsPausedAt: true } },
        vehicle: { columns: { make: true, model: true } },
        // `service` is the deprecated first-item pointer, for bookings that
        // predate booking_items.
        service: { columns: { name: true } },
        items: {
          columns: { name: true, sortOrder: true },
          orderBy: [asc(bookingItems.sortOrder)],
        },
        payment: {
          columns: {
            status: true,
            amount: true,
            paidAt: true,
            refundedAmount: true,
            refundedAt: true,
            // Gift a wash (0049): Updates says when credit came back.
            creditAmount: true,
            creditReturnedAt: true,
          },
        },
        review: { columns: { id: true } },
        charges: {
          columns: {
            id: true,
            kind: true,
            lines: true,
            cancelledAt: true,
            cancelReason: true,
            status: true,
            amountDue: true,
            createdAt: true,
            paidAt: true,
            gatewayPaymentId: true,
            refundedAmount: true,
            refundedAt: true,
          },
        },
        // The garage's photos only (0045): "Photos of your car from <garage>"
        // and the Before & after tile are the garage's record, never the
        // customer's own uploads coming back to them.
        photos: {
          columns: { stage: true, createdAt: true },
          where: (photo, { eq }) => eq(photo.uploadedByRole, 'garage'),
        },
        // The newest time suggestion from the garage (0041): its times and
        // outcome only.
        timeProposals: {
          columns: { id: true, status: true, slots: true, expiresAt: true, createdAt: true, resolvedAt: true },
          orderBy: (proposal, { desc }) => [desc(proposal.createdAt)],
          limit: 1,
        },
        // A refund through Razorpay that failed moved no money (0036).
        refundRecords: {
          columns: { id: true, amount: true, recordedAt: true, refundRef: true },
          where: (record, { sql }) => sql`${record.gatewayStatus} IS DISTINCT FROM 'failed'`,
        },
      },
      orderBy: [desc(bookings.scheduledAt)],
      // A safety cap; the window keeps a real customer far below it.
      limit: 200,
    })
  },

  /**
   * When each car was last washed: its most recent completed job with a
   * washing service. A booking with no line items (from before 0024) is
   * judged by its own service_id.
   */
  async lastWashByCar(userId: string): Promise<Map<string, Date>> {
    const rows = await db.execute<{ vehicle_id: string; washed_at: Date | string }>(sql`
      SELECT DISTINCT ON (b.vehicle_id)
             b.vehicle_id,
             coalesce(b.completed_at, b.scheduled_at) AS washed_at
        FROM bookings b
       WHERE b.user_id = ${userId}
         AND b.status = 'completed'
         AND (
           EXISTS (
             SELECT 1 FROM booking_items bi
               JOIN services s ON s.id = bi.service_id
              WHERE bi.booking_id = b.id
                AND s.category IN (${sql.join(WASH_CATEGORIES.map((c) => sql`${c}`), sql`, `)})
           )
           OR (
             NOT EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id)
             AND EXISTS (
               SELECT 1 FROM services s
                WHERE s.id = b.service_id
                  AND s.category IN (${sql.join(WASH_CATEGORIES.map((c) => sql`${c}`), sql`, `)})
             )
           )
         )
       ORDER BY b.vehicle_id, coalesce(b.completed_at, b.scheduled_at) DESC
    `)
    return new Map(Array.from(rows).map((row) => [row.vehicle_id, new Date(row.washed_at)]))
  },

  /**
   * Each car's most recent finished job of any kind and any age, for Book
   * again, with the garage's state now. Whether that state can take the job
   * again is decided in lib/home-cards.ts (garageTakesJobAgain).
   */
  async lastJobsByCar(userId: string, vehicleIds: string[]) {
    if (vehicleIds.length === 0) return []
    const rows = await db.execute<{
      booking_id: string
      vehicle_id: string
      vendor_id: string
      vendor_name: string
      vendor_active: boolean
      vendor_verified: boolean
      vendor_pinned: boolean
      vendor_dropin_enabled: boolean
      vendor_doorstep_enabled: boolean
      vendor_pickup_offered: boolean
      vendor_paused_at: Date | string | null
      booking_type: BookingType
    }>(sql`
      SELECT DISTINCT ON (b.vehicle_id)
             b.id AS booking_id,
             b.vehicle_id,
             b.vendor_id,
             v.business_name AS vendor_name,
             -- Active and not in the Bin: a binned garage is no more
             -- bookable again than one that was suspended.
             (v.status = 'active' AND ${NOT_IN_BIN}) AS vendor_active,
             v.is_verified AS vendor_verified,
             (v.geo IS NOT NULL) AS vendor_pinned,
             v.dropin_enabled AS vendor_dropin_enabled,
             v.doorstep_enabled AS vendor_doorstep_enabled,
             ${PICKUP_OFFERED} AS vendor_pickup_offered,
             v.bookings_paused_at AS vendor_paused_at,
             b.booking_type
        FROM bookings b
        JOIN vendors v ON v.id = b.vendor_id
       WHERE b.user_id = ${userId}
         AND b.status = 'completed'
         AND b.vehicle_id IN (${sql.join(vehicleIds.map((id) => sql`${id}`), sql`, `)})
       ORDER BY b.vehicle_id, coalesce(b.completed_at, b.scheduled_at) DESC
    `)
    return Array.from(rows)
  },

  /**
   * The services those jobs sold, as sold, with their live price and state.
   * A booking with no line items falls back to its own service_id.
   */
  async servicesOfBookings(bookingIds: string[]) {
    if (bookingIds.length === 0) return []
    const itemized = await db
      .select({
        bookingId: bookingItems.bookingId,
        sortOrder: bookingItems.sortOrder,
        id: services.id,
        name: services.name,
        isActive: services.isActive,
        pricingType: services.pricingType,
        price: services.price,
        priceHatchback: services.priceHatchback,
        priceSedan: services.priceSedan,
        priceSuv: services.priceSuv,
      })
      .from(bookingItems)
      .innerJoin(services, eq(services.id, bookingItems.serviceId))
      .where(inArray(bookingItems.bookingId, bookingIds))
      .orderBy(asc(bookingItems.sortOrder))

    const withItems = new Set(itemized.map((row) => row.bookingId))
    const missing = bookingIds.filter((id) => !withItems.has(id))
    if (missing.length === 0) return itemized

    const legacy = await db
      .select({
        bookingId: bookings.id,
        sortOrder: sql<number>`0`,
        id: services.id,
        name: services.name,
        isActive: services.isActive,
        pricingType: services.pricingType,
        price: services.price,
        priceHatchback: services.priceHatchback,
        priceSedan: services.priceSedan,
        priceSuv: services.priceSuv,
      })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(inArray(bookings.id, missing))

    return [...itemized, ...legacy]
  },

  /**
   * Garages the customer has a booking with whose payment went through. Read
   * only while offer targeting is on: it is booking history.
   */
  async bookedVendorIds(userId: string): Promise<Set<string>> {
    const rows = await db.execute<{ vendor_id: string }>(sql`
      SELECT DISTINCT b.vendor_id
        FROM bookings b
        JOIN payments p ON p.booking_id = b.id
       WHERE b.user_id = ${userId}
         AND p.status IN ('paid', 'collected', 'refunded')
    `)
    return new Set(Array.from(rows).map((row) => row.vendor_id))
  },

  /** Holidays on the given IST dates, and the weekly hours, of some garages. */
  async garageDays(vendorIds: string[], dates: string[]) {
    if (vendorIds.length === 0) return { closures: [], hours: [] }
    const closures = await db
      .select({ vendorId: vendorClosures.vendorId, date: vendorClosures.date })
      .from(vendorClosures)
      .where(and(inArray(vendorClosures.vendorId, vendorIds), inArray(vendorClosures.date, dates)))
    const hours = await db
      .select({
        vendorId: vendorWorkingHours.vendorId,
        dayOfWeek: vendorWorkingHours.dayOfWeek,
        isClosed: vendorWorkingHours.isClosed,
      })
      .from(vendorWorkingHours)
      .where(inArray(vendorWorkingHours.vendorId, vendorIds))
    return { closures, hours }
  },

  /** Notices live now that this customer has not closed. */
  listLiveNotices(userId: string, now: Date) {
    return db
      .select({
        id: notices.id,
        title: notices.title,
        body: notices.body,
        linkUrl: notices.linkUrl,
        linkLabel: notices.linkLabel,
        audience: notices.audience,
        vendorId: notices.vendorId,
        bookingFrom: notices.bookingFrom,
        bookingTo: notices.bookingTo,
        startsAt: notices.startsAt,
        endsAt: notices.endsAt,
        isActive: notices.isActive,
      })
      .from(notices)
      .where(
        and(
          eq(notices.isActive, true),
          lte(notices.startsAt, now),
          gt(notices.endsAt, now),
          sql`not exists (
            select 1 from notice_dismissals d
             where d.notice_id = ${notices.id} and d.user_id = ${userId}
          )`
        )
      )
      .orderBy(desc(notices.startsAt))
  },

  /**
   * Codes marked for Home that have not ended, with their garage's public
   * state and whether this customer closed them. `origin` is passed only
   * while targeting is on: it is what measures "near this garage".
   */
  async listHomeOfferCandidates(
    userId: string,
    now: Date,
    origin: { lat: number; lng: number } | null
  ): Promise<HomeOfferRow[]> {
    const point = origin
      ? sql`gis.ST_SetSRID(gis.ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::gis.geography`
      : null
    const nowAt = sql`${now.toISOString()}::timestamptz`
    const distanceKm = point
      ? sql`CASE WHEN v.geo IS NULL THEN NULL ELSE gis.ST_Distance(v.geo, ${point}) / 1000 END`
      : sql`NULL::double precision`

    const rows = await db.execute<{
      id: string
      code: string
      home_title: string | null
      home_priority: number
      home_audience: HomeOfferRow['homeAudience']
      home_audience_radius_km: number | null
      home_audience_vehicle_types: HomeOfferRow['homeAudienceVehicleTypes']
      discount_type: 'percentage' | 'fixed'
      percent_off: string | null
      amount_off: string | null
      max_discount_amount: string | null
      min_order_amount: string | null
      per_user_limit: number | null
      total_usage_limit: number | null
      vendor_id: string | null
      vendor_name: string | null
      vendor_public: boolean | null
      vendor_distance_km: number | string | null
      show_on_home: boolean
      is_active: boolean
      starts_at: Date | string | null
      ends_at: Date | string | null
      created_at: Date | string
      dismissed: boolean
    }>(sql`
      SELECT d.id, d.code, d.home_title, d.home_priority, d.home_audience,
             d.home_audience_radius_km, d.home_audience_vehicle_types,
             d.discount_type, d.percent_off, d.amount_off, d.max_discount_amount,
             d.min_order_amount, d.per_user_limit, d.total_usage_limit,
             d.vendor_id, v.business_name AS vendor_name,
             (${LISTED_TO_CUSTOMERS} AND v.geo IS NOT NULL) AS vendor_public,
             ${distanceKm} AS vendor_distance_km,
             d.show_on_home, d.is_active, d.starts_at, d.ends_at, d.created_at,
             EXISTS (
               SELECT 1 FROM offer_dismissals od
                WHERE od.discount_id = d.id AND od.user_id = ${userId}
             ) AS dismissed
        FROM discounts d
        LEFT JOIN vendors v ON v.id = d.vendor_id
       WHERE d.show_on_home
         AND d.is_active
         AND d.ends_at > ${nowAt}
         AND (d.starts_at IS NULL OR d.starts_at <= ${nowAt})
       ORDER BY d.home_priority DESC, d.ends_at ASC
       LIMIT 50
    `)

    const toDate = (value: Date | string | null) => (value === null ? null : new Date(value))
    return Array.from(rows).map((row) => ({
      id: row.id,
      code: row.code,
      homeTitle: row.home_title,
      homePriority: Number(row.home_priority),
      homeAudience: row.home_audience,
      homeAudienceRadiusKm: row.home_audience_radius_km === null ? null : Number(row.home_audience_radius_km),
      homeAudienceVehicleTypes: row.home_audience_vehicle_types,
      discountType: row.discount_type,
      percentOff: row.percent_off,
      amountOff: row.amount_off,
      maxDiscountAmount: row.max_discount_amount,
      minOrderAmount: row.min_order_amount,
      perUserLimit: row.per_user_limit,
      totalUsageLimit: row.total_usage_limit,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      vendorPublic: row.vendor_public === true,
      vendorDistanceKm: row.vendor_distance_km === null ? null : Number(row.vendor_distance_km),
      showOnHome: row.show_on_home,
      isActive: row.is_active,
      startsAt: toDate(row.starts_at),
      endsAt: toDate(row.ends_at),
      createdAt: new Date(row.created_at),
      dismissed: row.dismissed,
    }))
  },

  /**
   * Moves the read marker forward to `at`, never past now and never back:
   * opening Updates on an old tab must not mark newer rows unread again.
   */
  /**
   * The customer's complaints the team moved on since `since` (acknowledged,
   * resolved or closed), for Updates and Home's soft card. Only the times
   * and whether there is an answer: never the team's note or names. Found
   * by complaints_user_id_created_at_idx; a customer has a handful.
   */
  async listAnsweredComplaints(userId: string, since: Date) {
    const rows = await db
      .select({
        id: complaints.id,
        number: complaints.number,
        status: complaints.status,
        acknowledgedAt: complaints.acknowledgedAt,
        resolvedAt: complaints.resolvedAt,
        closedAt: complaints.closedAt,
        hasAnswer: sql<boolean>`${complaints.resolutionNote} is not null`,
      })
      .from(complaints)
      .where(
        and(
          eq(complaints.userId, userId),
          or(
            gte(complaints.acknowledgedAt, since),
            gte(complaints.resolvedAt, since),
            gte(complaints.closedAt, since)
          )
        )
      )
      .orderBy(desc(complaints.createdAt))
      .limit(50)
    return rows.map((row) => ({ ...row, hasAnswer: Boolean(row.hasAnswer) }))
  },

  async markUpdatesSeen(userId: string, at: Date) {
    await db
      .update(users)
      .set({ updatesSeenAt: sql`greatest(${users.updatesSeenAt}, least(${at.toISOString()}::timestamptz, now()))` })
      .where(eq(users.id, userId))
  },

  async noticeExists(noticeId: string): Promise<boolean> {
    const row = await db.query.notices.findFirst({
      where: eq(notices.id, noticeId),
      columns: { id: true },
    })
    return Boolean(row)
  },

  async dismissNotice(userId: string, noticeId: string) {
    await db.insert(noticeDismissals).values({ userId, noticeId }).onConflictDoNothing()
  },

  /**
   * Any code, shown on Home or not: an admin may switch "Show on Home" off
   * while a customer still has the card open, and their × must still land.
   */
  async offerExists(discountId: string): Promise<boolean> {
    const row = await db.query.discounts.findFirst({
      where: eq(discounts.id, discountId),
      columns: { id: true },
    })
    return Boolean(row)
  },

  async dismissOffer(userId: string, discountId: string) {
    await db.insert(offerDismissals).values({ userId, discountId }).onConflictDoNothing()
  },
}

export type HubBookingRecord = Awaited<ReturnType<typeof homeRepository.listHubBookings>>[number]
export type CarRecord = Awaited<ReturnType<typeof homeRepository.listCars>>[number]
