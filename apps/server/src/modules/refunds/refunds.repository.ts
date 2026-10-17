import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, not, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  autoRefundCapDays,
  bookingCharges,
  bookingIntents,
  bookingNotes,
  bookings,
  complaints,
  payments,
  refundRecords,
  users,
  vendors,
} from '../../db/schema.js'
import type { GatewayRefundStatus, RefundKind, RefundSource } from '../../lib/refunds.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Where a query runs: the pool, or the transaction a refund is sent under.
 * The database has a single connection (db/index.ts `max: 1`), so anything
 * read or written while that transaction is open must go through it: a
 * query on `db` would queue behind the transaction it is part of, for ever.
 */
export type Conn = typeof db | Tx

/**
 * A refund that stands: every one but a failed refund through Razorpay,
 * which moved no money (0036). Every reader of the history says this.
 */
export const STANDING_REFUND = sql`${refundRecords.gatewayStatus} IS DISTINCT FROM 'failed'`

/**
 * Whether the customer moved this booking to a new time: some booking was
 * rescheduled from it. Its payment went with the move (see
 * rescheduleBookingWithPayment), so it owes nothing however it reads.
 */
const MOVED = sql<boolean>`exists (
  select 1 from bookings as moved_to where moved_to.rescheduled_from_id = ${bookings.id}
)`

/** Something has been refunded on a row with these refund columns. */
const anyRefunded = (column: AnyPgColumn) => sql`coalesce(${column}, 0) > 0`

/**
 * The SQL below narrows each list to rows that can be owed, so the to-do list
 * never reads the whole payments table. lib/refunds.ts is what decides: the
 * service runs every row through it, and these conditions only have to be no
 * narrower than it. They are the same rules, kept in step by the refunds
 * journey spec (an owed booking shows, a customer no-show does not).
 */
const BOOKING_PAYMENT_MAY_BE_OWED = and(
  eq(bookings.status, 'cancelled'),
  eq(payments.status, 'paid'),
  or(isNull(bookings.noShow), ne(bookings.noShow, 'customer')),
  not(MOVED),
  sql`coalesce(${payments.refundedAmount}, 0) < ${payments.amount}`
)

const CHECKOUT_MAY_BE_OWED = and(
  eq(bookingIntents.status, 'failed'),
  isNotNull(bookingIntents.paymentRef),
  sql`coalesce(${bookingIntents.refundedAmount}, 0) < ${bookingIntents.amount}`
)

const BILL_MAY_BE_OWED = and(
  sql`coalesce(${bookingCharges.refundedAmount}, 0) < ${bookingCharges.amountDue}`,
  or(
    and(eq(bookingCharges.status, 'cancelled'), isNotNull(bookingCharges.gatewayPaymentId)),
    and(
      eq(bookingCharges.status, 'paid'),
      eq(bookings.status, 'cancelled'),
      // Paid extra work goes back on any booking that did not complete, a
      // customer no-show included (lib/refunds.ts isBillRefundable).
      or(isNull(bookings.noShow), ne(bookings.noShow, 'customer'), eq(bookingCharges.kind, 'extra_work'))
    )
  )
)

const CUSTOMER_AND_GARAGE = {
  customerName: users.name,
  customerPhone: users.phone,
  garageName: vendors.businessName,
}

function bookingPaymentRows(where: SQL | undefined, conn: Conn = db) {
  return conn
    .select({
      bookingId: bookings.id,
      status: payments.status,
      amount: payments.amount,
      gatewayTxnId: payments.gatewayTxnId,
      paidAt: payments.paidAt,
      refundedAmount: payments.refundedAmount,
      refundRef: payments.refundRef,
      refundedAt: payments.refundedAt,
      refundedBy: payments.refundedBy,
      refundNote: payments.refundNote,
      bookingStatus: bookings.status,
      noShow: bookings.noShow,
      noShowMarkedAt: bookings.noShowMarkedAt,
      cancelledBy: bookings.cancelledBy,
      cancelledOnBehalfOf: bookings.cancelledOnBehalfOf,
      cancelledAt: bookings.cancelledAt,
      // Cancelled because the garage did not accept in time (0042).
      responseMissedAt: bookings.responseMissedAt,
      moved: MOVED,
      ...CUSTOMER_AND_GARAGE,
    })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
    .where(where)
}

