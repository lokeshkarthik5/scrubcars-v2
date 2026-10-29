import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { newHandoverCodes } from '../../lib/pickup.js'
import { createRazorpayOrder } from '../../lib/razorpay.js'
import { garageNewBooking, garageRequestBooked } from '../../lib/push-messages.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import {
  logReceiptNumberFailure,
  requestRefusalError,
  resolveBookingDraft,
} from '../bookings/bookings.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { refundsService } from '../refunds/refunds.service.js'
import { pushService } from '../push/push.service.js'
import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { paise, rupees, splitCheckout } from '../../lib/gift-credit.js'
import { isFreeWashCheckout } from '../../lib/area-signups.js'
import { bookingIntentsRepository } from './booking-intents.repository.js'
import type { ConsumeIntentResult } from './booking-intents.repository.js'
import type { CreateBookingIntentInput } from './booking-intents.validation.js'

const log = logger.child({ module: 'booking-intents' })

// How long a customer has to complete checkout. Generous, because an intent
// costs nothing to leave lying around: it holds no slot, no promo code and no
// vehicle. Enforced on read, so no cleanup job is needed. Mirrored in
// packages/core/src/booking-types.ts CHECKOUT_MINUTES (the refund policy
// prints it).
const INTENT_TTL_MS = 30 * 60 * 1000

