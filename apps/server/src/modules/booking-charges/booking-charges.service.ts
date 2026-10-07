import { AppError } from '../../lib/errors.js'
import {
  FINAL_BILL_WINDOW_DAYS,
  chargeSettlement,
  finalBillAmountDue,
  finalBillRefusal,
  finalBillStatus,
  finalBillTotal,
  creditAtBooking,
  toFinalBillView,
  type FinalBillRefusal,
} from '../../lib/final-bill.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import {
  createRazorpayOrder,
  razorpayKeyId,
  toPaise,
  verifyPaymentSignature,
} from '../../lib/razorpay.js'
import {
  bookingChargesRepository,
  type BookingChargeRecord,
} from './booking-charges.repository.js'
import type {
  RaiseFinalBillInput,
  VerifyChargePaymentInput,
} from './booking-charges.validation.js'

const log = logger.child({ module: 'booking-charges' })

function bookingNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

function billNotFound() {
  return new AppError(404, 'Bill not found', 'CHARGE_NOT_FOUND')
}

/** The garage's words for why it cannot raise a bill on this job now. */
function refusalError(refusal: FinalBillRefusal) {
  switch (refusal) {
    case 'not_inspection':
      return new AppError(
        400,
        'A final bill is only for jobs with a service priced on inspection.',
        'FINAL_BILL_NOT_INSPECTION'
      )
    case 'not_started':
      return new AppError(
        400,
        'Start the job before raising the final bill.',
        'FINAL_BILL_JOB_NOT_STARTED'
      )
    case 'booking_closed':
      return new AppError(
        400,
        "This booking was cancelled, so it can't be billed.",
        'FINAL_BILL_BOOKING_CLOSED'
      )
    case 'window_closed':
      return new AppError(
        400,
        `A final bill can be raised up to ${FINAL_BILL_WINDOW_DAYS} days after the job is completed.`,
        'FINAL_BILL_WINDOW_CLOSED'
      )
  }
}

/**
 * The customer's words when a payment landed on a bill that can no longer
 * take it. Final: the app shows it in place of Pay, with the payment id.
 */
const REFUND_DUE_CODE = 'FINAL_BILL_REFUND_DUE'
const REPLACED_MESSAGE =
  'The garage changed this bill while you were paying, so this payment will be refunded. Please check the new bill.'
const CANCELLED_MESSAGE =
  'This booking was cancelled while you were paying, so this payment will be refunded.'
const PAID_TWICE_MESSAGE =
  'This bill was already paid, so this second payment will be refunded.'

type BookingForBill = NonNullable<
  Awaited<ReturnType<typeof bookingChargesRepository.findBooking>>
>

function pricingTypesOf(booking: BookingForBill): string[] {
  return booking.items.flatMap((item) =>
    item.service?.pricingType ? [item.service.pricingType] : []
  )
}

/** What happened to a captured payment for a bill. */
type SettleOutcome =
  | { kind: 'paid'; charge: BookingChargeRecord }
  | { kind: 'refund_due'; message: string }
  | { kind: 'rejected'; reason: 'order_mismatch' | 'amount_mismatch' | 'not_due' }

/**
 * Settles a captured payment against a bill. The browser's verify call and
 * the webhook both arrive for every payment, in either order, so each branch
 * is safe to reach twice: the write that marks it paid is conditional on it
 * still being due, and the refund note on a replaced bill is written once.
 */