function checkoutRows(where: SQL | undefined, conn: Conn = db) {
  return conn
    .select({
      intentId: bookingIntents.id,
      status: bookingIntents.status,
      amount: bookingIntents.amount,
      paymentRef: bookingIntents.paymentRef,
      failureReason: bookingIntents.failureReason,
      createdAt: bookingIntents.createdAt,
      refundedAmount: bookingIntents.refundedAmount,
      refundRef: bookingIntents.refundRef,
      refundedAt: bookingIntents.refundedAt,
      refundedBy: bookingIntents.refundedBy,
      refundNote: bookingIntents.refundNote,
      ...CUSTOMER_AND_GARAGE,
    })
    .from(bookingIntents)
    .innerJoin(users, eq(users.id, bookingIntents.userId))
    .innerJoin(vendors, eq(vendors.id, bookingIntents.vendorId))
    .where(where)
}

function billRows(where: SQL | undefined, conn: Conn = db) {
  return conn
    .select({
      chargeId: bookingCharges.id,
      bookingId: bookingCharges.bookingId,
      kind: bookingCharges.kind,
      status: bookingCharges.status,
      amountDue: bookingCharges.amountDue,
      gatewayPaymentId: bookingCharges.gatewayPaymentId,
      paidAt: bookingCharges.paidAt,
      updatedAt: bookingCharges.updatedAt,
      refundedAmount: bookingCharges.refundedAmount,
      refundRef: bookingCharges.refundRef,
      refundedAt: bookingCharges.refundedAt,
      refundedBy: bookingCharges.refundedBy,
      refundNote: bookingCharges.refundNote,
      bookingStatus: bookings.status,
      noShow: bookings.noShow,
      noShowMarkedAt: bookings.noShowMarkedAt,
      cancelledAt: bookings.cancelledAt,
      ...CUSTOMER_AND_GARAGE,
    })
    .from(bookingCharges)
    .innerJoin(bookings, eq(bookings.id, bookingCharges.bookingId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
    .where(where)
}

export type BookingPaymentRefundRow = Awaited<ReturnType<typeof bookingPaymentRows>>[number]
export type CheckoutRefundRow = Awaited<ReturnType<typeof checkoutRows>>[number]
export type BillRefundRow = Awaited<ReturnType<typeof billRows>>[number]

/** The figures a refund write sets, worked out by the service. */
export interface RefundWrite {
  /** How it came to be recorded; 'recorded' (ops, by hand) when not said. */
  source?: RefundSource
  /** Where Razorpay says it stands, when the app sent or found it. */
  gatewayStatus?: GatewayRefundStatus | null
  /**
   * What was refunded before this one, as the person recording it saw it:
   * the write is conditional on it.
   */
  expectedRefunded: string
  /** This refund alone. */
  amount: string
  /** The running total after it. */
  refundedAmount: string
  refundRef: string | null
  refundedAt: Date
  refundedBy: string
  refundNote: string | null
}

/**
 * Only from the running total the refund was asked against. Two people
 * recording the same refund at once, or one request sent twice, carry the
 * same total; the first write moves it and the second matches nothing.
 */
const refundedSoFarIs = (column: AnyPgColumn, expected: string) =>
  sql`coalesce(${column}, 0) = ${expected}::numeric`

/**
 * What a refund write came to. `ref_used` is the unique index on
 * refund_records.refund_ref holding: the Razorpay refund id was recorded on
 * another refund between the service's check and this write. `changed` is
 * the money row having moved on since the figures the refund was asked
 * against (or a record from those figures already existing).
 */
export type RefundWriteResult<T> =
  | { kind: 'recorded'; row: T }
  | { kind: 'changed' }
  | { kind: 'ref_used' }

const UNIQUE_VIOLATION = '23505'

/** The unique index a failed write ran into, if that is why it failed. */
function uniqueViolation(error: unknown): string | null {
  const err = error as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } }
  const code = err?.code ?? err?.cause?.code
  if (code !== UNIQUE_VIOLATION) return null
  return err?.constraint_name ?? err?.cause?.constraint_name ?? ''
}