/**
 * What the customer is told when their payment landed but the booking could
 * not be written, keyed by the reason failIntent records. Shared by the
 * confirm call that hits it and the status read the app polls afterwards, so
 * a customer who learns of it either way reads the same words.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  // Confirm only ever runs on a captured payment, so an intent that aged out
  // between opening the sheet and paying is a refund case too.
  intent_expired:
    'This checkout expired before the payment completed, so the booking could not be confirmed. Your payment will be refunded.',
  vehicle_double_booked:
    'That car already has an overlapping booking, so this one could not be confirmed. Your payment will be refunded.',
  discount_exhausted:
    'That promo code was fully redeemed before this payment completed, so the booking could not be confirmed. Your payment will be refunded.',
  credit_exhausted:
    'Your Detlio credit changed before this payment completed (it was used for another booking, or ran out), so the booking could not be confirmed. Your payment will be refunded, and your credit is untouched.',
  request_gone:
    'The garage’s yes to your request was no longer open when this payment completed, so the booking could not be confirmed. Your payment will be refunded.',
  slot_full:
    'That time was booked up at the garage before this payment completed, so the booking could not be confirmed. Your payment will be refunded.',
  garage_closed:
    'The garage closed that day before this payment completed, so the booking could not be confirmed. Your payment will be refunded.',
  garage_paused:
    'The garage stopped taking bookings before this payment completed, so the booking could not be confirmed. Your payment will be refunded.',
}

const FALLBACK_FAILURE_MESSAGE =
  'This payment could not be turned into a booking. A refund is being processed.'

// Exported for the pay-later path (payments.service), which can take money
// for a booking the garage then turns down in exactly these ways.
export function failureMessage(reason: string | null): string {
  return (reason && FAILURE_MESSAGES[reason]) || FALLBACK_FAILURE_MESSAGE
}

export const bookingIntentsService = {
  /**
   * Price a booking and open a Razorpay order against it — without creating the
   * booking. Nothing here is visible to the vendor and nothing is held, so a
   * customer who closes the checkout sheet leaves no trace.
   */
  async createIntent(userId: string, input: CreateBookingIntentInput) {
    const draft = await resolveBookingDraft(userId, input)

    // Detlio credit (0049), after any promo code: as much of the balance as
    // the rules allow (lib/gift-credit.ts creditToUse). Read, not held: the
    // booking write spends it under the customer's credit lock, and refuses
    // if it is no longer there.
    const { creditPaise, cashPaise } = splitCheckout(
      paise(draft.chargeAmount),
      input.useCredit && env.giftsEnabled ? await giftCreditService.availablePaise(userId) : 0
    )

    const created = await bookingIntentsRepository.createIntent(
      {
        userId,
        vendorId: draft.vendor.id,
        // The first service, for the column that still carries one. The full
        // list is the items below.
        serviceId: draft.service.id,
        vehicleId: draft.vehicle.id,
        bookingType: input.bookingType,
        scheduledAt: draft.scheduledAt,
        // The whole booking's duration, not one service's.
        serviceDurationMins: draft.durationMins,
        subtotalAmount: draft.amount,
        // An accepted request's travel fee and the request it confirms (0062).
        travelFee: draft.travelFee,
        requestId: draft.requestId,
        // What Razorpay is asked for; the credit part is spent with the booking.
        amount: rupees(cashPaise),
        creditAmount: rupees(creditPaise),
        discountAmount: draft.discount?.discountAmount ?? '0.00',
        discountId: draft.discount?.discountId ?? null,
        discountCode: draft.discount?.code ?? null,
        discountFundedBy: draft.discount?.fundedBy ?? null,
        paymentMethod: input.paymentMethod,
        lat: draft.lat,
        lng: draft.lng,
        address: draft.address,
        expiresAt: new Date(Date.now() + INTENT_TTL_MS),
      },
      draft.items
    )
    // The request was cancelled (or lapsed) since the draft read it: no
    // checkout, and no Razorpay order (0064: the team's cancel).
    if (!created) throw requestRefusalError('REQUEST_NOT_ACCEPTED')
    const [intent] = created

    // Nothing left for Razorpay: no order at all. The booking is written
    // now, through the same consumeIntent (slot, car, promo and credit
    // checks under the same locks; the receipt number; the garage's
    // deadline), with no payment id. Either Detlio credit paid it, or a
    // zone's free wash (0062) brought it to ₹0: free means free, so there is
    // nothing to pay and the garage is still paid the full price by Detlio
    // (a Detlio-funded code). No other code can reach ₹0 (lib/discounts.ts).
    if (cashPaise === 0) {
      const free = creditPaise === 0
      if (free && !isFreeWashCheckout(draft.discount?.source, draft.chargeAmount)) {
        // Unreachable by the rules above; never a ₹0 Razorpay order.
        throw new AppError(409, "This booking couldn't be priced. Nothing was charged.", 'BOOKING_NOT_CONFIRMED')
      }
      const { bookingId } = await confirmWithoutGateway(userId, intent.id)
      log.info(
        { intentId: intent.id, userId, bookingId, creditAmount: intent.creditAmount, free },
        free ? 'booking_intent:free_wash_booked' : 'booking_intent:paid_with_credit'
      )
      return {
        intentId: intent.id,
        orderId: null,
        amount: 0,
        currency: 'INR',
        keyId: null,
        creditAmount: intent.creditAmount,
        paidWithCredit: !free,
        /** A free wash covered it all (0062): booked, nothing paid. */
        free,
        bookingId,
      }
    }

    const order = await createRazorpayOrder({
      amount: intent.amount,
      receipt: intent.id,
      intentId: intent.id,
    })

    await bookingIntentsRepository.setGatewayTxnId(intent.id, order.orderId, order.gatewayMode)

    log.info(
      {
        intentId: intent.id,
        userId,
        vendorId: intent.vendorId,
        orderId: order.orderId,
        amount: intent.amount,
      },
      'booking_intent:created'
    )

    return {
      intentId: intent.id,
      orderId: order.orderId as string | null,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId as string | null,
      creditAmount: intent.creditAmount,
      paidWithCredit: false,
      free: false,
      bookingId: null as string | null,
    }
  },

  /**
   * Confirm a captured payment into a booking.
   *
   * Called from two places that race by design — the client's success callback
   * and the Razorpay webhook — because the client one can simply never arrive
   * (app killed, tab closed, network dropped) and a customer who paid must end
   * up with a booking either way. `consumeIntent` makes the second caller a
   * no-op.
   */
  async confirmIntent(params: {
    intentId: string
    razorpayPaymentId: string
    razorpayOrderId?: string
    userId?: string
  }) {
    const result = await bookingIntentsRepository.consumeIntent({
      ...params,
      // Made for every confirm and kept only by a pickup & drop booking.
      handoverCodes: newHandoverCodes(),
      responseWindowMins: env.garageResponseMinutes,
    })

    return await handleConsumeResult(params, result)
  },

  /**
   * Where a checkout stands, for the app to poll after the customer has paid
   * but the confirm call has not come back. The webhook may have written the
   * booking in the meantime, and this is how the app finds out.
   *
   * The customer's own intents only; anyone else's is a 404, the same answer
   * as one that does not exist, so ids cannot be probed.
   */
  async getIntentStatus(userId: string, intentId: string) {
    const intent = await bookingIntentsRepository.findById(intentId)

    if (!intent || intent.userId !== userId) {
      throw new AppError(404, 'Booking intent not found', 'INTENT_NOT_FOUND')
    }

    return {
      status: intent.status,
      bookingId: intent.status === 'consumed' ? intent.bookingId : null,
      failureReason: intent.status === 'failed' ? intent.failureReason : null,
      // The customer-facing words for a failure, so the app need not keep its
      // own copy of every reason.
      message: intent.status === 'failed' ? failureMessage(intent.failureReason) : null,
    }
  },

  /** Webhook entry point: the order id is all Razorpay gives us to go on. */
  async confirmIntentByOrderId(orderId: string, razorpayPaymentId: string) {
    const intent = await bookingIntentsRepository.findByGatewayTxnId(orderId)

    if (!intent) return null

    return bookingIntentsService.confirmIntent({
      intentId: intent.id,
      razorpayPaymentId,
      razorpayOrderId: orderId,
    })
  },
}

