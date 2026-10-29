import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  type BookingListCursor,
  type BookingSearch,
} from '../../lib/booking-ops.js'
import { containsPattern } from '../../lib/search.js'
import { NOT_IN_BIN } from '../vendors/vendors.predicates.js'
import type { BookingView } from './admin.validation.js'
import {
  adminAuditLog,
  bookingCharges,
  bookingTimeProposals,
  bookingIntents,
  bookingItems,
  bookingNotes,
  bookings,
  jobPhotos,
  bookingStatusEnum,
  cancelledOnBehalfOfEnum,
  noShowPartyEnum,
  payments,
  receiptNumbers,
  serviceImages,
  services,
  users,
  vendorClosures,
  vendorPhotos,
  vendors,
  vendorWorkingHours,
} from '../../db/schema.js'

type WorkingHoursInsert = typeof vendorWorkingHours.$inferInsert
type ServiceInsert = typeof services.$inferInsert

export type VendorInsert = typeof vendors.$inferInsert
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number]
export type CancelledOnBehalfOf = (typeof cancelledOnBehalfOfEnum.enumValues)[number]
export type NoShowParty = (typeof noShowPartyEnum.enumValues)[number]

/**
 * A saved view's rule (0059; BOOKING_VIEWS in admin.validation.ts), with the
 * moments and ids it needs worked out by the service.
 */
export interface BookingViewWindow {
  /** Today's IST day, [start, end). */
  todayStart: Date
  todayEnd: Date
  /** Waiting bookings count from here on (Today's rule: a day back). */
  waitingAfter: Date
  /** Bookings with a refund owed (lib/refunds.ts, the Refunds page's rule). */
  refundOwedIds: string[]
}

/** Views that run soonest first. */
const ASCENDING_VIEWS: ReadonlySet<BookingView> = new Set(['today', 'upcoming'])

const LIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'in_progress']

/** The rule of one saved view, over `bookings`. */
function viewCondition(view: BookingView, w: BookingViewWindow): SQL {
  switch (view) {
    case 'needs_action': {
      // Paid, waiting for the garage, not Test: Today's waitingWhere.
      const waiting = and(
        eq(bookings.status, 'pending'),
        isNull(bookings.markedTestAt),
        gt(bookings.scheduledAt, w.waitingAfter),
        hasPayment(['paid'])
      )!
      return w.refundOwedIds.length > 0
        ? or(waiting, inArray(bookings.id, w.refundOwedIds))!
        : waiting
    }
    case 'today':
      return and(
        gte(bookings.scheduledAt, w.todayStart),
        lt(bookings.scheduledAt, w.todayEnd),
        ne(bookings.status, 'rescheduled')
      )!
    case 'upcoming':
      return and(
        gte(bookings.scheduledAt, w.todayEnd),
        inArray(bookings.status, LIVE_STATUSES)
      )!
    case 'completed':
      return eq(bookings.status, 'completed')
    case 'cancelled':
      return eq(bookings.status, 'cancelled')
  }
}

/** How the car is served (0059 filters; BOOKING_TYPES in admin.validation.ts). */
export type BookingTypeFilter = 'dropin' | 'doorstep' | 'pickup'

/** Payment (0059 filters; BOOKING_PAYMENTS in admin.validation.ts). */
export type BookingPaymentFilter = 'paid' | 'pay_later' | 'refund_owed'

/** The booking has a payment in one of these states. */
function hasPayment(statuses: Array<(typeof payments.$inferSelect)['status']>): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(payments)
      .where(and(eq(payments.bookingId, bookings.id), inArray(payments.status, statuses)))
  )
}

/**
 * A Payment filter's rule. `paid`: its payment is paid (the panel's "Paid",
 * and needs_action's). `pay_later`: still on, or done, with no money in yet:
 * no payment paid, collected or refunded (an online booking to pay later in
 * the app, a legacy cash one to pay at the garage); cancelled and moved
 * bookings owe nothing. `refund_owed`: a refund owed, the Refunds page's
 * rule, the same ids as needs_action's.
 */
function paymentCondition(payment: BookingPaymentFilter, refundOwedIds: readonly string[]): SQL {
  switch (payment) {
    case 'paid':
      return hasPayment(['paid'])
    case 'pay_later':
      return and(
        inArray(bookings.status, [...LIVE_STATUSES, 'completed']),
        not(hasPayment(['paid', 'collected', 'refunded']))
      )!
    case 'refund_owed':
      return refundOwedIds.length > 0 ? inArray(bookings.id, [...refundOwedIds]) : sql`false`
  }
}

