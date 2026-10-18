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
import {
  EXTRA_WORK_MAX_OPEN,
  extraWorkPayable,
  extraWorkRefusal,
  openExtraWork,
  toExtraWorkView,
  type ExtraWorkRefusal,
} from '../../lib/extra-work.js'
import { isJobPhotoKey, jobPhotoFolder } from '../../lib/job-records.js'
import { logger } from '../../lib/logger.js'
import { createJobPhotoUpload, jobPhotoLink, storedJobPhotoUrl } from '../../lib/job-photo-storage.js'
import { alertOps } from '../../lib/ops-alerts.js'
import {
  customerExtraWorkRequested,
  garageExtraWorkDeclined,
  garageExtraWorkPaid,
} from '../../lib/push-messages.js'
import { pushService } from '../push/push.service.js'
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
  AskExtraWorkInput,
  ExtraWorkUploadUrlInput,
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

// The same three, for extra work (0041).
const EXTRA_WORK_CLOSED_MESSAGE =
  'This extra work was withdrawn or declined while you were paying, so this payment will be refunded.'
const EXTRA_WORK_CANCELLED_MESSAGE =
  'This booking was cancelled while you were paying for the extra work, so this payment will be refunded.'
const EXTRA_WORK_PAID_TWICE_MESSAGE =
  'This extra work was already paid, so this second payment will be refunded.'

/** The garage's words for why it can't ask for extra work on this job now. */
function extraWorkRefusalError(refusal: ExtraWorkRefusal) {
  switch (refusal) {
    case 'on_inspection':
      return new AppError(
        400,
        'This job is priced on inspection: add the extra work to the final bill instead.',
        'EXTRA_WORK_ON_INSPECTION'
      )
    case 'not_open':
      return new AppError(
        400,
        'Extra work can be asked for once you have accepted the job, and until it is completed.',
        'EXTRA_WORK_NOT_OPEN'
      )
    case 'too_many_open':
      return new AppError(
        409,
        `The customer already has ${EXTRA_WORK_MAX_OPEN} extra-work requests to answer. Wait for an answer, or withdraw one.`,
        'EXTRA_WORK_LIMIT_REACHED'
      )
  }
}

function extraWorkNotFound() {
  return new AppError(404, 'Extra work not found', 'CHARGE_NOT_FOUND')
}

