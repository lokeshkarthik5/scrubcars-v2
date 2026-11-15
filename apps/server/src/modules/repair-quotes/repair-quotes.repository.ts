import { and, asc, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  repairQuoteRequests,
  repairQuotes,
  users,
  vendors,
  type RepairQuoteBox,
  type RepairQuotePhoto,
  type RepairBriefSource,
} from '../../db/schema.js'
import type { GarageCalendar } from '../../lib/response-deadline.js'
import { readGarageCalendar } from '../bookings/bookings.repository.js'
import { COUNTED_REVIEW } from '../reviews/reviews.predicates.js'
import { LISTED_TO_CUSTOMERS } from '../vendors/vendors.predicates.js'

/**
 * Repair & bodywork quotes (0075): every query, no rules (lib/repair-quotes.ts
 * and the service decide). Reads are awaited one at a time (production has
 * one database connection; db/one-read-at-a-time.test.ts).
 */

export type RequestRow = typeof repairQuoteRequests.$inferSelect
export type QuoteRow = typeof repairQuotes.$inferSelect
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type Point = { lat: number; lng: number }

const geography = (point: Point) =>
  sql`gis.ST_SetSRID(gis.ST_MakePoint(${point.lng}, ${point.lat}), 4326)::gis.geography`

/**
 * A garage can be booked for a visit from a quote when it has an active
 * service priced on inspection with no fee (0073): the visit is that
 * booking, with nothing to pay. Against the alias `v`.
 */
const NO_FEE_INSPECTION = sql`EXISTS (
  SELECT 1 FROM services s
   WHERE s.vendor_id = v.id AND s.is_active = true AND s.is_addon = false
     AND s.pricing_type = 'on_inspection' AND s.price = 0
)`

/** A garage asked about a request, as the lists show it. */
export interface QuoteWithGarage {
  quote: QuoteRow
  garage: { id: string; name: string; ratingAverage: number | null; ratingCount: number }
}

export interface Candidate {
  vendorId: string
  businessName: string
  distanceM: number
}

export interface BadgeJobRow {
  vendorId: string
  priceFrom: number
  priceTo: number
  completed: boolean
  billTotal: number | null
}

