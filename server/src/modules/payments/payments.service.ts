import { AppError } from '../../lib/errors.js'
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../lib/razorpay.js'
import { paymentsRepository } from './payments.repository.js'
import type { VerifyPaymentInput } from './payments.validation.js'

type RazorpayWebhookPayload = {
  event: string
  payload?: {
    payment?: {
      entity?: {
        id?: string
        order_id?: string
        status?: string
        notes?: {
          booking_id?: string
        }
      }
    }
  }
}

async function getOnlinePaymentForCustomer(userId: string, bookingId: string) {
  const booking = await paymentsRepository.findBookingById(bookingId)

  if (!booking || booking.userId !== userId) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  if (booking.paymentMethod !== 'online') {
    throw new AppError(
      400,
      'This booking does not use online payment',
      'INVALID_PAYMENT_METHOD'
    )
  }

  if (booking.status === 'cancelled') {
    throw new AppError(
      400,
      'Cancelled bookings cannot be paid',
      'BOOKING_CANCELLED'
    )
  }

  const payment = await paymentsRepository.findPaymentByBookingId(bookingId)

  if (!payment) {
    throw new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND')
  }

  return { booking, payment }
}

function toPaymentResponse(payment: {
  id: string
  gateway: string
  gatewayTxnId: string | null
  amount: string
  currency: string
  status: string
  paidAt: Date | null
  createdAt: Date
}) {
  return {
    id: payment.id,
    gateway: payment.gateway,
    gatewayTxnId: payment.gatewayTxnId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  }
}

async function markBookingPaid(
  bookingId: string,
  paymentTxnId: string,
  orderId?: string
) {
  const payment = await paymentsRepository.findPaymentByBookingId(bookingId)

  if (!payment) {
    throw new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND')
  }

  if (payment.status === 'paid') {
    return payment
  }

  if (orderId && payment.gatewayTxnId && payment.gatewayTxnId !== orderId) {
    throw new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')
  }

  const [updated] = await paymentsRepository.markPaid(
    bookingId,
    paymentTxnId,
    new Date()
  )

  return updated
}

export const paymentsService = {
  async createOrder(userId: string, bookingId: string) {
    const { booking, payment } = await getOnlinePaymentForCustomer(
      userId,
      bookingId
    )

    if (payment.status === 'paid') {
      throw new AppError(400, 'Payment already completed', 'PAYMENT_ALREADY_PAID')
    }

    const order = await createRazorpayOrder({
      amount: booking.amount,
      receipt: booking.id,
      bookingId: booking.id,
    })

    await paymentsRepository.setGatewayTxnId(booking.id, order.orderId)

    return {
      bookingId: booking.id,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
    }
  },

  async verifyPayment(userId: string, input: VerifyPaymentInput) {
    const { booking, payment } = await getOnlinePaymentForCustomer(
      userId,
      input.bookingId
    )

    if (payment.status === 'paid') {
      return {
        bookingId: booking.id,
        payment: toPaymentResponse(payment),
      }
    }

    if (
      payment.gatewayTxnId &&
      payment.gatewayTxnId !== input.razorpayOrderId
    ) {
      throw new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')
    }

    const isValid = verifyPaymentSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    })

    if (!isValid) {
      await paymentsRepository.markFailed(booking.id)
      throw new AppError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
    }

    const updated = await markBookingPaid(
      booking.id,
      input.razorpayPaymentId,
      input.razorpayOrderId
    )

    return {
      bookingId: booking.id,
      payment: toPaymentResponse(updated),
    }
  },

  async handleWebhook(rawBody: string, signature: string | undefined) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new AppError(400, 'Invalid webhook signature', 'INVALID_SIGNATURE')
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload
    const event = payload.event
    const entity = payload.payload?.payment?.entity

    if (!entity?.id) {
      return { handled: false }
    }

    const bookingId = entity.notes?.booking_id
    let payment = bookingId
      ? await paymentsRepository.findPaymentByBookingId(bookingId)
      : null

    if (!payment && entity.order_id) {
      payment = await paymentsRepository.findPaymentByGatewayTxnId(
        entity.order_id
      )
    }

    if (!payment && entity.id) {
      payment = await paymentsRepository.findPaymentByGatewayTxnId(entity.id)
    }

    if (!payment) {
      return { handled: false }
    }

    if (event === 'payment.captured' || entity.status === 'captured') {
      await markBookingPaid(
        payment.bookingId,
        entity.id,
        entity.order_id
      )
      return { handled: true, event }
    }

    if (event === 'payment.failed' || entity.status === 'failed') {
      if (payment.status !== 'paid') {
        await paymentsRepository.markFailed(payment.bookingId)
      }
      return { handled: true, event }
    }

    return { handled: false, event }
  },
}
