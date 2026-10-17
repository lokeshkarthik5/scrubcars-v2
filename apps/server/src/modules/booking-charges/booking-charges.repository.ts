import { and, asc, eq, isNull, like, ne } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookingCharges,
  bookingItems,
  bookingNotes,
  bookings,
  type GatewayMode,
} from '../../db/schema.js'
import { escapeLike } from '../../lib/search.js'

export type BookingChargeRecord = typeof bookingCharges.$inferSelect
type BookingChargeInsert = typeof bookingCharges.$inferInsert

/** What replaceFinalBill did. */
export type ReplaceFinalBillResult =
  | { kind: 'raised'; charge: BookingChargeRecord; replaced: BookingChargeRecord | null }
  /** The live bill is paid, and a paid bill is never replaced. */
  | { kind: 'locked' }
  /** Someone else raised one at the same moment; the unique index held. */
  | { kind: 'conflict' }

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { cause?: { code?: string } })?.cause?.code
  return code === UNIQUE_VIOLATION
}

export const bookingChargesRepository = {
  /**
   * A booking with what billing it needs: whose it is, its payment, its
   * services' pricing types, and the names an ops alert quotes.
   */
  findBooking(bookingId: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        user: true,
        vendor: true,
        service: true,
        items: {
          orderBy: [asc(bookingItems.sortOrder)],
          with: { service: { columns: { pricingType: true } } },
        },
        payment: true,
      },
    })
  },

  /** The bill that stands on a booking, if any. */
  findLiveFinalBill(bookingId: string) {
    return db.query.bookingCharges.findFirst({
      where: and(
        eq(bookingCharges.bookingId, bookingId),
        eq(bookingCharges.kind, 'final_bill'),
        ne(bookingCharges.status, 'cancelled')
      ),
    })
  },

  findCharge(chargeId: string) {
    return db.query.bookingCharges.findFirst({
      where: eq(bookingCharges.id, chargeId),
    })
  },

  /** The bill a Razorpay order was opened for. The order id is unique. */
  findChargeByOrderId(orderId: string) {
    return db.query.bookingCharges.findFirst({
      where: eq(bookingCharges.gatewayOrderId, orderId),
    })
  },

  /**
   * Writes a new final bill, cancelling the unpaid one it replaces, in one
   * transaction. The live row is locked first, so a payment settling it at
   * the same moment either lands before (and the bill is locked) or finds it
   * cancelled after.
   */
  replaceFinalBill(insert: Omit<BookingChargeInsert, 'kind'>): Promise<ReplaceFinalBillResult> {
    return db
      .transaction(async (tx): Promise<ReplaceFinalBillResult> => {
        const [live] = await tx
          .select()
          .from(bookingCharges)
          .where(
            and(
              eq(bookingCharges.bookingId, insert.bookingId),
              eq(bookingCharges.kind, 'final_bill'),
              ne(bookingCharges.status, 'cancelled')
            )
          )
          .for('update')

        if (live?.status === 'paid') return { kind: 'locked' }

        let replaced: BookingChargeRecord | null = null
        if (live) {
          ;[replaced] = await tx
            .update(bookingCharges)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(bookingCharges.id, live.id))
            .returning()
        }

        const [charge] = await tx
          .insert(bookingCharges)
          .values({ ...insert, kind: 'final_bill' })
          .returning()

        return { kind: 'raised', charge, replaced }
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) return { kind: 'conflict' as const }
        throw error
      })
  },

  /**
   * Remembers the Razorpay order opened for a bill, only while it is still due
   * and has none — of two taps that both opened an order, the first one is
   * kept and the other is never used. Empty when that did not hold.
   */
  setGatewayOrderId(chargeId: string, orderId: string, gatewayMode: GatewayMode) {
    return db
      .update(bookingCharges)
      // With the order's Razorpay mode (0032), for the test-data reset.
      .set({ gatewayOrderId: orderId, gatewayMode, updatedAt: new Date() })
      .where(
        and(
          eq(bookingCharges.id, chargeId),
          eq(bookingCharges.status, 'due'),
          isNull(bookingCharges.gatewayOrderId)
        )
      )
      .returning()
  },

  /**
   * Marks a bill paid, only from 'due' and only for its own order. Of the
   * browser's verify and the webhook, whichever lands second writes nothing
   * and gets an empty result.
   */
  settleCharge(params: { chargeId: string; orderId: string; paymentId: string; paidAt: Date }) {
    return db
      .update(bookingCharges)
      .set({
        status: 'paid',
        gatewayPaymentId: params.paymentId,
        paidAt: params.paidAt,
        updatedAt: params.paidAt,
      })
      .where(
        and(
          eq(bookingCharges.id, params.chargeId),
          eq(bookingCharges.status, 'due'),
          eq(bookingCharges.gatewayOrderId, params.orderId)
        )
      )
      .returning()
  },

  /**
   * A payment that landed for a bill the garage had already replaced: the
   * money was taken for a bill that no longer stands. The payment id goes on
   * the cancelled row (it stays cancelled) and an internal note tells ops to
   * refund it. Conditional on no payment being recorded there yet, so of the
   * verify call and the webhook only one writes the note. True for that one.
   */
  recordPaymentOnReplacedBill(params: {
    chargeId: string
    bookingId: string
    paymentId: string
    note: { author: string; body: string }
  }) {
    return db.transaction(async (tx) => {
      const [recorded] = await tx
        .update(bookingCharges)
        .set({ gatewayPaymentId: params.paymentId, updatedAt: new Date() })
        .where(
          and(
            eq(bookingCharges.id, params.chargeId),
            eq(bookingCharges.status, 'cancelled'),
            isNull(bookingCharges.gatewayPaymentId)
          )
        )
        .returning()

      if (!recorded) return false

      await tx.insert(bookingNotes).values({
        bookingId: params.bookingId,
        author: params.note.author,
        body: params.note.body,
      })
      return true
    })
  },

  /**
   * A second payment that landed for a bill already paid by another. The bill
   * stays as it is; an internal note tells ops to refund this one. The bill's
   * row is locked first, so of the verify call and the webhook arriving
   * together one writes the note and the other finds it. True for the one
   * that wrote it.
   */
  recordSecondPayment(params: {
    chargeId: string
    bookingId: string
    paymentId: string
    note: { author: string; body: string }
  }) {
    return db.transaction(async (tx) => {
      await tx
        .select({ id: bookingCharges.id })
        .from(bookingCharges)
        .where(eq(bookingCharges.id, params.chargeId))
        .for('update')

      const [noted] = await tx
        .select({ id: bookingNotes.id })
        .from(bookingNotes)
        .where(
          and(
            eq(bookingNotes.bookingId, params.bookingId),
            // Razorpay ids hold an underscore (pay_…), a LIKE wildcard.
            like(bookingNotes.body, `Payment ${escapeLike(params.paymentId)} %`)
          )
        )
        .limit(1)
      if (noted) return false

      await tx.insert(bookingNotes).values({
        bookingId: params.bookingId,
        author: params.note.author,
        body: params.note.body,
      })
      return true
    })
  },
}