async function settleCaptured(
  charge: BookingChargeRecord,
  payment: { orderId: string | null | undefined; paymentId: string; amountPaise?: number },
  source: 'verify' | 'webhook',
  retried = false
): Promise<SettleOutcome> {
  const decision = chargeSettlement(charge, payment)

  switch (decision) {
    case 'already_paid':
      return { kind: 'paid', charge }

    case 'settle': {
      const paidAt = new Date()
      const [settled] = await bookingChargesRepository.settleCharge({
        chargeId: charge.id,
        orderId: payment.orderId!,
        paymentId: payment.paymentId,
        paidAt,
      })

      if (!settled) {
        // The other caller got there first, or the garage replaced the bill
        // in between. Read it again and answer for what it is now.
        const fresh = await bookingChargesRepository.findCharge(charge.id)
        if (!fresh || retried) throw billNotFound()
        return settleCaptured(fresh, payment, source, true)
      }

      log.info(
        { chargeId: charge.id, bookingId: charge.bookingId, paymentId: payment.paymentId, source },
        'final_bill:paid'
      )
      alertOps(async () => {
        const booking = await bookingChargesRepository.findBooking(charge.bookingId)
        return booking
          ? {
              kind: 'final_bill_paid',
              booking,
              amountDue: settled.amountDue,
              paymentId: payment.paymentId,
            }
          : null
      })
      return { kind: 'paid', charge: settled }
    }

    case 'replaced': {
      // A bill stops standing in two ways: the garage replaced it, or Detlio
      // cancelled the booking (which withdraws an unpaid bill). The refund is
      // the same; the words for the customer and for ops are not.
      const booking = await bookingChargesRepository.findBooking(charge.bookingId)
      const cancelled = booking?.status === 'cancelled'
      const recorded = await bookingChargesRepository.recordPaymentOnReplacedBill({
        chargeId: charge.id,
        bookingId: charge.bookingId,
        paymentId: payment.paymentId,
        note: {
          author: 'Detlio (automatic)',
          body: cancelled
            ? `Payment ${payment.paymentId} (₹${charge.amountDue}) landed for a final bill on a booking that was already cancelled. Refund it in Razorpay.`
            : `Payment ${payment.paymentId} (₹${charge.amountDue}) landed for a final bill the garage had already replaced. Refund it in Razorpay; the customer can pay the new bill.`,
        },
      })

      if (recorded) {
        log.error(
          { chargeId: charge.id, bookingId: charge.bookingId, paymentId: payment.paymentId, source, cancelled },
          'final_bill:paid_after_replaced_refund_due'
        )
        if (booking) {
          alertOps({
            kind: 'final_bill_refund_due',
            reason: cancelled ? 'booking_cancelled' : 'replaced',
            booking,
            amount: charge.amountDue,
            paymentId: payment.paymentId,
          })
        }
      }
      return { kind: 'refund_due', message: cancelled ? CANCELLED_MESSAGE : REPLACED_MESSAGE }
    }

    case 'paid_twice': {
      // Razorpay will not take a second payment on a paid order, so this
      // means something upstream went wrong. Still money the customer was told
      // comes back, so it is noted and alerted like a replaced bill: once, by
      // whichever of verify and the webhook gets here first.
      const recorded = await bookingChargesRepository.recordSecondPayment({
        chargeId: charge.id,
        bookingId: charge.bookingId,
        paymentId: payment.paymentId,
        note: {
          author: 'Detlio (automatic)',
          body: `Payment ${payment.paymentId} landed for a final bill that was already paid (by ${charge.gatewayPaymentId}). Refund this second payment in Razorpay.`,
        },
      })

      log.error(
        { chargeId: charge.id, bookingId: charge.bookingId, paymentId: payment.paymentId, source, recorded },
        'final_bill:paid_twice_refund_due'
      )
      if (recorded) {
        alertOps(async () => {
          const booking = await bookingChargesRepository.findBooking(charge.bookingId)
          return booking
            ? {
                kind: 'final_bill_refund_due',
                reason: 'paid_twice',
                booking,
                amount: charge.amountDue,
                paymentId: payment.paymentId,
              }
            : null
        })
      }
      return { kind: 'refund_due', message: PAID_TWICE_MESSAGE }
    }

    case 'order_mismatch':
    case 'amount_mismatch':
    case 'not_due':
      log.error(
        {
          chargeId: charge.id,
          bookingId: charge.bookingId,
          paymentId: payment.paymentId,
          orderId: payment.orderId,
          amountPaise: payment.amountPaise,
          decision,
          source,
        },
        'final_bill:payment_rejected'
      )
      return { kind: 'rejected', reason: decision }
  }
}

/**
 * The customer's bill on the customer's booking, or a 404 — for a bill that
 * does not exist, belongs to another booking, or is someone else's.
 */
async function getChargeForCustomer(userId: string, bookingId: string, chargeId: string) {
  const charge = await bookingChargesRepository.findCharge(chargeId)
  if (!charge || charge.bookingId !== bookingId) throw billNotFound()

  const booking = await bookingChargesRepository.findBooking(bookingId)
  if (!booking || booking.userId !== userId) throw billNotFound()

  return { charge, booking }
}

