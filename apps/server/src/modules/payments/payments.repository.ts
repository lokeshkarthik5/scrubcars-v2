import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, payments } from '../../db/schema.js'

export type PaymentRecord = typeof payments.$inferSelect

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
