import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookingNotes, bookings, payments } from '../../db/schema.js'
import {
  allocateReceiptNumber,
  checkGarageCanTake,
  type GarageRefusal,
  type ReceiptNumberAllocation,
} from '../bookings/bookings.repository.js'

export type PaymentRecord = typeof payments.$inferSelect

// What settlePayment did with a captured payment for an existing booking.
//
// `receipt` is the receipt number issued with the payment: a refused booking
// gets one too, because the money was taken and the customer's receipt shows
// it and its refund.
export type SettlePaymentResult =
  | { kind: 'paid'; payment: PaymentRecord; receipt: ReceiptNumberAllocation }
  /** Already paid — the browser callback and the webhook race to settle it. */
  | { kind: 'already' }
  /**
   * The garage would no longer take the booking, so it was cancelled and the
   * payment recorded for a refund. Only the call that wrote this gets it.
   */
  | { kind: 'refused'; refusal: GarageRefusal; receipt: ReceiptNumberAllocation }
  | { kind: 'not_found' }

export const paymentsRepository = {
  findPaymentByBookingId(bookingId: string) {
    return db.query.payments.findFirst({
      where: eq(payments.bookingId, bookingId),
      with: {
        booking: true,
      },
    })
  },

  findPaymentByGatewayTxnId(gatewayTxnId: string) {
    return db.query.payments.findFirst({
      where: eq(payments.gatewayTxnId, gatewayTxnId),
      with: {
        booking: true,
      },
    })
  },

  setGatewayTxnId(bookingId: string, gatewayTxnId: string) {
    return db
      .update(payments)
      .set({ gatewayTxnId })
      .where(eq(payments.bookingId, bookingId))
      .returning()
  },

  /**
   * Settle a captured payment for a booking that was written unpaid (the
   * older POST /bookings path, paid later from booking details).
   *
   * An unpaid booking holds no bay, so the garage's checks it passed when it
   * was written say nothing about now: the last bay may have gone to someone
   * who paid first, or the garage may have paused or marked the day a
   * holiday. So they run again here, under the same vendor-day lock as every
   * other booking write. A refusal cancels the booking — it must not land in
   * the garage's portal — and still records the payment as paid, because the
   * money was taken and someone has to refund it.
   *
   * Locks, in the order in bookings.repository.ts: the booking's own row,
   * vendor-day, then the receipt number's two (the chain's first booking and
   * the counter). The booking row comes first because a reschedule of this
   * booking holds it FOR UPDATE while it waits for vendor-day; taking it
   * after vendor-day (the refusal's cancel, the receipt number's foreign
   * key) could deadlock with it.
   *
   * Each write is conditional on the state read, so of two racing calls only
   * one settles; the other reads 'already'. The one that settles issues the
   * receipt number in the same transaction, as its last step (the counter
   * lock comes last in the lock order).
   */
  settlePayment(params: {
    bookingId: string
    paymentTxnId: string
    paidAt: Date
    // What the customer and ops read on the cancelled booking. The service's
    // words, passed in so this stays a write.
    onRefusal: (refusal: GarageRefusal) => {
      cancellationReason: string
      note: { author: string; body: string }
    }
  }) {
    return db.transaction(async (tx): Promise<SettlePaymentResult> => {
      const [booking] = await tx
        .select({
          id: bookings.id,
          vendorId: bookings.vendorId,
          scheduledAt: bookings.scheduledAt,
          durationMins: bookings.durationMins,
          status: bookings.status,
          originalBookingId: bookings.originalBookingId,
        })
        .from(bookings)
        .where(eq(bookings.id, params.bookingId))
        .limit(1)
        // Before vendor-day (see above). NO KEY UPDATE, the lock the refusal's
        // cancel would take: it waits for a reschedule of this booking to
        // finish, and does not block the foreign key checks of other writes.
        .for('no key update')

      if (!booking) return { kind: 'not_found' }

      // A booking that is no longer on (cancelled, completed) has no time to
      // check, and is settled as it always was.
      const active = ['pending', 'confirmed', 'in_progress'].includes(booking.status)
      const refusal = active
        ? await checkGarageCanTake(tx, {
            vendorId: booking.vendorId,
            scheduledAt: booking.scheduledAt,
            durationMins: booking.durationMins,
            excludeBookingId: booking.id,
          })
        : null

      const [payment] = await tx
        .update(payments)
        .set({
          status: 'paid',
          gatewayTxnId: params.paymentTxnId,
          paidAt: params.paidAt,
        })
        // Never from 'refunded' either: that payment was settled once, and
        // ops has since given it back.
        .where(
          and(
            eq(payments.bookingId, booking.id),
            notInArray(payments.status, ['paid', 'refunded'])
          )
        )
        .returning()

      if (!payment) return { kind: 'already' }

      // The number belongs to the chain's first booking: an unpaid booking
      // can have been moved before it was paid for.
      const rootBookingId = booking.originalBookingId ?? booking.id

      if (!refusal) {
        const receipt = await allocateReceiptNumber(tx, rootBookingId, params.paidAt)
        return { kind: 'paid', payment, receipt }
      }

      const words = params.onRefusal(refusal)

      // Detlio's own call, made by the system rather than the garage or the
      // customer: neither of them decided this.
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledBy: 'admin',
          cancelledOnBehalfOf: 'detlio',
          cancellationReason: words.cancellationReason,
          cancelledAt: params.paidAt,
        })
        .where(
          and(
            eq(bookings.id, booking.id),
            inArray(bookings.status, ['pending', 'confirmed', 'in_progress'])
          )
        )

      await tx.insert(bookingNotes).values({
        bookingId: booking.id,
        author: words.note.author,
        body: words.note.body,
      })

      const receipt = await allocateReceiptNumber(tx, rootBookingId, params.paidAt)
      return { kind: 'refused', refusal, receipt }
    })
  },

  markFailed(bookingId: string) {
    return db
      .update(payments)
      .set({ status: 'failed' })
      .where(eq(payments.bookingId, bookingId))
      .returning()
  },

  findBookingById(bookingId: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    })
  },
}
