import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  bookingCharges,
  bookingIntentItems,
  bookingIntents,
  bookingItems,
  bookingNotes,
  bookingReschedules,
  bookings,
  complaints,
  discountRedemptions,
  jobPhotos,
  payments,
  receiptCounters,
  receiptNumbers,
  receiptNumberVoids,
  refundRecords,
  reviews,
  users,
  vendorPayoutItems,
  vendorPayouts,
  vendors,
} from '../../db/schema.js'
import type {
  BookingChildCounts,
  GatewayModeValue,
  IntentChildCounts,
  ResetBooking,
  ResetCharge,
  ResetComplaint,
  ResetIntent,
  ResetPayout,
  ResetReceipt,
} from '../../lib/data-reset.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

/**
 * Ids per statement. Every list here is bounded by the run's cap, but a
 * statement with thousands of parameters is slow to plan and the single
 * connection waits on it, so long lists go a slice at a time.
 */
const BATCH = 500

function batches<T>(rows: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH))
  return out
}

/** A chain's key: its first booking's id. */
const CHAIN_KEY = sql<string>`coalesce(${bookings.originalBookingId}, ${bookings.id})`

/**
 * A child table's rows per parent id, for these ids (an id with none is
 * absent), grouped on the child's own key column. Not a correlated subquery
 * in a select list: there Drizzle prints the outer column bare ("id"), which
 * inside the subquery is the child's own id, so every count came back 0.
 */
async function countBy(
  conn: Conn,
  key: PgColumn,
  ids: string[],
  also?: SQL
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const slice of batches(ids)) {
    const rows = await conn
      .select({ key: sql<string>`${key}`, n: sql<number>`count(*)::int` })
      .from(key.table)
      .where(and(inArray(key, slice), also))
      .groupBy(key)
    for (const row of rows) out.set(row.key, row.n)
  }
  return out
}

/**
 * Reads, through the given connection: the plain one, or the delete's
 * transaction. Exported for deleting a garage forever (modules/vendor-bin),
 * which plans its bookings with these same reads inside its own transaction.
 */