/**
 * The filters the bookings list and its views' counts share (0059), so a
 * view's count is exactly the rows that view lists under the same filters.
 */
export interface BookingFilterSet {
  status?: BookingStatus
  vendorId?: string
  search: BookingSearch | null
  /** Scheduled at or after. */
  start: Date | null
  /** Scheduled before. */
  end: Date | null
  /** Marked "Test" only, or every booking but those. */
  test?: 'only' | 'hide'
  bookingType?: BookingTypeFilter
  payment?: BookingPaymentFilter
  /** Bookings with a refund owed: what `payment: 'refund_owed'` matches. */
  refundOwedIds: readonly string[]
}

/**
 * Those filters as conditions over `bookings`. A search also needs the
 * customer (`users`) and the garage (`vendors`) joined.
 */
export function bookingFilterConditions(filters: BookingFilterSet): SQL[] {
  const conditions: SQL[] = []
  if (filters.status) conditions.push(eq(bookings.status, filters.status))
  if (filters.vendorId) conditions.push(eq(bookings.vendorId, filters.vendorId))
  if (filters.start) conditions.push(gte(bookings.scheduledAt, filters.start))
  if (filters.end) conditions.push(lt(bookings.scheduledAt, filters.end))
  if (filters.test === 'only') conditions.push(isNotNull(bookings.markedTestAt))
  if (filters.test === 'hide') conditions.push(isNull(bookings.markedTestAt))
  if (filters.bookingType) conditions.push(eq(bookings.bookingType, filters.bookingType))
  if (filters.payment) conditions.push(paymentCondition(filters.payment, filters.refundOwedIds))
  if (filters.search) conditions.push(searchCondition(filters.search))
  return conditions
}

/** The search's match on a booking, its customer and its garage. */
function searchCondition(search: BookingSearch): SQL {
  const { text, idPrefix, phoneDigits, receiptNumber } = search
  const matches: SQL[] = [
    ilike(users.name, containsPattern(text)),
    ilike(vendors.businessName, containsPattern(text)),
  ]
  // Ids are stored lowercase, so the prefix is lowercased by the parser and
  // compared as plain text.
  if (idPrefix) matches.push(sql`${bookings.id}::text like ${`${idPrefix}%`}`)
  if (phoneDigits) matches.push(like(users.phone, containsPattern(phoneDigits)))
  // A receipt number belongs to the first booking of a reschedule chain,
  // so it finds every booking of the chain: the one the customer holds now
  // and the ones it was moved from. Compared exactly: the parser has
  // already rebuilt it in the stored shape, whatever was typed.
  if (receiptNumber) {
    matches.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(receiptNumbers)
          .where(
            and(
              eq(receiptNumbers.number, receiptNumber),
              eq(
                receiptNumbers.rootBookingId,
                sql`coalesce(${bookings.originalBookingId}, ${bookings.id})`
              )
            )
          )
      )
    )
  }
  return or(...matches)!
}

export interface BookingListFilters extends BookingFilterSet {
  /** A saved view (0059) and what its rule needs; left out is All. */
  view?: { kind: BookingView; window: BookingViewWindow }
  /** Continue after this row; the panel pages this way. */
  after: BookingListCursor | null
  limit: number
  /** Older callers page by offset; zero whenever `after` is set. */
  offset: number
}

// Every relation an admin booking row renders. Declared once so the list and
// the detail can never disagree about what a row carries.
const ADMIN_BOOKING_RELATIONS = {
  vendor: true as const,
  user: true as const,
  // `service` is the deprecated first-item pointer; `items` is what a
  // multi-service booking actually contains.
  service: true as const,
  items: { orderBy: [asc(bookingItems.sortOrder)] },
  vehicle: true as const,
  payment: true as const,
  // Every final bill, newest first: the list flags one still to be paid, and
  // the detail shows the live one and any it replaced.
  charges: { orderBy: [desc(bookingCharges.createdAt)] },
}