/** What a checkout with nothing for Razorpay is told when it can't be booked: nothing was charged. */
const CREDIT_ONLY_REFUSALS: Record<string, { status: 409 | 400; message: string; code: string }> = {
  vehicle_clash: {
    status: 409,
    message: 'That car already has a booking at this time. Nothing was charged and your credit is untouched.',
    code: 'VEHICLE_DOUBLE_BOOKED',
  },
  slot_full: {
    status: 409,
    message: 'That time was just booked up at the garage. Pick another time; nothing was charged.',
    code: 'SLOT_FULL',
  },
  garage_closed: {
    status: 400,
    message: 'The garage is closed that day. Pick another day; nothing was charged.',
    code: 'GARAGE_CLOSED_THAT_DAY',
  },
  garage_paused: {
    status: 409,
    message: "This garage isn't taking bookings right now. Nothing was charged.",
    code: 'GARAGE_PAUSED',
  },
  discount_exhausted: {
    status: 409,
    message: 'That promo code has just been used up. Remove it and try again; nothing was charged.',
    code: 'DISCOUNT_EXHAUSTED',
  },
  request_gone: {
    status: 409,
    message: "This request isn't accepted any more. Nothing was charged; send a new one.",
    code: 'REQUEST_NOT_ACCEPTED',
  },
  credit_exhausted: {
    status: 409,
    message: 'Your Detlio credit changed (it was used for another booking, or ran out). Check your balance and try again; nothing was charged.',
    code: 'CREDIT_EXHAUSTED',
  },
}

/**
 * A checkout with nothing for Razorpay (paid wholly with Detlio credit, or a
 * free wash that covered it all, 0062), booked at once. No money was taken,
 * so a refusal is a plain error (nothing to refund, no ops alert) and the
 * checkout is closed as failed with no payment on it.
 */
async function confirmWithoutGateway(userId: string, intentId: string): Promise<{ bookingId: string }> {
  const result = await bookingIntentsRepository.consumeIntent({
    intentId,
    razorpayPaymentId: null,
    userId,
    handoverCodes: newHandoverCodes(),
    responseWindowMins: env.garageResponseMinutes,
  })
  if (result.kind === 'created' || result.kind === 'already') {
    return handleConsumeResult({ intentId, razorpayPaymentId: null, userId }, result)
  }
  const refusal = CREDIT_ONLY_REFUSALS[result.kind]
  await bookingIntentsRepository.markFailed(intentId, null, result.kind)
  log.warn({ intentId, userId, reason: result.kind }, 'booking_intent:no_gateway_refused')
  if (refusal) throw new AppError(refusal.status, refusal.message, refusal.code)
  throw new AppError(409, "This booking couldn't be made. Nothing was charged.", 'BOOKING_NOT_CONFIRMED')
}

