import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { metaCapi } from '../../lib/meta-capi.js'
import { alertOps } from '../../lib/ops-alerts.js'
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../lib/razorpay.js'
import {
  bookingIntentsService,
  failureMessage,
} from '../booking-intents/booking-intents.service.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { bookingChargesService } from '../booking-charges/booking-charges.service.js'
import { bookingsRepository, type GarageRefusal } from '../bookings/bookings.repository.js'
import { garageNewBooking } from '../../lib/push-messages.js'
import { pushService } from '../push/push.service.js'
import {
  garageRefusalForBooking,
  logReceiptNumberFailure,
} from '../bookings/bookings.service.js'
import { refundsService } from '../refunds/refunds.service.js'
import { giftsService } from '../gifts/gifts.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { paymentsRepository } from './payments.repository.js'
import type { VerifyPaymentInput } from './payments.validation.js'

const log = logger.child({ module: 'payments' })

type RazorpayWebhookPayload = {
  event: string
  payload?: {
    /** On refund.* events, beside the payment the refund is of. */
    refund?: {
      entity?: {
        id?: string
        payment_id?: string
        status?: string
        /** In paise. */
        amount?: number
      }
    }
    payment?: {
      entity?: {
        id?: string
        order_id?: string
        status?: string
        /** In paise. */
        amount?: number
        notes?: {
          booking_id?: string
          intent_id?: string
          charge_id?: string
          gift_id?: string
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

// The intent failure reason each garage refusal is recorded and alerted as,
// so ops and the customer read the same words whichever path took the money.
const REFUSAL_REASONS: Record<GarageRefusal, string> = {
  slot_full: 'slot_full',
  closed: 'garage_closed',
  paused: 'garage_paused',
}

/**
 * Why an unpaid booking can't be paid for now, before any money moves. Its
 * time was fine when it was written, but an unpaid booking holds no bay, so
 * the garage may have filled, paused or closed that day since. Nothing can be
 * done about the booking from here but cancel it, so that is what it says.
 */
function payLaterRefused(refusal: GarageRefusal) {
  switch (refusal) {
    case 'paused':
      return new AppError(
        409,
        "This garage isn't taking bookings right now, so this one can't be paid for. You can cancel it.",
        'GARAGE_PAUSED'
      )
    case 'closed':
      return new AppError(
        400,
        "The garage is closed on this booking's day, so it can't be paid for. You can cancel it.",
        'GARAGE_CLOSED_THAT_DAY'
      )
    case 'slot_full':
      return new AppError(
        409,
        "This time has been booked up at the garage, so this booking can't be paid for. You can cancel it.",
        'SLOT_FULL'
      )
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

  // A refunded payment was settled before it was refunded: a capture event
  // redelivered after ops recorded the refund must not flip it back to paid.
  if (payment.status === 'paid' || payment.status === 'refunded') {
    return payment
  }

  if (orderId && payment.gatewayTxnId && payment.gatewayTxnId !== orderId) {
    throw new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')
  }

  // The garage's checks run again where the payment lands, under the
  // vendor-day lock: this is the moment the booking starts holding a bay.
  const result = await paymentsRepository.settlePayment({
    bookingId,
    paymentTxnId,
    paidAt: new Date(),
    responseWindowMins: env.garageResponseMinutes,
    onRefusal: (refusal) => ({
      cancellationReason: failureMessage(REFUSAL_REASONS[refusal]),
      note: {
        author: 'Detlio (automatic)',
        body: `Payment ${paymentTxnId} landed after the garage stopped being able to take this booking (${REFUSAL_REASONS[refusal]}). Booking cancelled; refund the payment in Razorpay.`,
      },
    }),
  })

  switch (result.kind) {
    case 'paid':
      logReceiptNumberFailure(result.receipt, bookingId)
      // Once, by whichever of the app and the webhook settled it.
      analyticsService.bookingPaid(bookingId)
      // A booking paid for now and still waiting for its garage is new to
      // the garage's team (0044), with its fresh time to accept.
      pushService.notifyLater(async () => {
        const booking = await bookingsRepository.findBookingById(bookingId)
        if (!booking || booking.status !== 'pending') return []
        return [{
          recipient: { audience: 'garage', vendorId: booking.vendorId },
          message: garageNewBooking(booking, new Date(), env.garageResponseMinutes),
        }]
      })
      return result.payment

    // A racing call settled it first. Re-read rather than guess which way it
    // went: a refused booking is cancelled, and the caller must not report it
    // as paid for.
    case 'already':
    case 'not_found': {
      const settled = await paymentsRepository.findPaymentByBookingId(bookingId)
      if (!settled) {
        throw new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND')
      }
      if (settled.booking.status === 'cancelled') {
        throw new AppError(
          409,
          settled.booking.cancellationReason ?? failureMessage(null),
          'BOOKING_CONFIRM_FAILED_REFUND_DUE'
        )
      }
      return settled
    }

    // Money captured for a booking the garage can no longer take. Same
    // handling as a refused intent (failIntent): logged loudly, one ops alert
    // from the call that recorded it, and the 409 the app shows as "your
    // payment will be refunded".
    case 'refused': {
      logReceiptNumberFailure(result.receipt, bookingId)
      const reason = REFUSAL_REASONS[result.refusal]
      log.error(
        { bookingId, paymentId: paymentTxnId, reason },
        'payment:settle_refused_refund_due'
      )
      // Detlio cancelled it: refunded at once when AUTO_REFUNDS is on.
      refundsService.queueAutoRefund({ kind: 'booking', id: bookingId })
      alertOps(async () => {
        const booking = await paymentsRepository.findBookingById(bookingId)
        const vendor = booking
          ? await vendorsRepository.findVendorById(booking.vendorId)
          : null
        return {
          kind: 'paid_no_booking',
          paymentId: paymentTxnId,
          reason,
          amount: booking?.amount,
          garageName: vendor?.businessName,
          scheduledAt: booking?.scheduledAt,
        }
      })
      throw new AppError(
        409,
        failureMessage(reason),
        'BOOKING_CONFIRM_FAILED_REFUND_DUE'
      )
    }
  }
}

/** The app's confirmation of a Razorpay payment: an intent or a legacy booking. */
async function confirmPayment(userId: string, input: VerifyPaymentInput) {
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

  if (payment.status === 'paid' || payment.status === 'refunded') {
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
}

/** What the verify request says about the browser, read by the controller. */
export interface PurchaseRequest {
  clientIp?: string
  userAgent?: string
}

/**
 * Hands a consented, paid booking to the Conversions API (fire and forget,
 * once per booking). The value is what came through Razorpay for it, after
 * discounts and Detlio credit. Test-key and fake payments, a payment not
 * paid and a cancelled booking are never reported.
 */
function reportPurchaseToMeta(
  bookingId: string,
  marketing: NonNullable<VerifyPaymentInput['marketing']>,
  request: PurchaseRequest
) {
  metaCapi.reportPurchase(
    bookingId,
    {
      clientIp: request.clientIp,
      userAgent: request.userAgent,
      fbp: marketing.fbp,
      fbc: marketing.fbc,
      eventSourceUrl: marketing.eventSourceUrl,
    },
    async () => {
      const facts = await paymentsRepository.findPurchaseFacts(bookingId)
      if (!facts || facts.paymentStatus !== 'paid') return null
      if (facts.gatewayMode === 'test' || facts.gatewayMode === 'fake') return null
      if (facts.bookingStatus === 'cancelled') return null
      const value = Number.parseFloat(facts.amount)
      if (!Number.isFinite(value) || value < 0) return null
      return {
        bookingId,
        valueRupees: value,
        serviceCount: facts.serviceCount,
        paidAt: facts.paidAt ?? new Date(),
      }
    }
  )
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

    // Only a cancelled booking is ever refunded, and there is nothing on it
    // to pay for again.
    if (payment.status === 'refunded') {
      throw new AppError(
        400,
        'This payment was refunded, so there is nothing to pay.',
        'PAYMENT_REFUNDED'
      )
    }

    // Refused before the customer is charged, where it can still be said
    // plainly. settlePayment checks again when the money lands. Only a
    // booking that is still on has a time to check — the same rule there.
    const active = ['pending', 'confirmed', 'in_progress'].includes(booking.status)
    const refusal = active ? await garageRefusalForBooking(booking) : null
    if (refusal) {
      log.warn({ bookingId: booking.id, vendorId: booking.vendorId, refusal }, 'payment:order_refused_by_garage')
      throw payLaterRefused(refusal)
    }

    const order = await createRazorpayOrder({
      amount: booking.amount,
      receipt: booking.id,
      bookingId: booking.id,
    })

    await paymentsRepository.setGatewayTxnId(booking.id, order.orderId, order.gatewayMode)
    log.info({ bookingId: booking.id, orderId: order.orderId, amount: order.amount }, 'payment:order_created')

    return {
      bookingId: booking.id,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
    }
  },

  async verifyPayment(
    userId: string,
    input: VerifyPaymentInput,
    request: PurchaseRequest = {}
  ) {
    const result = await confirmPayment(userId, input)

    // Reported to Meta only for a customer who accepted marketing cookies,
    // and only once the booking is paid for (lib/meta-capi.ts). Never from
    // the webhook, which has no consent to go on.
    if (input.marketing?.consent === true && result.payment?.status === 'paid') {
      reportPurchaseToMeta(result.bookingId, input.marketing, request)
    }

    return result
  },

  async handleWebhook(rawBody: string, signature: string | undefined) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      log.warn('webhook:invalid_signature')
      throw new AppError(400, 'Invalid webhook signature', 'INVALID_SIGNATURE')
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload
    const event = payload.event

    // A refund's outcome, signed like every event above. Handled first and
    // on its own: refund events carry the payment too, whose status still
    // reads 'captured' after a part refund, and must never reach the
    // capture handling below.
    if (event?.startsWith('refund.')) {
      log.info({ event, refundId: payload.payload?.refund?.entity?.id }, 'webhook:received')
      return refundsService.handleGatewayRefund(event, payload.payload?.refund?.entity)
    }

    const entity = payload.payload?.payment?.entity

    log.info({ event, paymentId: entity?.id }, 'webhook:received')

    if (!entity?.id) {
      return { handled: false }
    }

    // A final bill paid after the job. Checked first: its order notes carry
    // the booking's id too, and the legacy branch below would otherwise try
    // to settle the booking's own (long since paid) payment with it. The
    // notes are on the order, not the payment, so a payment can arrive
    // without them; then the bill is found by its order id, which is unique,
    // as confirmIntentByOrderId does for a booking intent below.
    const chargeId =
      entity.notes?.charge_id ??
      (entity.order_id ? await bookingChargesService.chargeIdForOrder(entity.order_id) : null)
    if (chargeId) {
      if (event === 'payment.captured' || entity.status === 'captured') {
        await bookingChargesService.settleFromWebhook({
          chargeId,
          orderId: entity.order_id,
          paymentId: entity.id,
          amountPaise: entity.amount,
        })
      }
      // A failed attempt changes nothing: the bill stays due and the
      // customer can try again from their booking.
      return { handled: true, event }
    }

    // A Detlio gift being bought (0049): no booking at all. Found by the
    // order's notes, or by its order id when a payment arrives without them.
    // Recorded whatever GIFTS_ENABLED says: the money landed either way.
    const giftId =
      entity.notes?.gift_id ??
      (entity.order_id ? await giftsService.giftIdForOrder(entity.order_id) : null)
    if (giftId) {
      if (event === 'payment.captured' || entity.status === 'captured') {
        await giftsService.settleFromWebhook({ giftId, orderId: entity.order_id, paymentId: entity.id })
      }
      return { handled: true, event }
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
      try {
        await markBookingPaid(payment.bookingId, entity.id, entity.order_id)
      } catch (err) {
        // A garage refusal (or an order mismatch) answers the same on every
        // redelivery, and the refund is already recorded and alerted. Report
        // handled so Razorpay stops retrying, as the intent branch above does.
        if (err instanceof AppError) {
          log.error(
            { err, event, bookingId: payment.bookingId, paymentId: entity.id },
            'webhook:payment_settle_failed'
          )
          return { handled: true, event }
        }

        throw err
      }
      log.info({ event, bookingId: payment.bookingId, paymentId: entity.id }, 'webhook:payment_captured')
      return { handled: true, event }
    }

    if (event === 'payment.failed' || entity.status === 'failed') {
      // A late failure event for an attempt on a payment that later went
      // through (or was refunded) says nothing about it now.
      if (payment.status !== 'paid' && payment.status !== 'refunded') {
        await paymentsRepository.markFailed(payment.bookingId)
        log.warn({ event, bookingId: payment.bookingId, paymentId: entity.id }, 'webhook:payment_failed')
      }
      return { handled: true, event }
    }

    return { handled: false, event }
  },
}
