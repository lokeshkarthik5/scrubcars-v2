import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
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
import {
  bookingCharges,
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

export interface BookingListFilters {
  status?: BookingStatus
  vendorId?: string
  search: BookingSearch | null
  /** Scheduled at or after. */
  start: Date | null
  /** Scheduled before. */
  end: Date | null
  /** Marked "Test" only, or every booking but those. */
  test?: 'only' | 'hide'
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
  listVendors() {
    return db.query.vendors.findMany({
      with: {
        owner: true,
        // Only ids of active services — the service layer derives a count.
        // Packages share this table, so they are excluded to keep the count a
        // count of services.
        services: {
          columns: { id: true },
          where: and(eq(services.isActive, true), ne(services.category, 'package')),
        },
      },
      orderBy: [desc(vendors.createdAt)],
    })
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

  /** Every booking the garage has ever had, in any state. */
  async countBookingsForVendor(vendorId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(bookings)
      .where(eq(bookings.vendorId, vendorId))
    return row?.value ?? 0
  },

  // Hard delete. FK cascades remove the vendor's services, photos, working
  // hours, service areas, bookings, payments and reviews. The owner user row
  // is preserved. Refused by the service for any garage with bookings.
  deleteVendor(id: string) {
    return db.delete(vendors).where(eq(vendors.id, id)).returning()
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

  // Active service ids for a vendor, used to reconcile the admin edit payload.
  // Packages MUST stay out: the admin editor never sends them, so including
  // them here would make every save deactivate all of the vendor's packages.
  async listActiveServiceIds(vendorId: string): Promise<string[]> {
    const rows = await db.query.services.findMany({
      columns: { id: true },
      where: and(
        eq(services.vendorId, vendorId),
        eq(services.isActive, true),
        ne(services.category, 'package')
      ),
    })
    return rows.map((r) => r.id)
  },

  updateService(id: string, data: Partial<ServiceInsert>) {
    return db.update(services).set(data).where(eq(services.id, id)).returning()
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
    const conditions: SQL[] = []

    if (filters.status) conditions.push(eq(bookings.status, filters.status))
    if (filters.vendorId) conditions.push(eq(bookings.vendorId, filters.vendorId))
    if (filters.start) conditions.push(gte(bookings.scheduledAt, filters.start))
    if (filters.end) conditions.push(lt(bookings.scheduledAt, filters.end))
    if (filters.test === 'only') conditions.push(isNotNull(bookings.markedTestAt))
    if (filters.test === 'hide') conditions.push(isNull(bookings.markedTestAt))
    // A row comparison in the same order as the ORDER BY below, so "after the
    // cursor" means exactly "further down the list".
    if (filters.after) {
      conditions.push(
        sql`(${bookings.scheduledAt}, ${bookings.id}) < (${filters.after.scheduledAt.toISOString()}::timestamptz, ${filters.after.id}::uuid)`
      )
    }

    if (filters.search) {
      const { text, idPrefix, phoneDigits, receiptNumber } = filters.search
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
      conditions.push(or(...matches)!)
    }

    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId))
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bookings.scheduledAt), desc(bookings.id))
      .limit(filters.limit)
      .offset(filters.offset)

    return rows.map((row) => row.id)
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
      },
    })
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
      await tx
        .update(bookingCharges)
        .set({ status: 'cancelled', updatedAt: change.at })
        .where(and(eq(bookingCharges.bookingId, bookingId), eq(bookingCharges.status, 'due')))

      return cancelled
    })
  },

  createBookingNote(data: { bookingId: string; author: string; body: string }) {
    return db.insert(bookingNotes).values(data).returning()
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
        paymentAmount: payments.amount,
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
          isNull(bookings.markedTestAt)
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
      .where(and(gte(bookings.acceptedAt, since), isNull(bookings.markedTestAt)))
  },
}