/** A request already answered, paid or withdrawn when this one arrived. */
function extraWorkClosed() {
  return new AppError(
    409,
    'This extra work has already been answered or withdrawn. Refresh to see where it stands.',
    'EXTRA_WORK_CLOSED'
  )
}

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
        { chargeId: charge.id, bookingId: charge.bookingId, paymentId: payment.paymentId, source, kind: charge.kind },
        charge.kind === 'extra_work' ? 'extra_work:paid' : 'final_bill:paid'
      )
      // Paying is the approval: the garage's team can start on it (0044).
      if (charge.kind === 'extra_work') {
        pushService.notifyLater(async () => {
          const booking = await bookingChargesRepository.findBooking(charge.bookingId)
          return booking
            ? [{
                recipient: { audience: 'garage', vendorId: booking.vendorId },
                message: garageExtraWorkPaid(booking, settled.amountDue),
              }]
            : []
        })
      }
      alertOps(async () => {
        const booking = await bookingChargesRepository.findBooking(charge.bookingId)
        if (!booking) return null
        return charge.kind === 'extra_work'
          ? {
              kind: 'extra_work_paid',
              booking,
              description: settled.lines[0]?.description ?? 'Extra work',
              amount: settled.amountDue,
              paymentId: payment.paymentId,
            }
          : {
              kind: 'final_bill_paid',
              booking,
              amountDue: settled.amountDue,
              paymentId: payment.paymentId,
            }
      })
      return { kind: 'paid', charge: settled }
    }

    case 'replaced': {
      // A bill stops standing in two ways: the garage replaced it, or Detlio
      // cancelled the booking (which withdraws an unpaid bill). The refund is
      // the same; the words for the customer and for ops are not.
      const booking = await bookingChargesRepository.findBooking(charge.bookingId)
      const cancelled = booking?.status === 'cancelled'
      const extraWork = charge.kind === 'extra_work'
      const recorded = await bookingChargesRepository.recordPaymentOnReplacedBill({
        chargeId: charge.id,
        bookingId: charge.bookingId,
        paymentId: payment.paymentId,
        note: {
          author: 'Detlio (automatic)',
          body: extraWork
            ? cancelled
              ? `Payment ${payment.paymentId} (₹${charge.amountDue}) landed for extra work on a booking that was already cancelled. Refund it in Razorpay.`
              : `Payment ${payment.paymentId} (₹${charge.amountDue}) landed for extra work that had been withdrawn or declined. Refund it in Razorpay.`
            : cancelled
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
            what: charge.kind,
            booking,
            amount: charge.amountDue,
            paymentId: payment.paymentId,
          })
        }
      }
      if (extraWork) {
        return {
          kind: 'refund_due',
          message: cancelled ? EXTRA_WORK_CANCELLED_MESSAGE : EXTRA_WORK_CLOSED_MESSAGE,
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
          body: `Payment ${payment.paymentId} landed for ${charge.kind === 'extra_work' ? 'extra work' : 'a final bill'} that was already paid (by ${charge.gatewayPaymentId}). Refund this second payment in Razorpay.`,
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
                what: charge.kind,
                booking,
                amount: charge.amountDue,
                paymentId: payment.paymentId,
              }
            : null
        })
      }
      return {
        kind: 'refund_due',
        message: charge.kind === 'extra_work' ? EXTRA_WORK_PAID_TWICE_MESSAGE : PAID_TWICE_MESSAGE,
      }
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

    // Extra work is paid while the job is on (accepted or under way): the
    // garage can't complete it while a request waits, so this only refuses
    // a booking that moved or was cancelled meanwhile.
    if (charge.kind === 'extra_work' && !extraWorkPayable(booking.status)) {
      throw new AppError(
        400,
        'This booking is no longer on, so there is nothing to pay.',
        'EXTRA_WORK_NOT_OPEN'
      )
    }

    const assertPayable = (current: BookingChargeRecord) => {
      switch (current.status) {
        case 'paid':
          throw new AppError(
            409,
            current.kind === 'extra_work' ? 'This extra work is already paid.' : 'This bill is already paid.',
            'CHARGE_ALREADY_PAID'
          )
        case 'cancelled':
          throw current.kind === 'extra_work'
            ? extraWorkClosed()
            : new AppError(
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

    const [saved] = await bookingChargesRepository.setGatewayOrderId(
      charge.id,
      order.orderId,
      order.gatewayMode
    )
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
        return outcome.charge.kind === 'extra_work'
          ? { bookingId, extraWork: toExtraWorkView(outcome.charge, jobPhotoLink) }
          : { bookingId, finalBill: toFinalBillView(outcome.charge) }
      case 'refund_due':
        throw new AppError(409, outcome.message, REFUND_DUE_CODE)
      case 'rejected':
        throw outcome.reason === 'order_mismatch'
          ? new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')
          : new AppError(400, 'There is nothing more to pay on this bill.', 'CHARGE_NOT_DUE')
    }
  },

  // ─── Extra work (0041) ──────────────────────────────────────────────────────

  /**
   * A presigned upload for an extra-work photo, into the booking's job-photos
   * folder (the job photos' own path and rules: images only, re-encoded in
   * the browser first). Refused up front when no request could be made now.
   */
  async createExtraWorkUploadUrl(vendorId: string, bookingId: string, input: ExtraWorkUploadUrlInput) {
    const booking = await bookingChargesRepository.findBooking(bookingId)
    if (!booking || booking.vendorId !== vendorId) throw bookingNotFound()
    const refusal = extraWorkRefusal({
      status: booking.status,
      pricingTypes: pricingTypesOf(booking),
      openCount: 0,
    })
    if (refusal) throw extraWorkRefusalError(refusal)

    // The private bucket while it is on (lib/job-photo-storage.ts): the key
    // only, no address.
    return createJobPhotoUpload(vendorId, input.contentType, jobPhotoFolder(booking.id))
  },

  /**
   * "Ask for extra work": what, the price, photos and a note, waiting for the
   * customer to approve by paying (or to decline). Never on an inspection
   * job, whose final bill covers whatever the inspection finds.
   */
  async askExtraWork(vendorId: string, actorId: string, bookingId: string, input: AskExtraWorkInput) {
    const booking = await bookingChargesRepository.findBooking(bookingId)
    if (!booking || booking.vendorId !== vendorId) throw bookingNotFound()

    const charges = await bookingChargesRepository.listExtraWork(booking.id)
    const refusal = extraWorkRefusal({
      status: booking.status,
      pricingTypes: pricingTypesOf(booking),
      openCount: openExtraWork(charges).length,
    })
    if (refusal) throw extraWorkRefusalError(refusal)

    const keys = [...new Set(input.photoKeys)]
    if (keys.some((key) => !isJobPhotoKey(key, vendorId, booking.id))) {
      throw new AppError(400, 'That upload is not for this job', 'INVALID_JOB_PHOTO_KEY')
    }

    const amount = input.amount.toFixed(2)
    const result = await bookingChargesRepository.insertExtraWork(
      {
        bookingId: booking.id,
        totalAmount: amount,
        amountDue: amount,
        lines: [{ description: input.description, amount }],
        note: input.note ?? null,
        photos: keys.map((key) => ({ storageKey: key, url: storedJobPhotoUrl(key) })),
        createdBy: actorId,
      },
      EXTRA_WORK_MAX_OPEN
    )
    if (result.kind === 'state_changed') throw extraWorkRefusalError('not_open')
    if (result.kind === 'too_many') throw extraWorkRefusalError('too_many_open')

    log.info(
      { bookingId: booking.id, vendorId, actorId, chargeId: result.charge.id, amount, photos: keys.length },
      'extra_work:asked'
    )
    // The amount, never the garage's description of the work (0044).
    pushService.notifyCustomer(booking.userId, customerExtraWorkRequested(booking, result.charge.amountDue))
    return toExtraWorkView(result.charge, jobPhotoLink)
  },

  /** The garage takes back a request the customer has not paid. */
  async withdrawExtraWork(vendorId: string, bookingId: string, chargeId: string) {
    const booking = await bookingChargesRepository.findBooking(bookingId)
    if (!booking || booking.vendorId !== vendorId) throw bookingNotFound()
    const charge = await bookingChargesRepository.findCharge(chargeId)
    if (!charge || charge.bookingId !== booking.id || charge.kind !== 'extra_work') throw extraWorkNotFound()
    if (charge.status === 'paid') {
      throw new AppError(
        409,
        'The customer has already paid for this extra work, so it can no longer be withdrawn.',
        'EXTRA_WORK_PAID'
      )
    }

    const [closed] = await bookingChargesRepository.closeExtraWork({
      chargeId: charge.id,
      bookingId: booking.id,
      reason: 'withdrawn',
      at: new Date(),
    })
    if (!closed) {
      const fresh = await bookingChargesRepository.findCharge(charge.id)
      if (fresh?.status === 'paid') {
        throw new AppError(
          409,
          'The customer has just paid for this extra work, so it can no longer be withdrawn.',
          'EXTRA_WORK_PAID'
        )
      }
      throw extraWorkClosed()
    }
    log.info({ bookingId: booking.id, vendorId, chargeId: charge.id }, 'extra_work:withdrawn')
    return toExtraWorkView(closed, jobPhotoLink)
  },

  /**
   * The customer declines extra work. The garage sees it declined; ops is
   * told. A payment already on its way for it lands on a closed request and
   * is refunded (settleCaptured).
   */
  async declineExtraWork(userId: string, bookingId: string, chargeId: string) {
    const { charge, booking } = await getChargeForCustomer(userId, bookingId, chargeId)
    if (charge.kind !== 'extra_work') throw billNotFound()
    if (charge.status !== 'due') throw extraWorkClosed()

    const [closed] = await bookingChargesRepository.closeExtraWork({
      chargeId: charge.id,
      bookingId: booking.id,
      reason: 'declined',
      at: new Date(),
    })
    if (!closed) throw extraWorkClosed()

    log.info({ bookingId: booking.id, userId, chargeId: charge.id }, 'extra_work:declined')
    alertOps({
      kind: 'extra_work_declined',
      booking,
      description: closed.lines[0]?.description ?? 'Extra work',
      amount: closed.amountDue,
    })
    pushService.notifyGarage(booking.vendorId, garageExtraWorkDeclined(booking, closed.amountDue))
    return toExtraWorkView(closed, jobPhotoLink)
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