export function dataResetReads(conn: Conn) {
  return {
    /** The chains a scope names, by their first booking's id. */
    async chainKeys(where: SQL): Promise<string[]> {
      const rows = await conn
        .selectDistinct({ key: CHAIN_KEY })
        .from(bookings)
        .where(where)
      return rows.map((row) => row.key)
    },

    chainKeysCreatedBefore(cutoff: Date) {
      return this.chainKeys(lt(bookings.createdAt, cutoff))
    },

    chainKeysMarkedTest() {
      return this.chainKeys(isNotNull(bookings.markedTestAt))
    },

    chainKeysOfBookings(ids: string[]) {
      return this.chainKeys(inArray(bookings.id, ids))
    },

    /** Every chain at one garage, whenever made. */
    chainKeysOfGarage(vendorId: string) {
      return this.chainKeys(eq(bookings.vendorId, vendorId))
    },

    /** Every booking of these chains, with its payment, customer and garage. */
    async chainBookings(keys: string[]): Promise<ResetBooking[]> {
      const out: ResetBooking[] = []
      for (const slice of batches(keys)) {
        const rows = await conn
          .select({
            id: bookings.id,
            originalBookingId: bookings.originalBookingId,
            status: bookings.status,
            paymentMethod: bookings.paymentMethod,
            createdAt: bookings.createdAt,
            scheduledAt: bookings.scheduledAt,
            cancelledAt: bookings.cancelledAt,
            markedTestAt: bookings.markedTestAt,
            amount: bookings.amount,
            vendorId: bookings.vendorId,
            garageName: vendors.businessName,
            userId: bookings.userId,
            customerName: users.name,
            customerPhone: users.phone,
            paymentStatus: payments.status,
            paymentTxnId: payments.gatewayTxnId,
            paymentMode: payments.gatewayMode,
            paymentAmount: payments.amount,
            paymentRefunded: payments.refundedAmount,
          })
          .from(bookings)
          .innerJoin(users, eq(users.id, bookings.userId))
          .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
          .leftJoin(payments, eq(payments.bookingId, bookings.id))
          .where(or(inArray(bookings.id, slice), inArray(bookings.originalBookingId, slice)))
        for (const row of rows) {
          out.push({
            id: row.id,
            originalBookingId: row.originalBookingId,
            status: row.status,
            paymentMethod: row.paymentMethod,
            createdAt: row.createdAt,
            scheduledAt: row.scheduledAt,
            cancelledAt: row.cancelledAt,
            markedTestAt: row.markedTestAt,
            amount: row.amount,
            vendorId: row.vendorId,
            garageName: row.garageName,
            userId: row.userId,
            customerName: row.customerName,
            customerPhone: row.customerPhone,
            payment:
              row.paymentStatus === null
                ? null
                : {
                    status: row.paymentStatus,
                    gatewayTxnId: row.paymentTxnId,
                    gatewayMode: row.paymentMode as GatewayModeValue | null,
                    amount: row.paymentAmount ?? '0.00',
                    refundedAmount: row.paymentRefunded,
                  },
          })
        }
      }
      return out
    },

    async charges(bookingIds: string[]): Promise<ResetCharge[]> {
      const out: ResetCharge[] = []
      for (const slice of batches(bookingIds)) {
        const rows = await conn
          .select({
            id: bookingCharges.id,
            bookingId: bookingCharges.bookingId,
            status: bookingCharges.status,
            amountDue: bookingCharges.amountDue,
            gatewayOrderId: bookingCharges.gatewayOrderId,
            gatewayPaymentId: bookingCharges.gatewayPaymentId,
            gatewayMode: bookingCharges.gatewayMode,
            refundedAmount: bookingCharges.refundedAmount,
            updatedAt: bookingCharges.updatedAt,
          })
          .from(bookingCharges)
          .where(inArray(bookingCharges.bookingId, slice))
        out.push(...(rows as ResetCharge[]))
      }
      return out
    },

    /** Checkouts: those of these bookings, or those with these ids. */
    async intents(where: SQL): Promise<ResetIntent[]> {
      const rows = await conn
        .select({
          id: bookingIntents.id,
          bookingId: bookingIntents.bookingId,
          status: bookingIntents.status,
          createdAt: bookingIntents.createdAt,
          expiresAt: bookingIntents.expiresAt,
          amount: bookingIntents.amount,
          gatewayTxnId: bookingIntents.gatewayTxnId,
          paymentRef: bookingIntents.paymentRef,
          gatewayMode: bookingIntents.gatewayMode,
          refundedAmount: bookingIntents.refundedAmount,
          userId: bookingIntents.userId,
          customerName: users.name,
          garageName: vendors.businessName,
        })
        .from(bookingIntents)
        .innerJoin(users, eq(users.id, bookingIntents.userId))
        .innerJoin(vendors, eq(vendors.id, bookingIntents.vendorId))
        .where(where)
      return rows as ResetIntent[]
    },

    async intentsOfBookings(bookingIds: string[]): Promise<ResetIntent[]> {
      const out: ResetIntent[] = []
      for (const slice of batches(bookingIds)) {
        out.push(...(await this.intents(inArray(bookingIntents.bookingId, slice))))
      }
      return out
    },

    /** Checkouts that never became a booking (or whose booking is gone), opened before the cutoff. */
    checkoutsWithoutBooking(cutoff: Date) {
      return this.intents(and(isNull(bookingIntents.bookingId), lt(bookingIntents.createdAt, cutoff))!)
    },

    /** Checkouts at one garage that never became a booking (or whose booking is gone). */
    checkoutsWithoutBookingAt(vendorId: string) {
      return this.intents(and(isNull(bookingIntents.bookingId), eq(bookingIntents.vendorId, vendorId))!)
    },

    async bookingChildCounts(bookingIds: string[]): Promise<Map<string, BookingChildCounts>> {
      const items = await countBy(conn, bookingItems.bookingId, bookingIds)
      const notes = await countBy(conn, bookingNotes.bookingId, bookingIds)
      const photos = await countBy(conn, jobPhotos.bookingId, bookingIds)
      const reviewRows = await countBy(conn, reviews.bookingId, bookingIds)
      const promoUses = await countBy(conn, discountRedemptions.bookingId, bookingIds)
      // Booking and bill refunds: a checkout's carries no booking_id.
      const refunds = await countBy(conn, refundRecords.bookingId, bookingIds)
      return new Map(
        bookingIds.map((id) => [
          id,
          {
            items: items.get(id) ?? 0,
            notes: notes.get(id) ?? 0,
            photos: photos.get(id) ?? 0,
            reviews: reviewRows.get(id) ?? 0,
            promoUses: promoUses.get(id) ?? 0,
            refundRecords: refunds.get(id) ?? 0,
          },
        ])
      )
    },

    /** booking_reschedules rows by chain (each names its chain's first booking). */
    async reschedulesByChain(keys: string[]): Promise<Map<string, number>> {
      const out = new Map<string, number>()
      for (const slice of batches(keys)) {
        const rows = await conn
          .select({
            key: bookingReschedules.originalBookingId,
            n: sql<number>`count(*)::int`,
          })
          .from(bookingReschedules)
          .where(inArray(bookingReschedules.originalBookingId, slice))
          .groupBy(bookingReschedules.originalBookingId)
        for (const row of rows) out.set(row.key, row.n)
      }
      return out
    },

    async intentChildCounts(intentIds: string[]): Promise<Map<string, IntentChildCounts>> {
      const items = await countBy(conn, bookingIntentItems.intentId, intentIds)
      const refunds = await countBy(
        conn,
        refundRecords.targetId,
        intentIds,
        eq(refundRecords.kind, 'checkout')
      )
      return new Map(
        intentIds.map((id) => [
          id,
          { items: items.get(id) ?? 0, refundRecords: refunds.get(id) ?? 0 },
        ])
      )
    },

    async receipts(keys: string[]): Promise<ResetReceipt[]> {
      const out: ResetReceipt[] = []
      for (const slice of batches(keys)) {
        out.push(
          ...(await conn
            .select({
              rootBookingId: receiptNumbers.rootBookingId,
              financialYear: receiptNumbers.financialYear,
              seq: receiptNumbers.seq,
              number: receiptNumbers.number,
              issuedAt: receiptNumbers.issuedAt,
            })
            .from(receiptNumbers)
            .where(inArray(receiptNumbers.rootBookingId, slice)))
        )
      }
      return out
    },

    /** Every receipt number in these financial years. */
    yearReceipts(years: string[]) {
      if (years.length === 0) return Promise.resolve([])
      return conn
        .select({
          financialYear: receiptNumbers.financialYear,
          rootBookingId: receiptNumbers.rootBookingId,
        })
        .from(receiptNumbers)
        .where(inArray(receiptNumbers.financialYear, years))
    },

    /**
     * Chains whose receipt is available but has no number: the same rule as
     * receiptAvailability (a payment that went through, on a booking that
     * was not moved), dated as receiptIssuedAt dates it.
     */
    async unnumberedReceipts(): Promise<Array<{ rootBookingId: string; issuedAt: Date }>> {
      const rows = await conn.execute<{ root_booking_id: string; issued_at: string | Date }>(sql`
        select coalesce(b.original_booking_id, b.id) as root_booking_id,
               coalesce(p.paid_at, p.created_at) as issued_at
          from bookings b
          join payments p on p.booking_id = b.id
         where p.status in ('paid', 'collected', 'refunded')
           and b.status <> 'rescheduled'
           and not exists (select 1 from bookings moved_to where moved_to.rescheduled_from_id = b.id)
           and not exists (
             select 1 from receipt_numbers rn
              where rn.root_booking_id = coalesce(b.original_booking_id, b.id)
           )
      `)
      return rows.map((row) => ({
        rootBookingId: row.root_booking_id,
        issuedAt: new Date(row.issued_at),
      }))
    },

    async counters(years: string[]): Promise<Map<string, number>> {
      if (years.length === 0) return new Map()
      const rows = await conn
        .select({ financialYear: receiptCounters.financialYear, lastSeq: receiptCounters.lastSeq })
        .from(receiptCounters)
        .where(inArray(receiptCounters.financialYear, years))
      return new Map(rows.map((row) => [row.financialYear, row.lastSeq]))
    },

    /** Customer complaints made before the cutoff (0035), oldest first. */
    async complaintsMadeBefore(cutoff: Date): Promise<ResetComplaint[]> {
      return conn
        .select({ id: complaints.id, number: complaints.number, createdAt: complaints.createdAt })
        .from(complaints)
        .where(lt(complaints.createdAt, cutoff))
        .orderBy(asc(complaints.number))
    },

    /**
     * Garage payouts (0038) that paid any of these chains, each with every
     * chain it paid, in scope or not: the planner keeps a payout's chains
     * together.
     */
    async payoutsOfChains(keys: string[]): Promise<ResetPayout[]> {
      const ids = new Set<string>()
      for (const slice of batches(keys)) {
        const rows = await conn
          .selectDistinct({ id: vendorPayoutItems.payoutId })
          .from(vendorPayoutItems)
          .where(inArray(vendorPayoutItems.bookingId, slice))
        for (const row of rows) ids.add(row.id)
      }
      if (ids.size === 0) return []
      const out = new Map<string, ResetPayout>()
      for (const slice of batches([...ids])) {
        const rows = await conn
          .select({
            id: vendorPayouts.id,
            recordedAt: vendorPayouts.createdAt,
            root: vendorPayoutItems.bookingId,
          })
          .from(vendorPayouts)
          .innerJoin(vendorPayoutItems, eq(vendorPayoutItems.payoutId, vendorPayouts.id))
          .where(inArray(vendorPayouts.id, slice))
        for (const row of rows) {
          const payout = out.get(row.id) ?? { id: row.id, recordedAt: row.recordedAt, rootBookingIds: [] }
          payout.rootBookingIds.push(row.root)
          out.set(row.id, payout)
        }
      }
      return [...out.values()]
    },

    async voidsByYear(years: string[]): Promise<Map<string, number>> {
      if (years.length === 0) return new Map()
      const rows = await conn
        .select({
          financialYear: receiptNumberVoids.financialYear,
          n: sql<number>`count(*)::int`,
        })
        .from(receiptNumberVoids)
        .where(inArray(receiptNumberVoids.financialYear, years))
        .groupBy(receiptNumberVoids.financialYear)
      return new Map(rows.map((row) => [row.financialYear, row.n]))
    },
  }
}