/**
 * Runs a refund write and turns the two unique indexes on refund_records
 * into answers rather than 500s. The whole transaction rolls back with them,
 * so a refused record leaves the money row and the notes as they were.
 */
async function guarded<T>(write: () => Promise<T | null>): Promise<RefundWriteResult<T>> {
  try {
    const row = await write()
    return row ? { kind: 'recorded', row } : { kind: 'changed' }
  } catch (error) {
    const index = uniqueViolation(error)
    if (index === null) throw error
    return index === 'refund_records_refund_ref_key' ? { kind: 'ref_used' } : { kind: 'changed' }
  }
}

/** The history row every refund leaves, written in the same transaction. */
function insertRecord(
  tx: Tx,
  record: { kind: 'booking' | 'checkout' | 'bill'; targetId: string; bookingId: string | null },
  write: RefundWrite
) {
  return tx.insert(refundRecords).values({
    kind: record.kind,
    targetId: record.targetId,
    bookingId: record.bookingId,
    amount: write.amount,
    refundedBefore: write.expectedRefunded,
    refundRef: write.refundRef,
    refundNote: write.refundNote,
    recordedBy: write.refundedBy,
    recordedAt: write.refundedAt,
    source: write.source ?? 'recorded',
    gatewayStatus: write.gatewayStatus ?? null,
  })
}

/** Thrown inside failRefund to roll its transaction back. */
class FiguresMoved extends Error {}

/** A refund record, as the sending and webhook paths read it. */
export type RefundRecordRow = typeof refundRecords.$inferSelect

/**
 * What the money row says about its latest refund after one is taken back:
 * the latest refund still standing, or nothing.
 */
export interface LatestRefund {
  refundRef: string | null
  refundedAt: Date | null
  refundedBy: string | null
  refundNote: string | null
}

