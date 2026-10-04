import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { createRazorpayOrder } from '../../lib/razorpay.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { resolveBookingDraft } from '../bookings/bookings.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { bookingIntentsRepository } from './booking-intents.repository.js'
import type { ConsumeIntentResult } from './booking-intents.repository.js'
import type { CreateBookingIntentInput } from './booking-intents.validation.js'

const log = logger.child({ module: 'booking-intents' })

// How long a customer has to complete checkout. Generous, because an intent
// costs nothing to leave lying around: it holds no slot, no promo code and no
// vehicle. Enforced on read, so no cleanup job is needed.
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

    const [intent] = await bookingIntentsRepository.createIntent(
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
        amount: draft.chargeAmount,
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

    const order = await createRazorpayOrder({
      amount: intent.amount,
      receipt: intent.id,
      intentId: intent.id,
    })

    await bookingIntentsRepository.setGatewayTxnId(intent.id, order.orderId)

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
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
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
    const result = await bookingIntentsRepository.consumeIntent(params)

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

async function handleConsumeResult(
  params: { intentId: string; razorpayPaymentId: string; userId?: string },
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
      // Exactly once per booking: the browser callback and the webhook race to
      // consume the intent, and only the winner lands here ('already' is the
      // loser). The booking is read after the response, and only if alerts
      // are on.
      alertOps(async () => {
        const booking = await bookingsRepository.findBookingById(result.bookingId)
        return booking ? { kind: 'booking_paid', booking } : null
      })
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

    case 'previously_failed':
      throw new AppError(409, FALLBACK_FAILURE_MESSAGE, 'BOOKING_CONFIRM_FAILED_REFUND_DUE')
  }
}

async function failIntent(
  params: { intentId: string; razorpayPaymentId: string },
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
  if (recorded) alertOps(async () => {
    const intent = await bookingIntentsRepository.findById(params.intentId)
    const vendor = intent ? await vendorsRepository.findVendorById(intent.vendorId) : null
    return {
      kind: 'paid_no_booking',
      paymentId: params.razorpayPaymentId,
      reason,
      amount: intent?.amount,
      garageName: vendor?.businessName,
      scheduledAt: intent?.scheduledAt,
    }
  })

  throw new AppError(409, failureMessage(reason), 'BOOKING_CONFIRM_FAILED_REFUND_DUE')
}
