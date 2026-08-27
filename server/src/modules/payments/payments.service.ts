import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../lib/razorpay.js'
import { bookingIntentsService } from '../booking-intents/booking-intents.service.js'
import { paymentsRepository } from './payments.repository.js'
import type { VerifyPaymentInput } from './payments.validation.js'

const log = logger.child({ module: 'payments' })

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
          intent_id?: string
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
    log.info({ bookingId: booking.id, orderId: order.orderId, amount: order.amount }, 'payment:order_created')

    return {
      bookingId: booking.id,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
    }
  },

  async verifyPayment(userId: string, input: VerifyPaymentInput) {
    // The intent flow: no booking exists yet, and confirming is what creates
    // it. Signature first — an unverified caller must not be able to conjure a
    // booking out of an intent id.
    if ('intentId' in input) {
      const isValid = verifyPaymentSignature({
        orderId: input.razorpayOrderId,
        paymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
      })

      if (!isValid) {
        log.warn(
          { intentId: input.intentId, orderId: input.razorpayOrderId },
          'payment:invalid_signature'
        )
        throw new AppError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
      }

      const { bookingId } = await bookingIntentsService.confirmIntent({
        intentId: input.intentId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpayOrderId: input.razorpayOrderId,
        userId,
      })

      log.info(
        { intentId: input.intentId, bookingId, paymentId: input.razorpayPaymentId },
        'payment:verified'
      )

      const payment = await paymentsRepository.findPaymentByBookingId(bookingId)

      return {
        bookingId,
        payment: payment ? toPaymentResponse(payment) : null,
      }
    }

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
      log.warn({ bookingId: booking.id, orderId: input.razorpayOrderId }, 'payment:invalid_signature')
      await paymentsRepository.markFailed(booking.id)
      throw new AppError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
    }

    const updated = await markBookingPaid(
      booking.id,
      input.razorpayPaymentId,
      input.razorpayOrderId
    )

    log.info({ bookingId: booking.id, paymentId: input.razorpayPaymentId }, 'payment:verified')

    return {
      bookingId: booking.id,
      payment: toPaymentResponse(updated),
    }
  },

  async handleWebhook(rawBody: string, signature: string | undefined) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      log.warn('webhook:invalid_signature')
      throw new AppError(400, 'Invalid webhook signature', 'INVALID_SIGNATURE')
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload
    const event = payload.event
    const entity = payload.payload?.payment?.entity

    log.info({ event, paymentId: entity?.id }, 'webhook:received')

    if (!entity?.id) {
      return { handled: false }
    }

    // An intent-backed order has no booking (and no payment row) until this
    // fires, so it cannot be resolved through the payments table. Try it first,
    // and only fall through to the legacy booking lookup when there is no
    // intent behind this order. This is the recovery path for a customer whose
    // client never came back to confirm.
    if (event === 'payment.captured' || entity.status === 'captured') {
      const intentId = entity.notes?.intent_id

      try {
        const confirmed = intentId
          ? await bookingIntentsService.confirmIntent({
              intentId,
              razorpayPaymentId: entity.id,
              razorpayOrderId: entity.order_id,
            })
          : entity.order_id
            ? await bookingIntentsService.confirmIntentByOrderId(
                entity.order_id,
                entity.id
              )
            : null

        if (confirmed) {
          log.info(
            {
              event,
              intentId,
              bookingId: confirmed.bookingId,
              created: confirmed.created,
              paymentId: entity.id,
            },
            'webhook:intent_confirmed'
          )
          return { handled: true, event }
        }
      } catch (err) {
        // A confirm that fails here (expired intent, a clash that appeared
        // while the sheet was open) will fail identically on every retry, and
        // the intent is already marked failed with the payment id on it. Report
        // handled so Razorpay stops redelivering, and let the error log drive
        // the refund.
        if (err instanceof AppError) {
          log.error(
            { err, event, intentId, paymentId: entity.id },
            'webhook:intent_confirm_failed'
          )
          return { handled: true, event }
        }

        throw err
      }
    }

    const bookingId = entity.notes?.booking_id
    let payment = bookingId
      ? await paymentsRepository.findPaymentByBookingId(bookingId)
      : null

    if (!payment && entity.order_id) {
      payment = await paymentsRepository.findPaymentByGatewayTxnId(entity.order_id)
    }

    if (!payment && entity.id) {
      payment = await paymentsRepository.findPaymentByGatewayTxnId(entity.id)
    }

    if (!payment) {
      log.warn({ event, paymentId: entity.id, bookingId }, 'webhook:payment_not_found')
      return { handled: false }
    }

    if (event === 'payment.captured' || entity.status === 'captured') {
      await markBookingPaid(payment.bookingId, entity.id, entity.order_id)
      log.info({ event, bookingId: payment.bookingId, paymentId: entity.id }, 'webhook:payment_captured')
      return { handled: true, event }
    }

    if (event === 'payment.failed' || entity.status === 'failed') {
      if (payment.status !== 'paid') {
        await paymentsRepository.markFailed(payment.bookingId)
        log.warn({ event, bookingId: payment.bookingId, paymentId: entity.id }, 'webhook:payment_failed')
      }
      return { handled: true, event }
    }

    return { handled: false, event }
  },
}