export const refundsRepository = {
  /** Everything that may still be owed, of each kind. */
  async listMaybeOwed() {
    const [bookingPayments, checkouts, bills] = await Promise.all([
      bookingPaymentRows(BOOKING_PAYMENT_MAY_BE_OWED),
      checkoutRows(CHECKOUT_MAY_BE_OWED),
      billRows(BILL_MAY_BE_OWED),
    ])
    return { bookingPayments, checkouts, bills }
  },

  /**
   * Everything with a refund recorded on it, newest refund first, at most
   * `limit` of each kind. The done list is history to look things up in,
   * not a to-do list, so it is capped.
   */
  async listRefunded(limit: number) {
    const [bookingPayments, checkouts, bills] = await Promise.all([
      bookingPaymentRows(anyRefunded(payments.refundedAmount))
        .orderBy(desc(payments.refundedAt))
        .limit(limit),
      checkoutRows(anyRefunded(bookingIntents.refundedAmount))
        .orderBy(desc(bookingIntents.refundedAt))
        .limit(limit),
      billRows(anyRefunded(bookingCharges.refundedAmount))
        .orderBy(desc(bookingCharges.refundedAt))
        .limit(limit),
    ])
    return { bookingPayments, checkouts, bills }
  },

  /** A booking's own payment and its bills, for its admin page. */
  async listForBooking(bookingId: string) {
    const [bookingPayments, bills] = await Promise.all([
      bookingPaymentRows(eq(bookings.id, bookingId)),
      billRows(eq(bookingCharges.bookingId, bookingId)),
    ])
    return { bookingPayments, bills }
  },

  async findBookingPayment(bookingId: string, conn: Conn = db) {
    const [row] = await bookingPaymentRows(eq(bookings.id, bookingId), conn)
    return row ?? null
  },

  async findCheckout(intentId: string, conn: Conn = db) {
    const [row] = await checkoutRows(eq(bookingIntents.id, intentId), conn)
    return row ?? null
  },

  async findBill(chargeId: string, conn: Conn = db) {
    const [row] = await billRows(eq(bookingCharges.id, chargeId), conn)
    return row ?? null
  },

  /**
   * Where a Razorpay refund id is already recorded, if anywhere, among every
   * refund ever recorded (a row's own refund_ref only holds its latest). A
   * refund id belongs to one refund of one payment; finding it again means
   * it was pasted onto the wrong row. The unique index on it is what holds
   * under a race; this is so the refusal can say where.
   */
  async findRefundRef(refundRef: string, conn: Conn = db) {
    const [row] = await conn
      .select({ kind: refundRecords.kind, targetId: refundRecords.targetId, bookingId: refundRecords.bookingId })
      .from(refundRecords)
      .where(eq(refundRecords.refundRef, refundRef))
      .limit(1)
    if (!row) return null
    return row.kind === 'checkout'
      ? { kind: 'checkout' as const, id: row.targetId }
      : { kind: row.kind, id: row.bookingId ?? row.targetId }
  },

  /**
   * Records a refund of a booking's payment, with its history row and its
   * booking note, in one transaction: a refund with no note would leave the
   * booking's history short of the money. A full refund also moves the
   * payment to 'refunded'. Nothing is written unless it is 'recorded'.
   */
  recordBookingRefund(
    bookingId: string,
    write: RefundWrite & { full: boolean },
    note: { author: string; body: string },
    conn: Conn = db
  ) {
    return guarded(() => conn.transaction(async (tx) => {
      const [payment] = await tx
        .update(payments)
        .set({
          ...(write.full && { status: 'refunded' as const }),
          refundedAmount: write.refundedAmount,
          refundRef: write.refundRef,
          refundedAt: write.refundedAt,
          refundedBy: write.refundedBy,
          refundNote: write.refundNote,
        })
        .where(
          and(
            eq(payments.bookingId, bookingId),
            eq(payments.status, 'paid'),
            refundedSoFarIs(payments.refundedAmount, write.expectedRefunded)
          )
        )
        .returning()

      if (!payment) return null

      await insertRecord(tx, { kind: 'booking', targetId: bookingId, bookingId }, write)
      await tx.insert(bookingNotes).values({ bookingId, author: note.author, body: note.body })
      return payment
    }))
  },

  /**
   * Records a refund of a failed checkout's payment, with its history row.
   * There is no booking to note it on; the rows and the alert are the
   * record.
   */
  recordCheckoutRefund(intentId: string, write: RefundWrite, conn: Conn = db) {
    return guarded(() => conn.transaction(async (tx) => {
      const [intent] = await tx
        .update(bookingIntents)
        .set({
          refundedAmount: write.refundedAmount,
          refundRef: write.refundRef,
          refundedAt: write.refundedAt,
          refundedBy: write.refundedBy,
          refundNote: write.refundNote,
        })
        .where(
          and(
            eq(bookingIntents.id, intentId),
            eq(bookingIntents.status, 'failed'),
            refundedSoFarIs(bookingIntents.refundedAmount, write.expectedRefunded)
          )
        )
        .returning()

      if (!intent) return null

      await insertRecord(tx, { kind: 'checkout', targetId: intentId, bookingId: null }, write)
      return intent
    }))
  },

  /**
   * Records a refund of money paid on a bill, with its history row and a
   * note on its booking. The bill's status and `updated_at` are left alone: they say what
   * happened to the bill, and when its payment became owed.
   */
  recordBillRefund(
    chargeId: string,
    bookingId: string,
    write: RefundWrite,
    note: { author: string; body: string },
    conn: Conn = db
  ) {
    return guarded(() => conn.transaction(async (tx) => {
      const [charge] = await tx
        .update(bookingCharges)
        .set({
          refundedAmount: write.refundedAmount,
          refundRef: write.refundRef,
          refundedAt: write.refundedAt,
          refundedBy: write.refundedBy,
          refundNote: write.refundNote,
        })
        .where(
          and(
            eq(bookingCharges.id, chargeId),
            inArray(bookingCharges.status, ['paid', 'cancelled']),
            refundedSoFarIs(bookingCharges.refundedAmount, write.expectedRefunded)
          )
        )
        .returning()

      if (!charge) return null

      await insertRecord(tx, { kind: 'bill', targetId: chargeId, bookingId }, write)
      await tx.insert(bookingNotes).values({ bookingId, author: note.author, body: note.body })
      return charge
    }))
  },

  /**
   * What was refunded in a window: every row whose latest refund was
   * recorded at or after `since`, with its running total.
   */
  async listRefundedSince(since: Date) {
    const [onPayments, onCheckouts, onBills] = await Promise.all([
      db
        .select({ refundedAmount: payments.refundedAmount })
        .from(payments)
        .where(gte(payments.refundedAt, since)),
      db
        .select({ refundedAmount: bookingIntents.refundedAmount })
        .from(bookingIntents)
        .where(gte(bookingIntents.refundedAt, since)),
      db
        .select({ refundedAmount: bookingCharges.refundedAmount })
        .from(bookingCharges)
        .where(gte(bookingCharges.refundedAt, since)),
    ])
    return [...onPayments, ...onCheckouts, ...onBills]
  },

  findUserById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id) })
  },

  /**
   * Runs `work` in one transaction holding the refund lock of one Razorpay
   * payment, `pg_advisory_xact_lock('refund:<paymentId>')`: every path that
   * sends, records or takes back a refund of that payment takes it, so a
   * double-tap of Refund now, the automatic mode, the cron and a webhook
   * never work on the same money at once. It is held across the calls to
   * Razorpay, which is the point: the read of Razorpay's refunds, the send
   * and the record are one step.
   *
   * Taken on its own, never alongside the booking-write locks (outside their
   * order, like service media's and complaints'), and first in its
   * transaction: the only lock taken after it is the automatic mode's cap
   * lock (lockAutoRefundCap), then the money row's own row lock at the write.
   *
   * `wait: false` (the button, the automatic mode) answers `busy` at once
   * when someone else holds it; `wait: true` (a webhook, which Razorpay
   * retries anyway) waits up to 20 seconds.
   */
  async withRefundLock<T>(
    paymentKey: string,
    options: { wait: boolean },
    work: (tx: Tx) => Promise<T>
  ): Promise<{ kind: 'done'; value: T } | { kind: 'busy' }> {
    const key = `refund:${paymentKey}`
    return db.transaction(async (tx) => {
      if (options.wait) {
        await tx.execute(sql`SET LOCAL lock_timeout = '20s'`)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key})::bigint)`)
      } else {
        const rows = await tx.execute<{ locked: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtext(${key})::bigint) as locked`
        )
        if (!Array.from(rows)[0]?.locked) return { kind: 'busy' as const }
      }
      return { kind: 'done' as const, value: await work(tx) }
    })
  },

  /**
   * The automatic mode's own lock, taken after a payment's refund lock and
   * only by an automatic refund: it serialises every automatic refund, so
   * two at once can't both fit under the day's cap.
   */
  async lockAutoRefundCap(tx: Tx) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('auto-refunds:cap')::bigint)`)
  },

  /** Which of these Razorpay refund ids are recorded on any refund. */
  async findRecordedRefs(refs: string[], conn: Conn = db): Promise<Set<string>> {
    if (refs.length === 0) return new Set()
    const rows = await conn
      .select({ refundRef: refundRecords.refundRef })
      .from(refundRecords)
      .where(inArray(refundRecords.refundRef, refs))
    return new Set(rows.flatMap((row) => (row.refundRef ? [row.refundRef] : [])))
  },

  /** The record of a Razorpay refund id, whatever its state. */
  async findRecordByRef(refundRef: string, conn: Conn = db): Promise<RefundRecordRow | null> {
    const [row] = await conn.select().from(refundRecords).where(eq(refundRecords.refundRef, refundRef)).limit(1)
    return row ?? null
  },

  /**
   * The app's own refunds of one piece of money still pending at Razorpay,
   * whose outcome a sync can settle when a webhook was missed.
   */
  listPendingForTarget(kind: RefundKind, targetId: string, conn: Conn = db) {
    return conn
      .select()
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.kind, kind),
          eq(refundRecords.targetId, targetId),
          eq(refundRecords.gatewayStatus, 'pending')
        )
      )
  },

  /** How many sends through Razorpay of this money have failed. */
  async countFailedAttempts(kind: RefundKind, targetId: string, conn: Conn = db): Promise<number> {
    const [row] = await conn
      .select({ count: sql<number>`count(*)::int` })
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.kind, kind),
          eq(refundRecords.targetId, targetId),
          eq(refundRecords.gatewayStatus, 'failed')
        )
      )
    return row?.count ?? 0
  },

  /** Whether the booking has a complaint that is open or acknowledged. */
  async hasOpenComplaint(bookingId: string, conn: Conn = db): Promise<boolean> {
    const [row] = await conn
      .select({ id: complaints.id })
      .from(complaints)
      .where(and(eq(complaints.bookingId, bookingId), inArray(complaints.status, ['open', 'acknowledged'])))
      .limit(1)
    return Boolean(row)
  },

  /** What the automatic mode has sent since `since` and still stands. */
  async autoRefundedSince(since: Date, conn: Conn = db): Promise<string> {
    const [row] = await conn
      .select({ total: sql<string>`coalesce(sum(${refundRecords.amount}), 0)::numeric(10, 2)::text` })
      .from(refundRecords)
      .where(and(eq(refundRecords.source, 'auto'), gte(refundRecords.recordedAt, since), STANDING_REFUND))
    return row?.total ?? '0.00'
  },

  /** Whether the automatic mode's daily cap was reached on this IST day. */
  async capReachedOn(day: string, conn: Conn = db): Promise<boolean> {
    const [row] = await conn
      .select({ day: autoRefundCapDays.day })
      .from(autoRefundCapDays)
      .where(eq(autoRefundCapDays.day, day))
      .limit(1)
    return Boolean(row)
  },

  /**
   * Marks the day's cap reached. True only for the call that wrote the row,
   * which is the one that tells the team.
   */
  async markCapReached(input: { day: string; cap: string; sent: string }, conn: Conn = db): Promise<boolean> {
    const rows = await conn
      .insert(autoRefundCapDays)
      .values({ day: input.day, capAmount: input.cap, sentAmount: input.sent })
      .onConflictDoNothing()
      .returning({ day: autoRefundCapDays.day })
    return rows.length > 0
  },

  /**
   * Records a send Razorpay refused outright, which made no refund: a
   * failed attempt, with no refund id, and the money row left as it was.
   * It is what counts the automatic mode's tries, and the history of what
   * was tried.
   */
  async recordFailedAttempt(
    input: {
      kind: RefundKind
      targetId: string
      bookingId: string | null
      amount: string
      refundedBefore: string
      source: 'admin' | 'auto'
      by: string
      reason: string
      at: Date
    },
    conn: Conn = db
  ) {
    await conn.insert(refundRecords).values({
      kind: input.kind,
      targetId: input.targetId,
      bookingId: input.bookingId,
      amount: input.amount,
      refundedBefore: input.refundedBefore,
      refundRef: null,
      recordedBy: input.by,
      recordedAt: input.at,
      source: input.source,
      gatewayStatus: 'failed',
      settledAt: input.at,
      failureReason: input.reason,
    })
  },

  /**
   * Razorpay says a refund was processed. Only from pending, or from no
   * status (one ops recorded by hand); a failed one stays failed.
   */
  async markProcessed(recordId: string, at: Date, conn: Conn = db) {
    return conn
      .update(refundRecords)
      .set({ gatewayStatus: 'processed', settledAt: at })
      .where(
        and(
          eq(refundRecords.id, recordId),
          or(isNull(refundRecords.gatewayStatus), eq(refundRecords.gatewayStatus, 'pending'))
        )
      )
      .returning({ id: refundRecords.id })
  },

  /**
   * The latest refund of this money that still stands, other than
   * `exceptId`: what the money row describes once a refund is taken back.
   */
  async latestStanding(kind: RefundKind, targetId: string, exceptId: string, conn: Conn = db): Promise<LatestRefund> {
    const [row] = await conn
      .select({
        refundRef: refundRecords.refundRef,
        refundedAt: refundRecords.recordedAt,
        refundedBy: refundRecords.recordedBy,
        refundNote: refundRecords.refundNote,
      })
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.kind, kind),
          eq(refundRecords.targetId, targetId),
          ne(refundRecords.id, exceptId),
          STANDING_REFUND
        )
      )
      .orderBy(desc(refundRecords.recordedAt), desc(refundRecords.id))
      .limit(1)
    return row ?? { refundRef: null, refundedAt: null, refundedBy: null, refundNote: null }
  },

  /**
   * Takes back a refund Razorpay failed: its record becomes failed (kept,
   * with why), the money row's running total drops by it — conditional on
   * the total being what the service read, like every refund write — and
   * its description goes back to the latest refund still standing. A
   * booking's payment that the refund had made 'refunded' is 'paid' again,
   * so it is owed. Leaves a booking note when there is a booking. Nothing
   * is written unless all of it is; null when the record was already failed
   * or the figures moved.
   */
  failRefund(
    record: RefundRecordRow,
    write: {
      expectedRefunded: string
      refundedAmount: string | null
      latest: LatestRefund
      reason: string
      at: Date
    },
    note: { author: string; body: string } | null,
    conn: Conn = db
  ) {
    return conn.transaction(async (tx) => {
      const [failed] = await tx
        .update(refundRecords)
        .set({ gatewayStatus: 'failed', settledAt: write.at, failureReason: write.reason })
        .where(and(eq(refundRecords.id, record.id), STANDING_REFUND))
        .returning({ id: refundRecords.id })
      if (!failed) return null

      const back = {
        refundedAmount: write.refundedAmount,
        refundRef: write.latest.refundRef,
        refundedAt: write.latest.refundedAt,
        refundedBy: write.latest.refundedBy,
        refundNote: write.latest.refundNote,
      }

      let moved: unknown[]
      switch (record.kind) {
        case 'booking':
          moved = await tx
            .update(payments)
            .set({ ...back, status: 'paid' })
            .where(
              and(
                eq(payments.bookingId, record.targetId),
                inArray(payments.status, ['paid', 'refunded']),
                refundedSoFarIs(payments.refundedAmount, write.expectedRefunded)
              )
            )
            .returning({ id: payments.id })
          break
        case 'checkout':
          moved = await tx
            .update(bookingIntents)
            .set(back)
            .where(
              and(
                eq(bookingIntents.id, record.targetId),
                refundedSoFarIs(bookingIntents.refundedAmount, write.expectedRefunded)
              )
            )
            .returning({ id: bookingIntents.id })
          break
        case 'bill':
          moved = await tx
            .update(bookingCharges)
            .set(back)
            .where(
              and(
                eq(bookingCharges.id, record.targetId),
                refundedSoFarIs(bookingCharges.refundedAmount, write.expectedRefunded)
              )
            )
            .returning({ id: bookingCharges.id })
          break
      }
      // The figures moved under the lock: nothing is taken back, so a
      // person looks rather than the total going wrong.
      if (moved.length === 0) throw new FiguresMoved()

      if (note && record.bookingId) {
        await tx.insert(bookingNotes).values({ bookingId: record.bookingId, author: note.author, body: note.body })
      }
      return failed
    }).catch((error: unknown) => {
      if (error instanceof FiguresMoved) return null
      throw error
    })
  },
}