export type DataResetReads = ReturnType<typeof dataResetReads>

/** A row the reset deletes is written down here first, in the same transaction. */
export interface AuditEntry {
  action: string
  actorSub: string
  actorName: string
  summary: unknown
  detail: unknown
}

/**
 * The delete's own statements, inside its transaction. Each one is a single
 * step of the order in data-reset.service (executeReset); none decides
 * anything. Exported for deleting a garage forever, like the reads.
 */
export function dataResetWrites(tx: Tx) {
  return {
    /**
     * Waits for a row lock at most 5 seconds, and lets no statement run past
     * a minute, for this transaction only. A busy row (a payment settling at
     * that moment) makes the whole run give up and roll back rather than
     * queue every checkout behind it.
     */
    async limitWaits() {
      await tx.execute(sql`set local lock_timeout = '5s'`)
      await tx.execute(sql`set local statement_timeout = '60s'`)
    },

    /** Checkout rows, FOR UPDATE, in id order: consumeIntent locks its intent first of all. */
    async lockIntents(ids: string[]) {
      for (const slice of batches([...ids].sort())) {
        await tx
          .select({ id: bookingIntents.id })
          .from(bookingIntents)
          .where(inArray(bookingIntents.id, slice))
          .orderBy(asc(bookingIntents.id))
          .for('update')
      }
    },

    /**
     * Booking rows, FOR UPDATE, in id order: step 3 of the lock order (the
     * booking's own row). A reschedule or a payment on one of them waits for
     * the run, or the run waits for it, never both.
     */
    async lockBookings(ids: string[]) {
      for (const slice of batches([...ids].sort())) {
        await tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(inArray(bookings.id, slice))
          .orderBy(asc(bookings.id))
          .for('update')
      }
    },

    async insertAudit(entry: AuditEntry) {
      const [row] = await tx
        .insert(adminAuditLog)
        .values({
          action: entry.action,
          actorSub: entry.actorSub,
          actorName: entry.actorName,
          summary: entry.summary,
          detail: entry.detail,
        })
        .returning({ id: adminAuditLog.id, createdAt: adminAuditLog.createdAt })
      return row
    },

    /** Copies these chains' numbers in a year into the voids, before they are deleted. */
    async voidReceipts(rootIds: string[], financialYear: string, auditId: string, reason: string) {
      for (const slice of batches(rootIds)) {
        await tx.execute(sql`
          insert into receipt_number_voids
            (financial_year, seq, number, issued_at, root_booking_id, reason, audit_id)
          select financial_year, seq, number, issued_at, root_booking_id, ${reason}, ${auditId}::uuid
            from receipt_numbers
           where financial_year = ${financialYear}
             and root_booking_id in (${sql.join(slice.map((id) => sql`${id}::uuid`), sql`, `)})
        `)
      }
    },

    async deleteReceipts(rootIds: string[]) {
      for (const slice of batches(rootIds)) {
        await tx.delete(receiptNumbers).where(inArray(receiptNumbers.rootBookingId, slice))
      }
    },

    async deleteVoids(financialYear: string) {
      await tx.delete(receiptNumberVoids).where(eq(receiptNumberVoids.financialYear, financialYear))
    },

    /** Checkout refunds: they point at their checkout with no foreign key. */
    async deleteCheckoutRefunds(intentIds: string[]) {
      for (const slice of batches(intentIds)) {
        await tx
          .delete(refundRecords)
          .where(and(eq(refundRecords.kind, 'checkout'), inArray(refundRecords.targetId, slice)))
      }
    },

    async photoKeys(bookingIds: string[]): Promise<string[]> {
      const keys: string[] = []
      for (const slice of batches(bookingIds)) {
        const rows = await tx
          .select({ key: jobPhotos.storageKey })
          .from(jobPhotos)
          .where(inArray(jobPhotos.bookingId, slice))
        keys.push(...rows.map((row) => row.key))
      }
      return keys
    },

    /** Checkouts, and their items with them (ON DELETE CASCADE). */
    async deleteIntents(ids: string[]) {
      let n = 0
      for (const slice of batches(ids)) {
        const rows = await tx
          .delete(bookingIntents)
          .where(inArray(bookingIntents.id, slice))
          .returning({ id: bookingIntents.id })
        n += rows.length
      }
      return n
    },

    /**
     * Bookings, and everything that cascades with them: items, payment,
     * notes, photos, final bills, reschedules, promo uses, booking and bill
     * refunds, reviews.
     */
    /** Complaints by id. Nothing hangs off one. */
    async deleteComplaints(ids: string[]) {
      let n = 0
      for (const slice of batches(ids)) {
        const rows = await tx
          .delete(complaints)
          .where(inArray(complaints.id, slice))
          .returning({ id: complaints.id })
        n += rows.length
      }
      return n
    },

    /**
     * Garage payouts, with their items (ON DELETE CASCADE). Before the
     * bookings: an item names its booking ON DELETE RESTRICT.
     */
    async deletePayouts(ids: string[]) {
      let n = 0
      for (const slice of batches(ids)) {
        const rows = await tx
          .delete(vendorPayouts)
          .where(inArray(vendorPayouts.id, slice))
          .returning({ id: vendorPayouts.id })
        n += rows.length
      }
      return n
    },

    async deleteBookings(ids: string[]) {
      let n = 0
      for (const slice of batches(ids)) {
        const rows = await tx
          .delete(bookings)
          .where(inArray(bookings.id, slice))
          .returning({ id: bookings.id })
        n += rows.length
      }
      return n
    },

    /**
     * The years' receipt counters, FOR UPDATE, last of all (step 7 of the
     * lock order). Held from here to the commit, so no payment can number a
     * receipt in these years while the restart finishes.
     */
    async lockCounters(years: string[]) {
      if (years.length === 0) return
      await tx
        .select({ financialYear: receiptCounters.financialYear })
        .from(receiptCounters)
        .where(inArray(receiptCounters.financialYear, years))
        .orderBy(asc(receiptCounters.financialYear))
        .for('update')
    },

    async countReceiptsIn(years: string[]): Promise<number> {
      if (years.length === 0) return 0
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(receiptNumbers)
        .where(inArray(receiptNumbers.financialYear, years))
      return row?.n ?? 0
    },

    async deleteCounters(years: string[]) {
      if (years.length === 0) return
      await tx.delete(receiptCounters).where(inArray(receiptCounters.financialYear, years))
    },
  }
}