export const adminRepository = {
  /**
   * Every garage, the Bin included (its card shows when, by whom and why),
   * and none deleted forever: a tombstone is only there for its receipts.
   */
  listVendors() {
    return db.query.vendors.findMany({
      where: isNull(vendors.purgedAt),
      with: {
        owner: true,
        // Active plain services, with just what the list counts and the
        // checklist reads. Packages share this table, so they are excluded:
        // the count is a count of services, and a package's own description
        // is not what "services without a description" asks about.
        // The pricing columns are for the Missing keys' "prices" (0059).
        services: {
          columns: {
            id: true,
            description: true,
            // "Duration not set" on the checklist (0064).
            durationMins: true,
            pricingType: true,
            price: true,
            priceHatchback: true,
            priceSedan: true,
            priceSuv: true,
          },
          where: and(eq(services.isActive, true), ne(services.category, 'package')),
        },
        // Ids only: the checklist asks whether there are any.
        photos: { columns: { id: true } },
        workingHours: { columns: { dayOfWeek: true, isClosed: true } },
      },
      // Newest first; the id breaks a tie, so two garages made in the same
      // instant (seeds, imports) always come in the same order.
      orderBy: [desc(vendors.createdAt), desc(vendors.id)],
    })
  },

  /**
   * The garages that drew their own doorstep area, as one query for the whole
   * list. Raw SQL: `doorstep_area` is not declared in the Drizzle schema (see
   * hasDoorstepArea below).
   */
  async listVendorIdsWithDoorstepArea(): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT v.id FROM vendors v WHERE v.doorstep_area IS NOT NULL
    `)
    return Array.from(rows).map((row) => row.id)
  },

  findVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
    })
  },

  // Full detail for the admin edit screen: owner + weekly working hours +
  // holidays from `closuresFrom` on + active services (soft-deleted ones are
  // hidden from the editor) + the media the admin can manage — gallery photos
  // and each service's own images.
  findVendorDetailById(id: string, closuresFrom: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
      with: {
        owner: true,
        workingHours: {
          orderBy: [asc(vendorWorkingHours.dayOfWeek)],
        },
        closures: {
          where: gte(vendorClosures.date, closuresFrom),
          orderBy: [asc(vendorClosures.date)],
        },
        photos: {
          orderBy: [asc(vendorPhotos.sortOrder), asc(vendorPhotos.createdAt)],
        },
        services: {
          where: and(eq(services.isActive, true), ne(services.category, 'package')),
          orderBy: [asc(services.name)],
          with: {
            images: {
              orderBy: [
                asc(serviceImages.sortOrder),
                asc(serviceImages.createdAt),
              ],
            },
          },
        },
      },
    })
  },

  /**
   * Whether the garage drew its own doorstep area in the garage app. Where it
   * did, the area decides which addresses it covers and the radius is not
   * read (bookings.repository.ts), so the admin editor must not quote the
   * radius as the reach. Raw SQL: `doorstep_area` is not declared in the
   * Drizzle schema (see vendorsRepository.getDoorstepArea).
   */
  async hasDoorstepArea(id: string): Promise<boolean> {
    const rows = await db.execute<{ drawn: boolean }>(sql`
      SELECT v.doorstep_area IS NOT NULL AS drawn
        FROM vendors v
       WHERE v.id = ${id}
    `)
    return Array.from(rows)[0]?.drawn === true
  },

  // Any service (including a package) by id alone — the admin media routes are
  // keyed by service, and need the row to resolve which vendor's R2 prefix the
  // upload belongs under.
  findServiceById(id: string) {
    return db.query.services.findFirst({
      where: eq(services.id, id),
      with: {
        images: {
          orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
        },
      },
    })
  },

  updateVendor(id: string, data: Partial<VendorInsert>) {
    return db.update(vendors).set(data).where(eq(vendors.id, id)).returning()
  },

  /**
   * Supply-vs-demand by geographic cell, for the ops view.
   *
   * Buckets both garages and doorstep booking locations onto a grid and reports
   * where they disagree — cells with customers ordering doorstep work but no
   * garage nearby are where the next garage should be recruited.
   *
   * The grid is plain coordinate rounding rather than H3. At city scale the
   * distortion from using degrees is irrelevant (a cell is ~1.1 km tall and
   * ~1.08 km wide at Chennai's latitude), and it needs no extension, no
   * dependency and no index — the alternative was pulling in H3 to answer a
   * question that a GROUP BY already answers. Revisit if this ever needs to be
   * correct across very different latitudes.
   */
  async getDemandSupplyCells(precision = 2) {
    const rows = await db.execute<{
      cell_lat: number
      cell_lng: number
      vendor_count: number
      booking_count: number
    }>(sql`
      WITH grid AS (
        SELECT
          round(v.lat::numeric, ${precision}) AS cell_lat,
          round(v.lng::numeric, ${precision}) AS cell_lng,
          1 AS is_vendor,
          0 AS is_booking
          FROM vendors v
         WHERE v.lat IS NOT NULL
           AND v.status = 'active'
           AND v.is_verified = true
           -- A garage in the Bin serves nobody, so it is no supply.
           AND ${NOT_IN_BIN}

        UNION ALL

        SELECT
          round(b.lat::numeric, ${precision}) AS cell_lat,
          round(b.lng::numeric, ${precision}) AS cell_lng,
          0 AS is_vendor,
          1 AS is_booking
          FROM bookings b
         WHERE b.lat IS NOT NULL
           AND b.status <> 'cancelled'
      )
      SELECT
        cell_lat::float AS cell_lat,
        cell_lng::float AS cell_lng,
        sum(is_vendor)::int  AS vendor_count,
        sum(is_booking)::int AS booking_count
        FROM grid
       GROUP BY cell_lat, cell_lng
       ORDER BY sum(is_booking) DESC, sum(is_vendor) ASC
       LIMIT 500
    `)

    return Array.from(rows).map((row) => ({
      lat: Number(row.cell_lat),
      lng: Number(row.cell_lng),
      vendorCount: Number(row.vendor_count),
      bookingCount: Number(row.booking_count),
    }))
  },

  verifyVendor(id: string) {
    return db
      .update(vendors)
      // Verifying is the moment a human actually looked at this garage, so it
      // is also the moment its pin counts as confirmed. The service refuses to
      // get here while geo is null.
      .set({ isVerified: true, status: 'active', geoConfirmedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning()
  },

  archiveVendor(id: string) {
    return db
      .update(vendors)
      .set({ status: 'archived' })
      .where(eq(vendors.id, id))
      .returning()
  },

  // Restore an archived vendor. It becomes visible to customers again only if
  // it is also verified (public listings require status='active' AND verified).
  unarchiveVendor(id: string) {
    return db
      .update(vendors)
      .set({ status: 'active' })
      .where(eq(vendors.id, id))
      .returning()
  },

  /**
   * Every booking each garage has ever had, in any state, as one grouped
   * query for the whole list. Garages with none have no row.
   */
  countBookingsByVendor() {
    return db
      .select({ vendorId: bookings.vendorId, value: count() })
      .from(bookings)
      .groupBy(bookings.vendorId)
  },

  findUserByPhone(phone: string) {
    return db.query.users.findFirst({
      where: eq(users.phone, phone),
    })
  },

  createOwner(data: { name: string; phone: string }) {
    return db
      .insert(users)
      .values({
        name: data.name,
        phone: data.phone,
        isCustomer: false,
        isVendorOwner: true,
        phoneVerified: true,
      })
      .returning()
  },

  updateUser(id: string, data: { name?: string; phone?: string }) {
    return db.update(users).set(data).where(eq(users.id, id)).returning()
  },

  setUserAsVendorOwner(userId: string) {
    return db
      .update(users)
      .set({ isVendorOwner: true })
      .where(eq(users.id, userId))
      .returning()
  },

  findVendorByOwnerId(ownerId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.ownerId, ownerId),
    })
  },

  createVendor(data: VendorInsert) {
    return db.insert(vendors).values(data).returning()
  },

  insertWorkingHours(rows: WorkingHoursInsert[]) {
    if (rows.length === 0) return Promise.resolve([])
    return db.insert(vendorWorkingHours).values(rows).returning()
  },

  deleteWorkingHours(vendorId: string) {
    return db
      .delete(vendorWorkingHours)
      .where(eq(vendorWorkingHours.vendorId, vendorId))
  },

  insertServices(rows: ServiceInsert[]) {
    if (rows.length === 0) return Promise.resolve([])
    return db.insert(services).values(rows).returning()
  },

  // Every plain service of a vendor with its state, to reconcile the admin
  // edit payload (lib/service-reconcile.ts). Packages MUST stay out: the admin
  // editor never sends them, so including them here would make every save
  // deactivate all of the vendor's packages.
  async listServiceStates(
    vendorId: string
  ): Promise<Array<{ id: string; isActive: boolean; deleted: boolean }>> {
    const rows = await db.query.services.findMany({
      columns: { id: true, isActive: true, deletedAt: true },
      where: and(eq(services.vendorId, vendorId), ne(services.category, 'package')),
    })
    return rows.map((r) => ({ id: r.id, isActive: r.isActive, deleted: r.deletedAt !== null }))
  },

  // Never touches a deleted service, so no save can bring one back.
  updateService(id: string, data: Partial<ServiceInsert>) {
    return db
      .update(services)
      .set(data)
      .where(and(eq(services.id, id), isNull(services.deletedAt)))
      .returning()
  },

  // Soft-delete: hide from customers and block new bookings, but keep the row
  // so existing bookings' restrict FK stays intact.
  deactivateServices(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return db
      .update(services)
      .set({ isActive: false })
      .where(inArray(services.id, ids))
      .returning()
  },

  /**
   * One page of booking ids matching the filters, newest scheduled first.
   *
   * Ids only, because the search joins customers and garages to match on their
   * names while the rows themselves are read with the relational API — which
   * cannot filter on a joined table's columns. The id is the tiebreak so a page
   * boundary never splits two bookings at the same time unpredictably.
   */
  async searchBookingIds(filters: BookingListFilters): Promise<string[]> {
    const conditions = bookingFilterConditions(filters)
    if (filters.view) conditions.push(viewCondition(filters.view.kind, filters.view.window))
    // Today and Upcoming run soonest first (0059); everything else newest
    // scheduled first.
    const ascending = filters.view !== undefined && ASCENDING_VIEWS.has(filters.view.kind)
    // A row comparison in the same order as the ORDER BY below, so "after the
    // cursor" means exactly "further down the list".
    if (filters.after) {
      const cursor = sql`(${filters.after.scheduledAt.toISOString()}::timestamptz, ${filters.after.id}::uuid)`
      conditions.push(
        ascending
          ? sql`(${bookings.scheduledAt}, ${bookings.id}) > ${cursor}`
          : sql`(${bookings.scheduledAt}, ${bookings.id}) < ${cursor}`
      )
    }

    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId))
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        ...(ascending
          ? [asc(bookings.scheduledAt), asc(bookings.id)]
          : [desc(bookings.scheduledAt), desc(bookings.id)])
      )
      .limit(filters.limit)
      .offset(filters.offset)

    return rows.map((row) => row.id)
  },

  /**
   * How many bookings each saved view holds (0059), under every filter the
   * list has (bookingFilterConditions): one COUNT(*) FILTER query. The
   * customer and garage are joined only when there is a search to match.
   */
  async countBookingViews(
    filters: BookingFilterSet,
    window: BookingViewWindow
  ): Promise<Record<BookingView | 'all', number>> {
    const conditions = bookingFilterConditions(filters)
    const counted = (view: BookingView) =>
      sql<number>`(count(*) filter (where ${viewCondition(view, window)}))::int`

    let query = db
      .select({
        all: sql<number>`count(*)::int`,
        needs_action: counted('needs_action'),
        today: counted('today'),
        upcoming: counted('upcoming'),
        completed: counted('completed'),
        cancelled: counted('cancelled'),
      })
      .from(bookings)
      .$dynamic()
    if (filters.search) {
      query = query
        .innerJoin(users, eq(users.id, bookings.userId))
        .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
    }
    const [row] = await query.where(conditions.length > 0 ? and(...conditions) : undefined)
    return {
      needs_action: row?.needs_action ?? 0,
      today: row?.today ?? 0,
      upcoming: row?.upcoming ?? 0,
      completed: row?.completed ?? 0,
      cancelled: row?.cancelled ?? 0,
      all: row?.all ?? 0,
    }
  },

  /** The rows for a page of ids, in no particular order — the caller re-sorts. */
  findBookingsByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return db.query.bookings.findMany({
      where: inArray(bookings.id, ids),
      with: ADMIN_BOOKING_RELATIONS,
    })
  },

  /** Note counts per booking, for the list. Bookings with none are absent. */
  async countNotesByBooking(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map()
    const rows = await db
      .select({ bookingId: bookingNotes.bookingId, value: count() })
      .from(bookingNotes)
      .where(inArray(bookingNotes.bookingId, ids))
      .groupBy(bookingNotes.bookingId)
    return new Map(rows.map((row) => [row.bookingId, row.value]))
  },

  /** One booking with the relations an action and its Telegram alert need. */
  findBookingById(id: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: ADMIN_BOOKING_RELATIONS,
    })
  },

  /** One booking with everything the detail page shows, notes newest first. */
  findBookingDetail(id: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: {
        ...ADMIN_BOOKING_RELATIONS,
        notes: { orderBy: [desc(bookingNotes.createdAt), desc(bookingNotes.id)] },
        photos: { orderBy: [asc(jobPhotos.createdAt), asc(jobPhotos.id)] },
        // Every time suggestion the garage made on it (0041), newest first.
        timeProposals: { orderBy: [desc(bookingTimeProposals.createdAt)] },
      },
    })
  },

  /**
   * Detlio waives the photo standard on a booking (0045): once, and not on a
   * cancelled one. Empty when it was already waived, or is gone or cancelled.
   */
  waiveJobPhotos(bookingId: string, input: { by: string; reason: string; at: Date }) {
    return db
      .update(bookings)
      .set({ photosWaivedAt: input.at, photosWaivedBy: input.by, photosWaivedReason: input.reason })
      .where(
        and(
          eq(bookings.id, bookingId),
          isNull(bookings.photosWaivedAt),
          ne(bookings.status, 'cancelled')
        )
      )
      .returning({ id: bookings.id })
  },

  /**
   * Takes Detlio's photo waiver back (0065): only while the booking is in
   * one of `statuses` and has no free redo claim. Empty when it did not.
   */
  undoJobPhotosWaiver(bookingId: string, statuses: string[]) {
    return db
      .update(bookings)
      .set({ photosWaivedAt: null, photosWaivedBy: null, photosWaivedReason: null })
      .where(
        and(
          eq(bookings.id, bookingId),
          isNotNull(bookings.photosWaivedAt),
          sql`${bookings.status}::text in (${sql.join(statuses.map((status) => sql`${status}`), sql`, `)})`,
          sql`not exists (select 1 from guarantee_claims g where g.booking_id = ${bookings.id})`
        )
      )
      .returning({ id: bookings.id })
  },

  /** Whether a free redo claim (0051) was made on this booking. */
  async hasGuaranteeClaim(bookingId: string): Promise<boolean> {
    const rows = await db.execute<{ one: number }>(
      sql`select 1 as one from guarantee_claims where booking_id = ${bookingId} limit 1`
    )
    return Array.from(rows).length > 0
  },

  /**
   * Every job completed since `since` (by completion time, or the slot for
   * one from before completion times were kept), with its garage's photo
   * counts per stage, for photo compliance (0045, lib/photo-compliance.ts
   * decides). Counts only: no photo, URL or person is read.
   */
  async listPhotoComplianceJobs(since: Date) {
    const rows = await db
      .select({
        vendorId: bookings.vendorId,
        finishedAt: sql<Date>`coalesce(${bookings.completedAt}, ${bookings.scheduledAt})`.mapWith(
          (value: string | Date) => new Date(value)
        ),
        garageBefore: sql<number>`count(*) filter (where ${jobPhotos.stage} = 'before')`.mapWith(Number),
        garageAfter: sql<number>`count(*) filter (where ${jobPhotos.stage} = 'after')`.mapWith(Number),
        waived: sql<boolean>`${bookings.photosWaivedAt} is not null`,
        markedTest: sql<boolean>`${bookings.markedTestAt} is not null`,
      })
      .from(bookings)
      .leftJoin(
        jobPhotos,
        and(eq(jobPhotos.bookingId, bookings.id), eq(jobPhotos.uploadedByRole, 'garage'))
      )
      .where(
        and(
          eq(bookings.status, 'completed'),
          sql`coalesce(${bookings.completedAt}, ${bookings.scheduledAt}) >= ${since.toISOString()}::timestamptz`
        )
      )
      .groupBy(bookings.id)
    return rows
  },

  /** The booking this one was moved to, if the customer rescheduled it. */
  async findRescheduledToId(id: string): Promise<string | null> {
    const row = await db.query.bookings.findFirst({
      columns: { id: true },
      where: eq(bookings.rescheduledFromId, id),
    })
    return row?.id ?? null
  },

  /**
   * Which of these bookings the customer moved to a new time. A moved
   * booking is cancelled with its payment still 'paid', but the payment went
   * with the move, so it owes no refund.
   */
  async findMovedBookingIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await db
      .select({ id: bookings.rescheduledFromId })
      .from(bookings)
      .where(inArray(bookings.rescheduledFromId, ids))
    return new Set(rows.flatMap((row) => (row.id ? [row.id] : [])))
  },

  /** Names for a handful of user ids (who accepted, who completed). */
  async findUserNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, ids))
    return new Map(rows.map((row) => [row.id, row.name]))
  },

  findUserById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id) })
  },

  /**
   * Cancels a booking as Detlio, and records why as an internal note, in one
   * transaction — a cancellation with no note would be an ops action nobody
   * can account for later.
   *
   * Moves on only from the status the caller saw (`from`), the same guard as
   * bookingsRepository.cancelBooking: a garage accepting or a customer
   * cancelling in between would otherwise be silently overwritten. Null means
   * someone else got there first, and nothing was written.
   */
  cancelBookingAsAdmin(
    bookingId: string,
    from: BookingStatus,
    change: {
      onBehalfOf: CancelledOnBehalfOf
      reason: string | null
      noShow: NoShowParty | null
      at: Date
    },
    note: { author: string; body: string }
  ) {
    return db.transaction(async (tx) => {
      const [cancelled] = await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledBy: 'admin',
          cancelledOnBehalfOf: change.onBehalfOf,
          cancellationReason: change.reason,
          cancelledAt: change.at,
          ...(change.noShow && {
            noShow: change.noShow,
            noShowMarkedAt: change.at,
          }),
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, from)))
        .returning()

      if (!cancelled) return null

      await tx.insert(bookingNotes).values({
        bookingId,
        author: note.author,
        body: note.body,
      })

      // An unpaid final bill goes with the booking: a cancelled job is not
      // chased for money. A payment already on its way for it then lands on
      // a withdrawn bill, which is noted and alerted as a refund (see
      // settleCaptured in booking-charges.service). A paid bill is left as
      // it is; whether that money goes back is ops' call.
      //
      // Unpaid extra work goes the same way (0041), and an open time
      // suggestion from the garage is closed: the booking it was about is off.
      await tx
        .update(bookingCharges)
        .set({ status: 'cancelled', cancelReason: 'booking_closed', cancelledAt: change.at, updatedAt: change.at })
        .where(and(eq(bookingCharges.bookingId, bookingId), eq(bookingCharges.status, 'due')))
      await tx
        .update(bookingTimeProposals)
        .set({ status: 'closed', resolvedAt: change.at })
        .where(and(eq(bookingTimeProposals.bookingId, bookingId), eq(bookingTimeProposals.status, 'open')))

      return cancelled
    })
  },

  createBookingNote(data: {
    bookingId: string
    author: string
    body: string
    /** 0065: 'typed' with its session for a person's note; system by default. */
    kind?: 'typed' | 'system'
    authorSub?: string
  }) {
    return db.insert(bookingNotes).values(data).returning()
  },

  /** One note of a booking; another booking's is undefined. */
  async findBookingNote(bookingId: string, noteId: string) {
    const [row] = await db
      .select()
      .from(bookingNotes)
      .where(and(eq(bookingNotes.id, noteId), eq(bookingNotes.bookingId, bookingId)))
      .limit(1)
    return row
  },

  /**
   * Edits a typed note, only by its author and only within its 24 hours
   * (`since`: written after it), with an audit row (ids, never the words).
   * Undefined when it did not qualify by the time of the write.
   */
  editTypedNote(input: {
    bookingId: string
    noteId: string
    sub: string
    body: string
    at: Date
    since: Date
    actorName: string
  }) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(bookingNotes)
        .set({ body: input.body, editedAt: input.at })
        .where(
          and(
            eq(bookingNotes.id, input.noteId),
            eq(bookingNotes.bookingId, input.bookingId),
            eq(bookingNotes.kind, 'typed'),
            eq(bookingNotes.authorSub, input.sub),
            gt(bookingNotes.createdAt, input.since)
          )
        )
        .returning()
      if (!row) return undefined
      await tx.insert(adminAuditLog).values({
        action: 'booking_note_edited',
        actorSub: input.sub,
        actorName: input.actorName,
        summary: { bookingId: input.bookingId, noteId: input.noteId },
        detail: {},
      })
      return row
    })
  },

  /** Deletes a typed note on the same terms, with an audit row (ids only). */
  deleteTypedNote(input: { bookingId: string; noteId: string; sub: string; since: Date; actorName: string }) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .delete(bookingNotes)
        .where(
          and(
            eq(bookingNotes.id, input.noteId),
            eq(bookingNotes.bookingId, input.bookingId),
            eq(bookingNotes.kind, 'typed'),
            eq(bookingNotes.authorSub, input.sub),
            gt(bookingNotes.createdAt, input.since)
          )
        )
        .returning({ id: bookingNotes.id, createdAt: bookingNotes.createdAt })
      if (!row) return undefined
      await tx.insert(adminAuditLog).values({
        action: 'booking_note_deleted',
        actorSub: input.sub,
        actorName: input.actorName,
        summary: { bookingId: input.bookingId, noteId: input.noteId },
        detail: { writtenAt: row.createdAt.toISOString() },
      })
      return row
    })
  },

  /**
   * Marks a whole reschedule chain "Test", or clears the mark, with a note
   * on the booking ops acted on, in one transaction. Only rows whose mark
   * actually changes are written, so marking twice leaves one note. Null
   * when nothing changed.
   */
  setChainTestMark(
    rootBookingId: string,
    mark: { at: Date; by: string } | null,
    note: { bookingId: string; author: string; body: string }
  ) {
    return db.transaction(async (tx) => {
      const changed = await tx
        .update(bookings)
        .set({ markedTestAt: mark?.at ?? null, markedTestBy: mark?.by ?? null })
        .where(
          and(
            sql`coalesce(${bookings.originalBookingId}, ${bookings.id}) = ${rootBookingId}`,
            mark ? isNull(bookings.markedTestAt) : isNotNull(bookings.markedTestAt)
          )
        )
        .returning({ id: bookings.id })
      if (changed.length === 0) return null

      await tx.insert(bookingNotes).values(note)
      return changed
    })
  },

  // ─── Pilot numbers ─────────────────────────────────────────────────────────

  /**
   * Every checkout opened since `since`: one booking intent each. A checkout
   * that became a booking ops marked "Test" is left out, like the booking.
   */
  listIntentsCreatedSince(since: Date) {
    return db
      .select({ status: bookingIntents.status })
      .from(bookingIntents)
      .leftJoin(bookings, eq(bookings.id, bookingIntents.bookingId))
      .where(and(gte(bookingIntents.createdAt, since), isNull(bookings.markedTestAt)))
  },

  /**
   * Every booking whose chain began since `since`, with its payment and
   * garage. A reschedule writes a new row each time it moves the slot, so a
   * chain is windowed on its first booking's created_at — the moved booking
   * keeps the window of the checkout that paid for it, and the whole chain
   * comes back together so lib/pilot-stats.ts can keep only its latest row.
   */
  listBookingsCreatedSince(since: Date) {
    const root = alias(bookings, 'root_booking')
    return db
      .select({
        id: bookings.id,
        rescheduledFromId: bookings.rescheduledFromId,
        vendorId: bookings.vendorId,
        vendorName: vendors.businessName,
        status: bookings.status,
        acceptedBy: bookings.acceptedBy,
        cancelledBy: bookings.cancelledBy,
        cancelledOnBehalfOf: bookings.cancelledOnBehalfOf,
        noShow: bookings.noShow,
        paymentStatus: payments.status,
        // Razorpay's part plus the part paid with Detlio credit (0049), until
        // that went back as credit: the same "collected" as Statistics.
        paymentAmount: sql<string>`(${payments.amount} + case when ${payments.creditReturnedAt} is null then ${payments.creditAmount} else 0 end)::text`,
        paymentRefunded: payments.refundedAmount,
        // Final bills paid in the app on this booking, added up, and what has
        // been refunded of them.
        chargesPaid: sql<string | null>`(
          select sum(${bookingCharges.amountDue})::text
            from ${bookingCharges}
           where ${bookingCharges.bookingId} = ${bookings.id}
             and ${bookingCharges.status} = 'paid'
        )`,
        chargesRefunded: sql<string | null>`(
          select sum(${bookingCharges.refundedAmount})::text
            from ${bookingCharges}
           where ${bookingCharges.bookingId} = ${bookings.id}
             and ${bookingCharges.status} = 'paid'
        )`,
      })
      .from(bookings)
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .leftJoin(root, eq(root.id, bookings.originalBookingId))
      .where(
        and(
          sql`coalesce(${root.createdAt}, ${bookings.createdAt}) >= ${since.toISOString()}::timestamptz`,
          // Bookings ops marked "Test" are not the pilot's (0032).
          isNull(bookings.markedTestAt),
          // Nor is a free redo (0051): the same job again, at ₹0.
          eq(bookings.guaranteeRedo, false)
        )
      )
  },

  /**
   * Every booking a garage accepted since `since`, with what the accept time
   * is measured from. Windowed on the accept itself rather than the booking's
   * creation: the question is how fast garages answer now.
   */
  listAcceptsSince(since: Date) {
    return db
      .select({
        createdAt: bookings.createdAt,
        paidAt: payments.paidAt,
        acceptedAt: bookings.acceptedAt,
      })
      .from(bookings)
      .leftJoin(payments, eq(payments.bookingId, bookings.id))
      .where(and(gte(bookings.acceptedAt, since), isNull(bookings.markedTestAt), eq(bookings.guaranteeRedo, false)))
  },
}