async function handleConsumeResult(
  params: { intentId: string; razorpayPaymentId: string | null; userId?: string },
  result: ConsumeIntentResult
): Promise<{ bookingId: string; created: boolean }> {
  switch (result.kind) {
    case 'created':
      log.info(
        {
          intentId: params.intentId,
          bookingId: result.bookingId,
          paymentId: params.razorpayPaymentId,
        },
        'booking_intent:consumed'
      )
      logReceiptNumberFailure(result.receipt, result.bookingId)
      // Exactly once per booking: the browser callback and the webhook race to
      // consume the intent, and only the winner lands here ('already' is the
      // loser). The booking is read after the response, and only if alerts
      // are on.
      alertOps(async () => {
        const booking = await bookingsRepository.findBookingById(result.bookingId)
        return booking ? { kind: 'booking_paid', booking } : null
      })
      // Every device of the garage's team hears about it at once (0044),
      // with how long they have to accept. Same exactly-once as the alert.
      pushService.notifyLater(async () => {
        const booking = await bookingsRepository.findBookingById(result.bookingId)
        if (!booking || booking.status !== 'pending') return []
        return [{
          recipient: { audience: 'garage', vendorId: booking.vendorId },
          message: garageNewBooking(booking, new Date(), env.garageResponseMinutes),
        }]
      })
      // A confirmed request (0062) is booked accepted: the garage hears it
      // is paid (the new-booking push above is only for pending ones).
      pushService.notifyLater(async () => {
        const booking = await bookingsRepository.findBookingById(result.bookingId)
        if (!booking || booking.status !== 'confirmed') return []
        return [{ recipient: { audience: 'garage', vendorId: booking.vendorId }, message: garageRequestBooked(booking) }]
      })
      // The funnel's last step, recorded here rather than by the app, whose
      // tab may be gone by now. After the response; never fails this.
      analyticsService.bookingPaid(result.bookingId)
      return { bookingId: result.bookingId, created: true }

    case 'already':
      log.info(
        { intentId: params.intentId, bookingId: result.bookingId },
        'booking_intent:already_consumed'
      )
      return { bookingId: result.bookingId, created: false }

    case 'not_found':
      throw new AppError(404, 'Booking intent not found', 'INTENT_NOT_FOUND')

    case 'order_mismatch':
      throw new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')

    // Confirm only ever runs on a captured payment, so an intent that aged out
    // between opening the sheet and paying is a refund case too, not a plain
    // rejection — record the payment id rather than dropping it.
    case 'expired':
      return failIntent(params, 'intent_expired')

    // Below here the money is captured and there is no booking to show for it.
    // These are refund cases, so they are logged loudly with the payment id
    // rather than swallowed — the alternative (relaxing the checks and booking
    // anyway) is a double-booked car or an over-redeemed code.
    case 'vehicle_clash':
      return failIntent(params, 'vehicle_double_booked')

    // The garage filled up, marked the day a holiday or paused while the
    // customer was paying. Booking anyway would put a job in front of a garage
    // that has said it cannot do it.
    case 'slot_full':
      return failIntent(params, 'slot_full')

    case 'garage_closed':
      return failIntent(params, 'garage_closed')

    case 'garage_paused':
      return failIntent(params, 'garage_paused')

    case 'discount_exhausted':
      return failIntent(params, 'discount_exhausted')

    case 'credit_exhausted':
      return failIntent(params, 'credit_exhausted')

    // The request this checkout confirmed was no longer accepted (cancelled,
    // or already confirmed by another checkout): money captured, no booking.
    case 'request_gone':
      return failIntent(params, 'request_gone')

    case 'previously_failed':
      throw new AppError(409, FALLBACK_FAILURE_MESSAGE, 'BOOKING_CONFIRM_FAILED_REFUND_DUE')
  }
}

async function failIntent(
  params: { intentId: string; razorpayPaymentId: string | null },
  reason: string
): Promise<never> {
  const [recorded] = await bookingIntentsRepository.markFailed(
    params.intentId,
    params.razorpayPaymentId,
    reason
  )

  log.error(
    {
      intentId: params.intentId,
      razorpayPaymentId: params.razorpayPaymentId,
      reason,
    },
    'booking_intent:confirm_failed_refund_due'
  )

  // Money captured, no booking: someone has to refund it, and until now the
  // error log above was the only place that said so. Only the call that
  // recorded the failure alerts — a racing confirm, or a later retry
  // ('previously_failed'), does not flag the same refund twice.
  // Paid, no booking: refunded at once when AUTO_REFUNDS is on (the cron
  // sweep retries anything this misses). Only from the call that recorded
  // it, like the alert.
  if (recorded) refundsService.queueAutoRefund({ kind: 'checkout', id: params.intentId })
  if (recorded) alertOps(async () => {
    const intent = await bookingIntentsRepository.findById(params.intentId)
    const vendor = intent ? await vendorsRepository.findVendorById(intent.vendorId) : null
    return {
      kind: 'paid_no_booking',
      // Only a checkout with a Razorpay part reaches here (a credit-only one
      // is refused in confirmWithoutGateway, with nothing to refund).
      paymentId: params.razorpayPaymentId ?? 'none',
      reason,
      amount: intent?.amount,
      garageName: vendor?.businessName,
      scheduledAt: intent?.scheduledAt,
    }
  })

  throw new AppError(409, failureMessage(reason), 'BOOKING_CONFIRM_FAILED_REFUND_DUE')
}
