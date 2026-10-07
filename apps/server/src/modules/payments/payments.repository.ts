import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookingNotes, bookings, payments } from '../../db/schema.js'
import {
  checkGarageCanTake,
  type GarageRefusal,
} from '../bookings/bookings.repository.js'

export type PaymentRecord = typeof payments.$inferSelect

// What settlePayment did with a captured payment for an existing booking.
export type SettlePaymentResult =
  | { kind: 'paid'; payment: PaymentRecord }
  /** Already paid — the browser callback and the webhook race to settle it. */
  | { kind: 'already' }
  /**
   * The garage would no longer take the booking, so it was cancelled and the
   * payment recorded for a refund. Only the call that wrote this gets it.
   */
  | { kind: 'refused'; refusal: GarageRefusal }
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

  markPaid(bookingId: string, paymentTxnId: string, paidAt: Date) {
    return db
      .update(payments)
      .set({
        status: 'paid',
        gatewayTxnId: paymentTxnId,
        paidAt,
      })
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
   * other booking write (the only lock this path takes, so the lock order in
   * bookings.repository.ts holds). A refusal cancels the booking — it must
   * not land in the garage's portal — and still records the payment as paid,
   * because the money was taken and someone has to refund it.
   *
   * Each write is conditional on the state read, so of two racing calls only
   * one settles; the other reads 'already'.
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
        })
        .from(bookings)
        .where(eq(bookings.id, params.bookingId))
        .limit(1)

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
        .where(
          and(eq(payments.bookingId, booking.id), ne(payments.status, 'paid'))
        )
        .returning()

      if (!payment) return { kind: 'already' }
      if (!refusal) return { kind: 'paid', payment }

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

      return { kind: 'refused', refusal }
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