export const repairQuotesRepository = {
  /**
   * The nearest garages that take repair quotes and can be booked for a free
   * inspection visit, listed to customers, taking drop-ins and pinned, within
   * `radiusM` of the point: KNN order, at most `limit`.
   */
  async nearestGarages(point: Point, radiusM: number, limit: number): Promise<Candidate[]> {
    const at = geography(point)
    const rows = await db.execute<{ id: string; business_name: string; distance_m: number | string }>(sql`
      SELECT v.id, v.business_name, gis.ST_Distance(v.geo, ${at}) AS distance_m
        FROM vendors v
       WHERE ${LISTED_TO_CUSTOMERS}
         AND v.geo IS NOT NULL
         AND v.dropin_enabled = true
         AND v.repair_quotes_enabled = true
         AND ${NO_FEE_INSPECTION}
         AND gis.ST_DWithin(v.geo, ${at}, ${radiusM}, false)
       ORDER BY v.geo OPERATOR(gis.<->) ${at}
       LIMIT ${limit}
    `)
    return Array.from(rows).map((row) => ({
      vendorId: row.id,
      businessName: row.business_name,
      distanceM: Number(row.distance_m),
    }))
  },

  /** When the garage is open, for its clock to answer (lib/response-deadline.ts). */
  calendar(vendorId: string, from: Date, until: Date): Promise<GarageCalendar> {
    return readGarageCalendar(db, vendorId, from, until)
  },

  /** The garage's cheapest no-fee inspection service: what a visit from a quote books. */
  async inspectionServiceFor(vendorId: string): Promise<{ id: string } | null> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT s.id FROM services s
       WHERE s.vendor_id = ${vendorId} AND s.is_active = true AND s.is_addon = false
         AND s.pricing_type = 'on_inspection' AND s.price = 0
       ORDER BY (s.category = 'scratch_removal') DESC, s.duration_mins ASC NULLS LAST, s.name ASC
       LIMIT 1
    `)
    return Array.from(rows)[0] ?? null
  },

  /**
   * Writes a request and its garages in one transaction, under the
   * customer's own lock (`repair-quotes:<userId>`, taken on its own, never
   * alongside the booking locks), and only while they have fewer than
   * `maxOpen` open requests. Null when they already have that many.
   */
  async createRequest(input: {
    request: {
      userId: string
      vehicleId: string
      vehicleLabel: string
      vehicleType: 'hatchback' | 'sedan' | 'suv'
      lat: number
      lng: number
      area: string | null
      note: string
      brief: string
      damageArea: string | null
      damageLabel: string | null
      briefSource: RepairBriefSource
      box: RepairQuoteBox | null
      videoKey: string | null
      videoSecs: number | null
      photos: RepairQuotePhoto[]
      closesAt: Date
      createdAt: Date
    }
    quotes: Array<{ vendorId: string; distanceKm: string; respondBy: Date }>
    maxOpen: number
  }): Promise<{ request: RequestRow; quotes: QuoteRow[] } | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`repair-quotes:${input.request.userId}`})::bigint)`)
      const [open] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(repairQuoteRequests)
        .where(
          and(
            eq(repairQuoteRequests.userId, input.request.userId),
            eq(repairQuoteRequests.status, 'open'),
            gt(repairQuoteRequests.closesAt, input.request.createdAt)
          )
        )
      if ((open?.count ?? 0) >= input.maxOpen) return null
      const [request] = await tx
        .insert(repairQuoteRequests)
        .values({ ...input.request, updatedAt: input.request.createdAt })
        .returning()
      const quotes = await tx
        .insert(repairQuotes)
        .values(input.quotes.map((quote) => ({ ...quote, requestId: request!.id, createdAt: input.request.createdAt })))
        .returning()
      return { request: request!, quotes }
    })
  },

  async findRequest(id: string): Promise<RequestRow | undefined> {
    const [row] = await db.select().from(repairQuoteRequests).where(eq(repairQuoteRequests.id, id)).limit(1)
    return row
  },

  /** A customer's requests, newest first (the last `limit`). */
  listRequestsForUser(userId: string, limit: number): Promise<RequestRow[]> {
    return db
      .select()
      .from(repairQuoteRequests)
      .where(eq(repairQuoteRequests.userId, userId))
      .orderBy(desc(repairQuoteRequests.createdAt))
      .limit(limit)
  },

  /** The garages asked about these requests, with their names and counted ratings (0065). */
  async quotesFor(requestIds: string[]): Promise<QuoteWithGarage[]> {
    if (requestIds.length === 0) return []
    const rows = await db
      .select({
        quote: repairQuotes,
        garageName: vendors.businessName,
        ratingAverage: sql<number | string | null>`(SELECT avg(r.rating) FROM reviews r WHERE r.vendor_id = ${vendors.id} AND ${COUNTED_REVIEW})`,
        ratingCount: sql<number | string>`(SELECT count(*) FROM reviews r WHERE r.vendor_id = ${vendors.id} AND ${COUNTED_REVIEW})`,
      })
      .from(repairQuotes)
      .innerJoin(vendors, eq(vendors.id, repairQuotes.vendorId))
      .where(inArray(repairQuotes.requestId, requestIds))
      .orderBy(asc(repairQuotes.distanceKm), asc(repairQuotes.createdAt))
    return rows.map((row) => ({
      quote: row.quote,
      garage: {
        id: row.quote.vendorId,
        name: row.garageName,
        ratingAverage: row.ratingAverage === null ? null : Number(row.ratingAverage),
        ratingCount: Number(row.ratingCount),
      },
    }))
  },

  /**
   * Every visit booked from these garages' quotes, with whether it was done
   * and its final bill's total (a non-cancelled bill), for "Final bills match
   * quotes" (lib/repair-quotes.ts billsMatchQuotes).
   */
  async badgeJobs(vendorIds: string[]): Promise<BadgeJobRow[]> {
    if (vendorIds.length === 0) return []
    const rows = await db.execute<{
      vendor_id: string
      price_from: number
      price_to: number
      completed: boolean
      bill_total: string | null
    }>(sql`
      SELECT q.vendor_id, q.price_from, q.price_to, (b.status = 'completed') AS completed,
             (SELECT c.total_amount FROM booking_charges c
               WHERE c.booking_id = b.id AND c.kind = 'final_bill' AND c.status <> 'cancelled'
               ORDER BY c.created_at DESC LIMIT 1) AS bill_total
        FROM repair_quotes q
        JOIN bookings b ON b.id = q.booking_id
       WHERE q.vendor_id IN (${sql.join(vendorIds.map((id) => sql`${id}::uuid`), sql`, `)})
         AND b.marked_test_at IS NULL
    `)
    return Array.from(rows).map((row) => ({
      vendorId: row.vendor_id,
      priceFrom: Number(row.price_from),
      priceTo: Number(row.price_to),
      completed: row.completed === true,
      billTotal: row.bill_total === null ? null : Number(row.bill_total),
    }))
  },

  /** The customer's own cancel: only while open. Null when it was not open. */
  async cancelRequest(id: string, userId: string, now: Date): Promise<RequestRow | null> {
    const [row] = await db
      .update(repairQuoteRequests)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(
        and(
          eq(repairQuoteRequests.id, id),
          eq(repairQuoteRequests.userId, userId),
          eq(repairQuoteRequests.status, 'open'),
          gt(repairQuoteRequests.closesAt, now)
        )
      )
      .returning()
    return row ?? null
  },

  // ─── The garage ────────────────────────────────────────────────────────────

  /** One of this garage's quotes with its request; another garage's is undefined. */
  async findQuoteForGarage(quoteId: string, vendorId: string): Promise<{ quote: QuoteRow; request: RequestRow } | undefined> {
    const [row] = await db
      .select({ quote: repairQuotes, request: repairQuoteRequests })
      .from(repairQuotes)
      .innerJoin(repairQuoteRequests, eq(repairQuoteRequests.id, repairQuotes.requestId))
      .where(and(eq(repairQuotes.id, quoteId), eq(repairQuotes.vendorId, vendorId)))
      .limit(1)
    return row
  },

  /** This garage's quotes sent since `since`, newest first, with their requests. */
  listForGarage(vendorId: string, since: Date, limit: number) {
    return db
      .select({ quote: repairQuotes, request: repairQuoteRequests })
      .from(repairQuotes)
      .innerJoin(repairQuoteRequests, eq(repairQuoteRequests.id, repairQuotes.requestId))
      .where(and(eq(repairQuotes.vendorId, vendorId), gte(repairQuotes.createdAt, since)))
      .orderBy(desc(repairQuotes.createdAt))
      .limit(limit)
  },

  /** How many wait for this garage's answer, in time: the Requests badge. */
  async waitingCount(vendorId: string, now: Date): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(repairQuotes)
      .innerJoin(repairQuoteRequests, eq(repairQuoteRequests.id, repairQuotes.requestId))
      .where(
        and(
          eq(repairQuotes.vendorId, vendorId),
          eq(repairQuotes.status, 'waiting'),
          gt(repairQuotes.respondBy, now),
          eq(repairQuoteRequests.status, 'open'),
          gt(repairQuoteRequests.closesAt, now)
        )
      )
    return row?.count ?? 0
  },

  /**
   * The garage's answer, conditional on everything the rules checked: still
   * waiting, its time not run out, the request still open. Null when any of
   * it changed since the read (the service says which).
   */
  async answer(input: {
    quoteId: string
    vendorId: string
    userId: string
    now: Date
    answer:
      | { canDo: true; priceFrom: number; priceTo: number; days: number; needsInspection: boolean; note: string | null }
      | { canDo: false; reason: string | null }
  }): Promise<QuoteRow | null> {
    const { answer } = input
    const values = answer.canDo
      ? {
          status: 'quoted' as const,
          priceFrom: answer.priceFrom,
          priceTo: answer.priceTo,
          days: answer.days,
          needsInspection: answer.needsInspection,
          note: answer.note,
        }
      : { status: 'declined' as const, declineReason: answer.reason }
    const [row] = await db
      .update(repairQuotes)
      .set({ ...values, answeredAt: input.now, answeredBy: input.userId })
      .where(
        and(
          eq(repairQuotes.id, input.quoteId),
          eq(repairQuotes.vendorId, input.vendorId),
          eq(repairQuotes.status, 'waiting'),
          gt(repairQuotes.respondBy, input.now),
          sql`EXISTS (SELECT 1 FROM repair_quote_requests r
                       WHERE r.id = ${repairQuotes.requestId} AND r.status = 'open'
                         AND r.closes_at > ${input.now.toISOString()}::timestamptz)`
        )
      )
      .returning()
    return row ?? null
  },

  /**
   * A visit was booked from a quote: the request is booked and the quote
   * names the booking, in one transaction, only while the request is still
   * open. False when it changed (cancelled, closed, or booked elsewhere).
   */
  async markBooked(input: { requestId: string; quoteId: string; bookingId: string; now: Date }): Promise<boolean> {
    return db.transaction(async (tx: Tx) => {
      const [request] = await tx
        .update(repairQuoteRequests)
        .set({ status: 'booked', bookedQuoteId: input.quoteId, updatedAt: input.now })
        .where(and(eq(repairQuoteRequests.id, input.requestId), eq(repairQuoteRequests.status, 'open')))
        .returning({ id: repairQuoteRequests.id })
      if (!request) return false
      await tx
        .update(repairQuotes)
        .set({ bookingId: input.bookingId })
        .where(and(eq(repairQuotes.id, input.quoteId), eq(repairQuotes.status, 'quoted')))
      return true
    })
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** Requests sent since `since` (and any older still open), newest first, with the customer. */
  listForAdmin(since: Date, now: Date, limit: number) {
    return db
      .select({ request: repairQuoteRequests, customerName: users.name, customerPhone: users.phone })
      .from(repairQuoteRequests)
      .innerJoin(users, eq(users.id, repairQuoteRequests.userId))
      .where(
        sql`(${repairQuoteRequests.createdAt} >= ${since.toISOString()}::timestamptz
          OR (${repairQuoteRequests.status} = 'open' AND ${repairQuoteRequests.closesAt} > ${now.toISOString()}::timestamptz))`
      )
      .orderBy(desc(repairQuoteRequests.createdAt))
      .limit(limit)
  },

  /** The garages' business phones, for "Call garages". */
  async garagePhones(vendorIds: string[]): Promise<Map<string, string>> {
    if (vendorIds.length === 0) return new Map()
    const rows = await db
      .select({ id: vendors.id, phone: vendors.phone })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds))
    return new Map(rows.map((row) => [row.id, row.phone]))
  },

  /** The garage's switch and whether a visit can be booked there. Undefined: no such garage. */
  async garageSetting(vendorId: string): Promise<{ enabled: boolean; bookable: boolean } | undefined> {
    const rows = await db.execute<{ enabled: boolean; bookable: boolean }>(sql`
      SELECT v.repair_quotes_enabled AS enabled, ${NO_FEE_INSPECTION} AS bookable
        FROM vendors v WHERE v.id = ${vendorId}
    `)
    const row = Array.from(rows)[0]
    return row ? { enabled: row.enabled === true, bookable: row.bookable === true } : undefined
  },

  /** The garage's last 30 days (asked, answered in time). */
  async garageStats(vendorId: string, since: Date): Promise<{ asked: number; answeredInTime: number }> {
    const rows = await db.execute<{ asked: number | string; answered: number | string }>(sql`
      SELECT count(*) AS asked,
             count(*) FILTER (WHERE q.answered_at IS NOT NULL AND q.answered_at <= q.respond_by) AS answered
        FROM repair_quotes q
       WHERE q.vendor_id = ${vendorId} AND q.created_at >= ${since.toISOString()}::timestamptz
    `)
    const row = Array.from(rows)[0]
    return { asked: Number(row?.asked ?? 0), answeredInTime: Number(row?.answered ?? 0) }
  },

  async setGarageEnabled(vendorId: string, enabled: boolean): Promise<boolean> {
    const rows = await db
      .update(vendors)
      .set({ repairQuotesEnabled: enabled })
      .where(eq(vendors.id, vendorId))
      .returning({ id: vendors.id })
    return rows.length > 0
  },
}
