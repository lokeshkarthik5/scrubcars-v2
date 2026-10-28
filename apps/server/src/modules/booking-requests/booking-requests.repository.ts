import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  bookingRequests,
  services,
  userAddresses,
  userVehicles,
  users,
  vendorClosures,
  vendors,
  vendorWorkingHours,
  zones,
} from '../../db/schema.js'
import { DEFAULT_DOORSTEP_RADIUS_KM } from '../../lib/doorstep.js'
import { DEFAULT_PICKUP_RADIUS_KM } from '../../lib/pickup.js'
import type { RequestMode, RequestStatus } from '../../lib/booking-requests.js'
import { listCapacityHolders } from '../bookings/bookings.repository.js'
import { LISTED_TO_CUSTOMERS, PICKUP_OFFERED } from '../vendors/vendors.predicates.js'

export type BookingRequestRecord = typeof bookingRequests.$inferSelect
export type BookingRequestInsert = typeof bookingRequests.$inferInsert

type Point = { lat: number; lng: number }

function geography(point: Point) {
  return sql`gis.ST_SetSRID(gis.ST_MakePoint(${point.lng}, ${point.lat}), 4326)::gis.geography`
}

/** A garage measured against the customer's point, for the request rules (lib/booking-requests.ts). */
export interface MeasuredGarage {
  vendorId: string
  businessName: string
  listed: boolean
  offersMode: boolean
  /** Spheroid metres from its pin, as the cards show. */
  distanceM: number
  /** Whether it reaches the point by the booking check's own rule. */
  covers: boolean
  /** How far past its reach the point is, in metres (sphere); ≤ 0 when it covers. */
  outsideM: number
  /** Its radius in km; null for a doorstep garage with a drawn area. */
  coverKm: number | null
  slotIntervalMins: number
  bays: number | null
  jobsPerDay: number | null
  bookingsPausedAt: Date | null
}

type MeasuredRow = {
  id: string
  business_name: string
  listed: boolean
  offers_mode: boolean
  distance_m: number | string
  covers: boolean
  outside_m: number | string
  cover_km: number | string | null
  slot_interval_mins: number
  bays: number | null
  jobs_per_day: number | null
  bookings_paused_at: Date | string | null
}

/**
 * The SQL for one mode's reach: whether the garage covers the point, how far
 * past its reach the point is, and its radius. The booking checks' own rule
 * (bookingsRepository.isWithinDoorstepRadius / isWithinPickupRadius), and
 * the list's "just outside" measure (reachRepository.listJustOutside),
 * restated here only because it is a condition inside a larger query.
 */
function reachSql(mode: RequestMode, point: ReturnType<typeof geography>) {
  if (mode === 'doorstep') {
    return {
      offers: sql`(v.doorstep_enabled = true)`,
      covers: sql`(CASE
        WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ${point})
        ELSE gis.ST_DWithin(v.geo, ${point}, COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000, false)
      END)`,
      outside: sql`(CASE
        WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Distance(v.doorstep_area, ${point}, false)
        ELSE gis.ST_Distance(v.geo, ${point}, false) - COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000
      END)`,
      cover: sql`(CASE WHEN v.doorstep_area IS NOT NULL THEN NULL
        ELSE COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) END)`,
    }
  }
  return {
    offers: PICKUP_OFFERED,
    covers: sql`gis.ST_DWithin(v.geo, ${point}, COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000, false)`,
    outside: sql`(gis.ST_Distance(v.geo, ${point}, false) - COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000)`,
    cover: sql`COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM})`,
  }
}

function toMeasured(row: MeasuredRow): MeasuredGarage {
  return {
    vendorId: row.id,
    businessName: row.business_name,
    listed: row.listed === true,
    offersMode: row.offers_mode === true,
    distanceM: Number(row.distance_m),
    covers: row.covers === true,
    outsideM: Number(row.outside_m),
    coverKm: row.cover_km === null ? null : Number(row.cover_km),
    slotIntervalMins: row.slot_interval_mins,
    bays: row.bays,
    jobsPerDay: row.jobs_per_day,
    bookingsPausedAt: row.bookings_paused_at === null ? null : new Date(row.bookings_paused_at),
  }
}