export type DataResetWrites = ReturnType<typeof dataResetWrites>

export const dataResetRepository = {
  ...dataResetReads(db),

  /**
   * Remembers what Razorpay said about old money (gateway_mode was null), on
   * every row that carries the id, so no later dry run asks again. Only
   * where it is still null: a mode recorded when the order was opened is
   * never overwritten.
   */
  async saveGatewayModes(answers: Array<{ id: string; mode: 'live' | 'test' }>) {
    for (const { id, mode } of answers) {
      await db
        .update(payments)
        .set({ gatewayMode: mode })
        .where(and(eq(payments.gatewayTxnId, id), isNull(payments.gatewayMode)))
      await db
        .update(bookingCharges)
        .set({ gatewayMode: mode })
        .where(
          and(
            or(eq(bookingCharges.gatewayPaymentId, id), eq(bookingCharges.gatewayOrderId, id)),
            isNull(bookingCharges.gatewayMode)
          )
        )
      await db
        .update(bookingIntents)
        .set({ gatewayMode: mode })
        .where(
          and(
            or(eq(bookingIntents.paymentRef, id), eq(bookingIntents.gatewayTxnId, id)),
            isNull(bookingIntents.gatewayMode)
          )
        )
    }
  },

  /**
   * Runs the delete in one transaction, handing it the reads and writes
   * bound to that transaction. Everything rolls back together on any throw.
   */
  transaction<T>(work: (repo: DataResetReads & DataResetWrites) => Promise<T>): Promise<T> {
    return db.transaction((tx) => work({ ...dataResetReads(tx), ...dataResetWrites(tx) }))
  },
}