export const bookingChargesService = {
  /**
   * The bill that stands on a job, for the garage, with what it needs to
   * raise or replace one: what the customer already paid, and whether it can.
   */
  async getFinalBill(vendorId: string, bookingId: string, now = Date.now()) {
    const booking = await bookingChargesRepository.findBooking(bookingId)
    if (!booking || booking.vendorId !== vendorId) throw bookingNotFound()

    const live = await bookingChargesRepository.findLiveFinalBill(booking.id)
    const refusal = finalBillRefusal({
      status: booking.status,
      pricingTypes: pricingTypesOf(booking),
      completedAt: booking.completedAt,
      scheduledAt: booking.scheduledAt,
      now,
    })

    return {
      finalBill: live ? toFinalBillView(live) : null,
      paidBefore: creditAtBooking(booking),
      canRaise: refusal === null && live?.status !== 'paid',
    }
  },

  /**
   * Raises the final bill of an inspection job, replacing an unpaid one.
   *
   * `amount_due` is worked out here, from the payment as it stands, never
   * from the client: a bill that comes to no more than was paid is written as
   * 'not_needed', with nothing to pay and nothing refunded.
   */
  async raiseFinalBill(
    vendorId: string,
    actorId: string,
    bookingId: string,
    input: RaiseFinalBillInput,
    now = Date.now()
  ) {
    const booking = await bookingChargesRepository.findBooking(bookingId)
    if (!booking || booking.vendorId !== vendorId) throw bookingNotFound()

    const refusal = finalBillRefusal({
      status: booking.status,
      pricingTypes: pricingTypesOf(booking),
      completedAt: booking.completedAt,
      scheduledAt: booking.scheduledAt,
      now,
    })
    if (refusal) throw refusalError(refusal)

    const lines = input.lines.map((line) => ({
      description: line.description,
      amount: line.amount.toFixed(2),
    }))
    const totalAmount = finalBillTotal(lines)
    const paidBefore = creditAtBooking(booking)
    const amountDue = finalBillAmountDue(totalAmount, paidBefore)

    const result = await bookingChargesRepository.replaceFinalBill({
      bookingId: booking.id,
      totalAmount,
      paidBefore,
      amountDue,
      lines,
      note: input.note ?? null,
      status: finalBillStatus(amountDue),
      createdBy: actorId,
    })

    if (result.kind === 'locked') {
      throw new AppError(
        409,
        'The customer has already paid this bill, so it can no longer be changed.',
        'FINAL_BILL_PAID'
      )
    }
    if (result.kind === 'conflict') {
      throw new AppError(
        409,
        'Someone else just raised a bill for this job. Refresh to see it.',
        'BOOKING_STATE_CHANGED'
      )
    }

    const { charge, replaced } = result
    log.info(
      {
        bookingId: booking.id,
        vendorId,
        actorId,
        chargeId: charge.id,
        replacedId: replaced?.id,
        totalAmount,
        amountDue,
      },
      'final_bill:raised'
    )

    // Only a bill with something to pay is news to ops: the customer will
    // see a balance and may ring about it.
    if (charge.status === 'due') {
      alertOps({
        kind: 'final_bill_raised',
        booking,
        totalAmount,
        paidBefore,
        amountDue,
      })
    }

    return toFinalBillView(charge)
  },

  /**
   * Opens (or reopens) the Razorpay checkout for a bill's balance.
   *
   * One order per bill: the first is remembered and handed back on every
   * later tap, so a customer who closed the sheet and tries again pays the
   * same order, and two taps can never become two charges.
   */
  async payCharge(userId: string, bookingId: string, chargeId: string) {
    const { charge, booking } = await getChargeForCustomer(userId, bookingId, chargeId)

    if (booking.status === 'cancelled') {
      throw new AppError(
        400,
        'This booking was cancelled, so there is nothing to pay.',
        'BOOKING_CANCELLED'
      )
    }

    const assertPayable = (current: BookingChargeRecord) => {
      switch (current.status) {
        case 'paid':
          throw new AppError(409, 'This bill is already paid.', 'CHARGE_ALREADY_PAID')
        case 'cancelled':
          throw new AppError(
            409,
            'The garage has changed this bill. Refresh to see the new one.',
            'CHARGE_REPLACED'
          )
        case 'not_needed':
          throw new AppError(400, 'There is nothing more to pay on this bill.', 'CHARGE_NOT_DUE')
        case 'due':
          return
      }
    }

    const orderFor = (current: BookingChargeRecord, orderId: string) => ({
      bookingId: booking.id,
      chargeId: current.id,
      orderId,
      amount: toPaise(current.amountDue),
      currency: 'INR',
      keyId: razorpayKeyId(),
    })

    assertPayable(charge)
    if (charge.gatewayOrderId) return orderFor(charge, charge.gatewayOrderId)

    const order = await createRazorpayOrder({
      amount: charge.amountDue,
      receipt: charge.id,
      bookingId: booking.id,
      chargeId: charge.id,
    })

    const [saved] = await bookingChargesRepository.setGatewayOrderId(charge.id, order.orderId)
    if (saved) {
      log.info({ chargeId: charge.id, bookingId: booking.id, orderId: order.orderId }, 'final_bill:order_created')
      return orderFor(saved, order.orderId)
    }

    // A second tap opened its own order first, or the bill changed. Use the
    // one that was kept, if it is still payable.
    const fresh = await bookingChargesRepository.findCharge(charge.id)
    if (!fresh) throw billNotFound()
    assertPayable(fresh)
    if (!fresh.gatewayOrderId) throw billNotFound()
    return orderFor(fresh, fresh.gatewayOrderId)
  },

  /**
   * The app's confirmation after Razorpay reports the bill paid. Signature
   * first: an unverified caller must not be able to mark a bill paid.
   */
  async verifyChargePayment(
    userId: string,
    bookingId: string,
    chargeId: string,
    input: VerifyChargePaymentInput
  ) {
    const { charge } = await getChargeForCustomer(userId, bookingId, chargeId)

    const isValid = verifyPaymentSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    })
    if (!isValid) {
      log.warn({ chargeId, orderId: input.razorpayOrderId }, 'final_bill:invalid_signature')
      throw new AppError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
    }

    const outcome = await settleCaptured(
      charge,
      { orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId },
      'verify'
    )

    switch (outcome.kind) {
      case 'paid':
        return { bookingId, finalBill: toFinalBillView(outcome.charge) }
      case 'refund_due':
        throw new AppError(409, outcome.message, REFUND_DUE_CODE)
      case 'rejected':
        throw outcome.reason === 'order_mismatch'
          ? new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')
          : new AppError(400, 'There is nothing more to pay on this bill.', 'CHARGE_NOT_DUE')
    }
  },

  /**
   * The bill a Razorpay order was opened for, if any. For the webhook when a
   * payment arrives without its order's notes: the order id is then all
   * Razorpay gives us to go on, as for a booking intent.
   */
  async chargeIdForOrder(orderId: string): Promise<string | null> {
    const charge = await bookingChargesRepository.findChargeByOrderId(orderId)
    return charge?.id ?? null
  },

  /**
   * The webhook's half: a captured payment for a bill, named by its order's
   * notes or found by its order id (chargeIdForOrder).
   * The recovery path for a customer whose app never came back to confirm.
   * Every answer is final on redelivery, so it always reports handled.
   */
  async settleFromWebhook(params: {
    chargeId: string
    orderId: string | undefined
    paymentId: string
    amountPaise: number | undefined
  }) {
    const charge = await bookingChargesRepository.findCharge(params.chargeId)
    if (!charge) {
      log.error({ ...params }, 'final_bill:webhook_charge_not_found')
      return { handled: true }
    }

    try {
      const outcome = await settleCaptured(
        charge,
        { orderId: params.orderId, paymentId: params.paymentId, amountPaise: params.amountPaise },
        'webhook'
      )
      log.info({ chargeId: charge.id, outcome: outcome.kind }, 'final_bill:webhook_settled')
    } catch (err) {
      // Answers the same on every redelivery; the logs carry it from here.
      if (!(err instanceof AppError)) throw err
      log.error({ err, chargeId: charge.id }, 'final_bill:webhook_settle_failed')
    }
    return { handled: true }
  },
}