export const bookingRequestsRepository = {
  /** One garage measured against the customer's point (null: no such garage, or no pin). */
  async measureGarage(vendorId: string, mode: RequestMode, point: Point): Promise<MeasuredGarage | null> {
    const at = geography(point)
    const reach = reachSql(mode, at)
    const rows = await db.execute<MeasuredRow>(sql`
      SELECT v.id, v.business_name,
             ${LISTED_TO_CUSTOMERS} AS listed,
             ${reach.offers} AS offers_mode,
             gis.ST_Distance(v.geo, ${at}) AS distance_m,
             ${reach.covers} AS covers,
             ${reach.outside} AS outside_m,
             ${reach.cover} AS cover_km,
             v.slot_interval_mins, v.bays, v.jobs_per_day, v.bookings_paused_at
        FROM vendors v
       WHERE v.id = ${vendorId} AND v.geo IS NOT NULL
    `)
    const row = Array.from(rows)[0]
    return row ? toMeasured(row) : null
  },

  /** A garage's own facts for the window list: listed, offering the mode, its pause and slot interval. */
  async garageFacts(vendorId: string, mode: RequestMode) {
    const reach = reachSql(mode, geography({ lat: 0, lng: 0 }))
    const rows = await db.execute<{
      listed: boolean
      offers_mode: boolean
      bookings_paused_at: Date | string | null
      slot_interval_mins: number
    }>(sql`
      SELECT ${LISTED_TO_CUSTOMERS} AS listed, ${reach.offers} AS offers_mode,
             v.bookings_paused_at, v.slot_interval_mins
        FROM vendors v
       WHERE v.id = ${vendorId} AND v.geo IS NOT NULL
    `)
    const row = Array.from(rows)[0]
    if (!row) return null
    return {
      listed: row.listed === true,
      offersMode: row.offers_mode === true,
      bookingsPausedAt: row.bookings_paused_at === null ? null : new Date(row.bookings_paused_at),
      slotIntervalMins: row.slot_interval_mins,
    }
  },

  /**
   * Every listed garage of this mode that reaches the point or is within
   * `justOutsideKm` past its reach, nearest first: who a request can be
   * passed on to. `exclude` are the garages already asked.
   */
  async listCandidates(params: {
    mode: RequestMode
    point: Point
    justOutsideKm: number
    exclude: readonly string[]
    limit: number
  }): Promise<MeasuredGarage[]> {
    const at = geography(params.point)
    const reach = reachSql(params.mode, at)
    const excluded =
      params.exclude.length > 0
        ? sql`AND v.id NOT IN (${sql.join(params.exclude.map((id) => sql`${id}::uuid`), sql`, `)})`
        : sql``
    const rows = await db.execute<MeasuredRow>(sql`
      SELECT * FROM (
        SELECT v.id, v.business_name,
               true AS listed,
               true AS offers_mode,
               gis.ST_Distance(v.geo, ${at}) AS distance_m,
               ${reach.covers} AS covers,
               ${reach.outside} AS outside_m,
               ${reach.cover} AS cover_km,
               v.slot_interval_mins, v.bays, v.jobs_per_day, v.bookings_paused_at
          FROM vendors v
         WHERE ${LISTED_TO_CUSTOMERS} AND ${reach.offers} AND v.geo IS NOT NULL ${excluded}
      ) measured
       WHERE measured.outside_m <= ${params.justOutsideKm * 1000}
       ORDER BY measured.distance_m ASC, measured.id ASC
       LIMIT ${params.limit}
    `)
    return Array.from(rows).map(toMeasured)
  },

  /** A garage's services the booking path can sell (packages included), active or not. */
  listGarageServices(vendorIds: readonly string[]) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return db
      .select({
        id: services.id,
        vendorId: services.vendorId,
        name: services.name,
        category: services.category,
        pricingType: services.pricingType,
        price: services.price,
        priceHatchback: services.priceHatchback,
        priceSedan: services.priceSedan,
        priceSuv: services.priceSuv,
        durationMins: services.durationMins,
        isActive: services.isActive,
      })
      .from(services)
      .where(inArray(services.vendorId, [...vendorIds]))
  },

  /** A garage's weekly hours, every day it has a row for. */
  listHours(vendorId: string) {
    return db
      .select({
        dayOfWeek: vendorWorkingHours.dayOfWeek,
        openTime: vendorWorkingHours.openTime,
        closeTime: vendorWorkingHours.closeTime,
        isClosed: vendorWorkingHours.isClosed,
      })
      .from(vendorWorkingHours)
      .where(eq(vendorWorkingHours.vendorId, vendorId))
  },

  /** A garage's holidays between two IST dates, both included. */
  async listClosureDates(vendorId: string, from: string, to: string): Promise<string[]> {
    const rows = await db
      .select({ date: vendorClosures.date })
      .from(vendorClosures)
      .where(and(eq(vendorClosures.vendorId, vendorId), gte(vendorClosures.date, from), lte(vendorClosures.date, to)))
    return rows.map((row) => String(row.date))
  },

  /** What the slot rule reads of a garage's day: its hours for the weekday and a holiday that date. */
  async garageDay(vendorId: string, date: string, dayOfWeek: number) {
    const [hours] = await db
      .select({ openTime: vendorWorkingHours.openTime, closeTime: vendorWorkingHours.closeTime, isClosed: vendorWorkingHours.isClosed })
      .from(vendorWorkingHours)
      .where(and(eq(vendorWorkingHours.vendorId, vendorId), eq(vendorWorkingHours.dayOfWeek, dayOfWeek)))
      .limit(1)
    const [closure] = await db
      .select({ id: vendorClosures.id })
      .from(vendorClosures)
      .where(and(eq(vendorClosures.vendorId, vendorId), eq(vendorClosures.date, date)))
      .limit(1)
    return { hours: hours ?? null, holiday: !!closure }
  },

  /** The bookings holding the garage's room that day (bookings.repository's own read). */
  capacityHolders(vendorId: string, date: string) {
    return listCapacityHolders(db, { vendorId, date })
  },

  findVehicle(userId: string, vehicleId: string) {
    return db.query.userVehicles.findFirst({
      where: and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId), isNull(userVehicles.archivedAt)),
    })
  },

  findAddress(userId: string, addressId: string) {
    return db.query.userAddresses.findFirst({
      where: and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)),
    })
  },

  listZones() {
    return db.select().from(zones).orderBy(sql`${zones.priority} DESC`, asc(zones.name))
  },

  /**
   * A new request (the customer's first garage), counted under the
   * customer's own lock (`booking-requests:<userId>`, taken on its own,
   * never alongside the booking-write locks), so two taps can never open a
   * third. Null when they already have `maxOpen` open.
   */
  createFirst(input: BookingRequestInsert & { userId: string }, maxOpen: number): Promise<BookingRequestRecord | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking-requests:${input.userId}`})::bigint)`)
      const [open] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(bookingRequests)
        .where(and(eq(bookingRequests.userId, input.userId), inArray(bookingRequests.status, ['pending', 'accepted'])))
      if ((open?.count ?? 0) >= maxOpen) return null
      const [row] = await tx.insert(bookingRequests).values(input).returning()
      return row ?? null
    })
  },

  findById(id: string) {
    return db.query.bookingRequests.findFirst({ where: eq(bookingRequests.id, id) })
  },

  /** Every row of a request (the first and any it was passed on to), oldest first. */
  listChain(rootId: string) {
    return db
      .select()
      .from(bookingRequests)
      .where(or(eq(bookingRequests.id, rootId), eq(bookingRequests.rootRequestId, rootId)))
      .orderBy(asc(bookingRequests.chainNo))
  },

  /** A customer's requests: every open one, and the rest from the last week, newest first. */
  listForCustomer(userId: string, since: Date) {
    return db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.userId, userId),
          or(inArray(bookingRequests.status, ['pending', 'accepted']), gte(bookingRequests.updatedAt, since))
        )
      )
      .orderBy(desc(bookingRequests.createdAt))
      .limit(20)
  },

  /** A garage's requests: waiting first (soonest deadline), or the last 30 days' others. */
  listForGarage(vendorId: string, scope: 'open' | 'closed', since: Date) {
    if (scope === 'open') {
      return db
        .select()
        .from(bookingRequests)
        .where(and(eq(bookingRequests.vendorId, vendorId), inArray(bookingRequests.status, ['pending', 'accepted'])))
        .orderBy(asc(bookingRequests.respondBy))
        .limit(50)
    }
    return db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vendorId, vendorId),
          inArray(bookingRequests.status, ['declined', 'expired', 'forwarded', 'cancelled', 'converted']),
          gte(bookingRequests.updatedAt, since)
        )
      )
      .orderBy(desc(bookingRequests.updatedAt))
      .limit(50)
  },

  /** How many requests wait for this garage's answer: the portal's badge. */
  async countWaitingForGarage(vendorId: string, now: Date): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(and(eq(bookingRequests.vendorId, vendorId), eq(bookingRequests.status, 'pending'), gte(bookingRequests.respondBy, now)))
    return row?.count ?? 0
  },

  /**
   * The garage's yes, once: conditional on still waiting and its time not
   * gone, so a yes racing the cron or the customer's cancel has one winner.
   */
  async accept(input: {
    id: string
    vendorId: string
    userId: string
    travelFee: string
    startAt: Date
    confirmBy: Date
    now: Date
  }): Promise<BookingRequestRecord | null> {
    const [row] = await db
      .update(bookingRequests)
      .set({
        status: 'accepted',
        reply: 'accepted',
        repliedAt: input.now,
        repliedBy: input.userId,
        travelFee: input.travelFee,
        acceptedStartAt: input.startAt,
        confirmBy: input.confirmBy,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(bookingRequests.id, input.id),
          eq(bookingRequests.vendorId, input.vendorId),
          eq(bookingRequests.status, 'pending'),
          gte(bookingRequests.respondBy, input.now)
        )
      )
      .returning()
    return row ?? null
  },

  /**
   * A waiting row ends: the garage said no (`reply` 'declined') or its time
   * ran out (no reply). `status` is 'forwarded' when the request moves on to
   * another garage, else how it ended ('declined' / 'expired'). Conditional
   * on still waiting.
   */
  async closeWaiting(input: {
    id: string
    vendorId?: string
    status: Extract<RequestStatus, 'declined' | 'expired' | 'forwarded'>
    reply: 'declined' | null
    repliedBy: string | null
    now: Date
    /** The cron's expiry is conditional on the deadline having passed. */
    onlyIfPastDeadline: boolean
  }): Promise<BookingRequestRecord | null> {
    const conditions = [eq(bookingRequests.id, input.id), eq(bookingRequests.status, 'pending')]
    if (input.vendorId) conditions.push(eq(bookingRequests.vendorId, input.vendorId))
    if (input.onlyIfPastDeadline) conditions.push(lte(bookingRequests.respondBy, input.now))
    const [row] = await db
      .update(bookingRequests)
      .set({
        status: input.status,
        reply: input.reply,
        repliedAt: input.reply ? input.now : null,
        repliedBy: input.repliedBy,
        closedAt: input.now,
        updatedAt: input.now,
      })
      .where(and(...conditions))
      .returning()
    return row ?? null
  },

  /**
   * Passes a request on: the row that ended becomes 'forwarded' and the next
   * garage's row is written, in one transaction (the one-open-per-request
   * index holds it). Null when the first row was no longer the open one.
   */
  forward(input: {
    fromId: string
    from: { status: 'pending' } | { status: 'declined_now'; repliedBy: string | null }
    next: BookingRequestInsert
    now: Date
    onlyIfPastDeadline: boolean
  }): Promise<{ closed: BookingRequestRecord; next: BookingRequestRecord } | null> {
    return db.transaction(async (tx) => {
      const declined = input.from.status === 'declined_now'
      const conditions = [eq(bookingRequests.id, input.fromId), eq(bookingRequests.status, 'pending')]
      if (input.onlyIfPastDeadline) conditions.push(lte(bookingRequests.respondBy, input.now))
      const [closed] = await tx
        .update(bookingRequests)
        .set({
          status: 'forwarded',
          reply: declined ? 'declined' : null,
          repliedAt: declined ? input.now : null,
          repliedBy: input.from.status === 'declined_now' ? input.from.repliedBy : null,
          closedAt: input.now,
          customerToldAt: input.now,
          updatedAt: input.now,
        })
        .where(and(...conditions))
        .returning()
      if (!closed) return null
      const [next] = await tx.insert(bookingRequests).values(input.next).returning()
      return { closed, next: next! }
    })
  },

  /** The customer's cancel: a waiting or accepted row, theirs. */
  async cancel(id: string, userId: string, now: Date): Promise<BookingRequestRecord | null> {
    const [row] = await db
      .update(bookingRequests)
      .set({ status: 'cancelled', closedAt: now, updatedAt: now })
      .where(and(eq(bookingRequests.id, id), eq(bookingRequests.userId, userId), inArray(bookingRequests.status, ['pending', 'accepted'])))
      .returning()
    return row ?? null
  },

  /** A yes the customer did not confirm in time: expired, conditional on its deadline. */
  async expireAccepted(id: string, now: Date): Promise<BookingRequestRecord | null> {
    const [row] = await db
      .update(bookingRequests)
      .set({ status: 'expired', closedAt: now, customerToldAt: now, updatedAt: now })
      .where(
        and(
          eq(bookingRequests.id, id),
          eq(bookingRequests.status, 'accepted'),
          lte(bookingRequests.confirmBy, now),
          // A customer paying right now is not cut off: an open checkout for
          // it waits until it is paid or runs out.
          sql`NOT EXISTS (
            SELECT 1 FROM booking_intents i
             WHERE i.request_id = ${bookingRequests.id} AND i.status = 'pending' AND i.expires_at > ${now.toISOString()}::timestamptz
          )`
        )
      )
      .returning()
    return row ?? null
  },

  /** Marks that the customer was told how a row ended. */
  async markCustomerTold(id: string, now: Date) {
    await db.update(bookingRequests).set({ customerToldAt: now }).where(eq(bookingRequests.id, id))
  },

  /**
   * Claims the 30-minute "no answer yet" alert for a waiting request, once
   * (conditional on not yet claimed). True when this call claimed it.
   */
  async claimNoReplyAlert(id: string, now: Date): Promise<boolean> {
    const rows = await db
      .update(bookingRequests)
      .set({ opsAlertedAt: now })
      .where(and(eq(bookingRequests.id, id), eq(bookingRequests.status, 'pending'), isNull(bookingRequests.opsAlertedAt)))
      .returning({ id: bookingRequests.id })
    return rows.length > 0
  },

  /** Waiting requests 30 minutes old with no alert yet, oldest first. */
  listNeedingAlert(createdBefore: Date, limit: number) {
    return db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.status, 'pending'),
          isNull(bookingRequests.opsAlertedAt),
          lte(bookingRequests.createdAt, createdBefore)
        )
      )
      .orderBy(asc(bookingRequests.createdAt))
      .limit(limit)
  },

  /** Waiting requests whose garage's time ran out, oldest deadline first. */
  listWaitingPastDeadline(now: Date, limit: number) {
    return db
      .select()
      .from(bookingRequests)
      .where(and(eq(bookingRequests.status, 'pending'), lte(bookingRequests.respondBy, now)))
      .orderBy(asc(bookingRequests.respondBy))
      .limit(limit)
  },

  /** Accepted requests the customer did not confirm in time, oldest first. */
  listAcceptedPastDeadline(now: Date, limit: number) {
    return db
      .select()
      .from(bookingRequests)
      .where(and(eq(bookingRequests.status, 'accepted'), lte(bookingRequests.confirmBy, now)))
      .orderBy(asc(bookingRequests.confirmBy))
      .limit(limit)
  },

  /**
   * The garage's received bookings so far (payment landed, not Test, not a
   * free redo), one per chain: where a new one would fall in its free 25.
   */
  async countReceivedChains(vendorId: string): Promise<number> {
    const rows = await db.execute<{ count: number | string }>(sql`
      SELECT count(*) AS count
        FROM bookings b
        JOIN payments p ON p.booking_id = b.id
       WHERE b.vendor_id = ${vendorId}
         AND b.original_booking_id IS NULL
         AND b.marked_test_at IS NULL
         AND NOT b.guarantee_redo
         AND p.status IN ('paid', 'collected', 'refunded')
    `)
    return Number(Array.from(rows)[0]?.count ?? 0)
  },

  // ─── Admin (0064) ──────────────────────────────────────────────────────────

  /**
   * The admin Requests list: every row of the newest `limit` requests sent
   * since `since`, and of any older one still open, with the customer's
   * name and phone and each garage's name and phone, first rows first (the
   * service puts each request together; its last row is where it stands).
   */
  listForAdmin(since: Date, limit: number) {
    return db
      .select({
        request: bookingRequests,
        customerName: users.name,
        customerPhone: users.phone,
        garageName: vendors.businessName,
        garagePhone: vendors.phone,
      })
      .from(bookingRequests)
      .innerJoin(users, eq(users.id, bookingRequests.userId))
      .innerJoin(vendors, eq(vendors.id, bookingRequests.vendorId))
      .where(
        sql`coalesce(${bookingRequests.rootRequestId}, ${bookingRequests.id}) IN (
          SELECT b.id FROM booking_requests b
           WHERE b.chain_no = 1
             AND (b.created_at >= ${since.toISOString()}::timestamptz OR EXISTS (
               SELECT 1 FROM booking_requests o
                WHERE coalesce(o.root_request_id, o.id) = b.id AND o.status IN ('pending', 'accepted')
             ))
           ORDER BY b.created_at DESC
           LIMIT ${limit}
        )`
      )
      .orderBy(asc(bookingRequests.chainNo), asc(bookingRequests.createdAt))
  },

  /**
   * The latest row of every request sent since `since`, with its zone: what
   * Coverage counts demand from (lib/zone-demand.ts).
   */
  async listLatestSince(since: Date): Promise<Array<{ zoneSlug: string | null; status: string; reply: string | null }>> {
    const rows = await db.execute<{ zone_slug: string | null; status: string; reply: string | null }>(sql`
      SELECT DISTINCT ON (coalesce(r.root_request_id, r.id)) r.zone_slug, r.status, r.reply
        FROM booking_requests r
       WHERE coalesce(r.root_request_id, r.id) IN (
               SELECT b.id FROM booking_requests b WHERE b.chain_no = 1 AND b.created_at >= ${since.toISOString()}::timestamptz
             )
       ORDER BY coalesce(r.root_request_id, r.id), r.chain_no DESC
    `)
    return Array.from(rows).map((row) => ({ zoneSlug: row.zone_slug, status: row.status, reply: row.reply }))
  },

  /** Requests (one per request, however many garages) sent from a zone, by its slug. */
  async countInZone(slug: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(and(eq(bookingRequests.zoneSlug, slug), eq(bookingRequests.chainNo, 1)))
    return Number(row?.count ?? 0)
  },

  /**
   * An admin's cancel: an open row (waiting, or accepted with no checkout
   * open for it: a customer paying right now is not cut off), cancelled
   * with who and why, and the audit row, in one transaction. Null when it
   * was not open, or a checkout is.
   */
  cancelByAdmin(input: { id: string; actorName: string; actorSub: string; reason: string; now: Date }): Promise<BookingRequestRecord | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(bookingRequests)
        .set({
          status: 'cancelled',
          closedAt: input.now,
          updatedAt: input.now,
          cancelledByName: input.actorName,
          cancelReason: input.reason,
        })
        .where(
          and(
            eq(bookingRequests.id, input.id),
            inArray(bookingRequests.status, ['pending', 'accepted']),
            sql`NOT EXISTS (
              SELECT 1 FROM booking_intents i
               WHERE i.request_id = ${bookingRequests.id} AND i.status = 'pending' AND i.expires_at > ${input.now.toISOString()}::timestamptz
            )`
          )
        )
        .returning()
      if (!row) return null
      await tx.insert(adminAuditLog).values({
        action: 'booking_request_cancelled',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { requestId: row.id, status: 'cancelled', was: row.reply === 'accepted' ? 'accepted' : 'pending' },
        detail: { reason: input.reason, vendorId: row.vendorId, rootRequestId: row.rootRequestId ?? row.id },
      })
      return row
    })
  },

  /** Whether a customer is paying for this request right now (an unexpired checkout for it). */
  async hasOpenCheckout(id: string, now: Date): Promise<boolean> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT i.id FROM booking_intents i
       WHERE i.request_id = ${id} AND i.status = 'pending' AND i.expires_at > ${now.toISOString()}::timestamptz
       LIMIT 1
    `)
    return Array.from(rows).length > 0
  },

  /** The garage's name, for words. */
  async garageName(vendorId: string): Promise<string | null> {
    const [row] = await db.select({ name: vendors.businessName }).from(vendors).where(eq(vendors.id, vendorId)).limit(1)
    return row?.name ?? null
  },
}
