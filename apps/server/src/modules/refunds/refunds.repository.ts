import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, not, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  bookingCharges,
  bookingIntents,
  bookingNotes,
  bookings,
  payments,
  refundRecords,
  users,
  vendors,
} from '../../db/schema.js'

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
      or(isNull(bookings.noShow), ne(bookings.noShow, 'customer'))
    )
  )
)

const CUSTOMER_AND_GARAGE = {
  customerName: users.name,
  customerPhone: users.phone,
  garageName: vendors.businessName,
}

function bookingPaymentRows(where: SQL | undefined) {
  return db
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
      moved: MOVED,
      ...CUSTOMER_AND_GARAGE,
    })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
    .where(where)
}

function checkoutRows(where: SQL | undefined) {
  return db
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

function billRows(where: SQL | undefined) {
  return db
    .select({
      chargeId: bookingCharges.id,
      bookingId: bookingCharges.bookingId,
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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
  })
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

  async findBookingPayment(bookingId: string) {
    const [row] = await bookingPaymentRows(eq(bookings.id, bookingId))
    return row ?? null
  },

  async findCheckout(intentId: string) {
    const [row] = await checkoutRows(eq(bookingIntents.id, intentId))
    return row ?? null
  },

  async findBill(chargeId: string) {
    const [row] = await billRows(eq(bookingCharges.id, chargeId))
    return row ?? null
  },

  /**
   * Where a Razorpay refund id is already recorded, if anywhere, among every
   * refund ever recorded (a row's own refund_ref only holds its latest). A
   * refund id belongs to one refund of one payment; finding it again means
   * it was pasted onto the wrong row. The unique index on it is what holds
   * under a race; this is so the refusal can say where.
   */
  async findRefundRef(refundRef: string) {
    const [row] = await db
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
    note: { author: string; body: string }
  ) {
    return guarded(() => db.transaction(async (tx) => {
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
  recordCheckoutRefund(intentId: string, write: RefundWrite) {
    return guarded(() => db.transaction(async (tx) => {
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
    note: { author: string; body: string }
  ) {
    return guarded(() => db.transaction(async (tx) => {
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
}
