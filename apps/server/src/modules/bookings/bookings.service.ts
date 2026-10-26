import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { createThrottle } from '../../lib/throttle.js'
import {
  computeAvailableSlots,
  dayStatus,
  getDateKeyFromScheduledAt,
  getDayOfWeekFromDate,
  hasCapacity,
  isScheduledAtAvailable,
  meetsMinNotice,
  minNoticeMessage,
} from '../../lib/slots.js'
import { computeServiceAmount, sumAmounts } from '../../lib/pricing.js'
import { usesCustomerAddress, type BookingType } from '../../lib/booking-types.js'
import {
  MAX_CODE_ATTEMPTS,
  bookingTypeFee,
  checkHandoverCode,
  codeTriesLeft,
  completeRefusal,
  customerChangeRefusal,
  isPickupOffered,
  newHandoverCodes,
  nextPickupStep,
  pickupStepRefusal,
  type PickupNext,
} from '../../lib/pickup.js'
import { computeVendorPayout } from '../../lib/discounts.js'
import {
  creditAtBooking,
  finalBillRefusal,
  liveFinalBill,
  toFinalBillView,
  type FinalBillRecord,
} from '../../lib/final-bill.js'
import { customerRefund, type CustomerRefundRecord } from '../../lib/refunds.js'
import {
  latestProposal,
  proposalRefusal,
  toProposalView,
  type ProposalRecord,
} from '../../lib/time-proposals.js'
import {
  completionBlockedByExtraWork,
  extraWorkRefusal,
  extraWorkViews,
  openExtraWork,
} from '../../lib/extra-work.js'
import { buildReceipt, receiptAvailability, receiptIssuedAt } from '../../lib/receipts.js'
import { responseDeadlineView } from '../../lib/response-deadline.js'
import { contactWindow } from '../../lib/contact-window.js'
import { assertCanStillAnswer } from '../garage-response/garage-response.rules.js'
import {
  customerSeesPhotos,
  toJobPhotoView,
  type JobPhotoStage,
} from '../../lib/job-records.js'
import { jobPhotoLink } from '../../lib/job-photo-storage.js'
import {
  GATE_STAGE,
  MIN_GARAGE_PHOTOS,
  customerPhotoWindowsView,
  garagePhotoStandardView,
  garageSeesCustomerPhotos,
  photoGateMessage,
  photoGateRefusal,
  type PhotoGateStep,
} from '../../lib/job-photo-standards.js'
import { jobPhotosRequiredFor } from '../job-photos/job-photos.service.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { discountsService } from '../discounts/discounts.service.js'
import { membersRepository } from '../members/members.repository.js'
import { isInBin } from '../vendors/vendors.predicates.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import type {
  BookingDiscount,
  GarageRefusal,
  HandoverCodeKind,
  ReceiptNumberAllocation,
} from './bookings.repository.js'
import { refundsService } from '../refunds/refunds.service.js'
import * as pushMessages from '../../lib/push-messages.js'
import { pushService } from '../push/push.service.js'
import { rewardsService } from '../rewards/rewards.service.js'
import { carHistoryService } from '../car-history/car-history.service.js'
import { guaranteeService } from '../guarantee/guarantee.service.js'
import { slotAlertsService } from '../slot-alerts/slot-alerts.service.js'
import { bookingsRepository } from './bookings.repository.js'

const log = logger.child({ module: 'bookings' })

/** Refuses a booking that starts too soon for its type (1h at the garage, 3h doorstep or pickup). */
function assertMinNotice(scheduledAt: Date, bookingType: BookingType) {
  if (!meetsMinNotice(scheduledAt, bookingType)) {
    throw new AppError(400, minNoticeMessage(bookingType), 'SLOT_TOO_SOON')
  }
}

// The three ways a garage can turn a time down that are about the garage, not
// the customer's request. Shared by the pre-payment checks and the refusals
// that come back from the write transaction, so the customer reads the same
// words whichever one caught it.
function garagePaused() {
  return new AppError(
    409,
    "This garage isn't taking new bookings right now. Please pick another garage.",
    'GARAGE_PAUSED'
  )
}

// The same refusal for a booking the customer already has. "Pick another
// garage" is not something a reschedule can do, and their booking is not new:
// what they can do is keep it as it is or cancel it.
function garagePausedForChange() {
  return new AppError(
    409,
    "This garage isn't taking changes right now. Your booking stays at its current time, or you can cancel it.",
    'GARAGE_PAUSED'
  )
}

function garageClosedThatDay() {
  return new AppError(
    400,
    'This garage is closed on that day. Please pick another day.',
    'GARAGE_CLOSED_THAT_DAY'
  )
}

function slotFull() {
  return new AppError(
    409,
    'That time has just been booked up at this garage. Please pick another time.',
    'SLOT_FULL'
  )
}

function garageRefusalError(refusal: GarageRefusal) {
  switch (refusal) {
    case 'paused':
      return garagePaused()
    case 'closed':
      return garageClosedThatDay()
    case 'slot_full':
      return slotFull()
  }
}

/**
 * The photo standard's gate for a job step (0045): throws the garage's words
 * ("Add 2 before photos to start.") when the job cannot take it, and
 * otherwise answers the guard its conditional write carries while the
 * standard is on (undefined while off).
 */
function assertPhotoGate(
  booking: BookingWithRelations & { vendorId: string },
  step: PhotoGateStep,
  options: { forDetlio?: boolean } = {}
) {
  const required = jobPhotosRequiredFor(booking.vendorId)
  const stage = GATE_STAGE[step]
  const refusal = photoGateRefusal({
    step,
    required,
    waived: booking.photosWaivedAt != null,
    garagePhotoCount: (booking.photos ?? []).filter(
      (photo) => photo.stage === stage && (photo.uploadedByRole ?? 'garage') === 'garage'
    ).length,
  })
  if (refusal) {
    throw new AppError(
      409,
      options.forDetlio
        ? `The garage has not added its ${stage} photos (${MIN_GARAGE_PHOTOS} needed). Ask it to, or waive the photos for this booking first.`
        : photoGateMessage(refusal),
      'JOB_PHOTOS_REQUIRED'
    )
  }
  return required ? { stage, min: MIN_GARAGE_PHOTOS } : undefined
}

/**
 * A conditional write that carried a photo guard came back empty: if the
 * photos are why (one removed in between), say so; otherwise the booking
 * changed some other way.
 */
async function photoGateOrStateChanged(bookingId: string, step: PhotoGateStep): Promise<never> {
  const fresh = await bookingsRepository.findBookingById(bookingId)
  if (fresh) assertPhotoGate(fresh, step)
  throw stateChanged()
}

/** Someone else changed the booking between our read and our write. */
function stateChanged() {
  return new AppError(
    409,
    'This booking was just updated by someone else. Refresh to see its latest status.',
    'BOOKING_STATE_CHANGED'
  )
}

/** Refuses a pickup & drop step the job is not waiting for (lib/pickup.ts). */
function assertPickupStep(booking: BookingWithRelations, step: PickupNext) {
  const refusal = pickupStepRefusal(pickupJobOf(booking), step)
  if (refusal) throw new AppError(refusal.status, refusal.message, refusal.code)
}

/** The facts lib/pickup.ts reads off a booking row. */
function pickupJobOf(booking: BookingWithRelations) {
  return {
    bookingType: booking.bookingType,
    status: booking.status,
    pickedUpAt: booking.pickedUpAt ?? null,
    atGarageAt: booking.atGarageAt ?? null,
    outForDeliveryAt: booking.outForDeliveryAt ?? null,
    deliveredAt: booking.deliveredAt ?? null,
  }
}

const CODE_NAMES: Record<HandoverCodeKind, string> = {
  pickup: 'pickup code',
  delivery: 'delivery code',
}

function codeLocked(kind: HandoverCodeKind) {
  return new AppError(
    409,
    `Too many wrong tries for the ${CODE_NAMES[kind]}. Call Detlio support: we can confirm the handover once we have spoken to the customer.`,
    'HANDOVER_CODE_LOCKED'
  )
}

/**
 * Checks the code the garage typed against the customer's, counting a wrong
 * one. Throws unless it matches; the caller then writes the step under the
 * same cap, so a guess racing a lock-out cannot slip through.
 */
async function assertHandoverCode(
  booking: BookingWithRelations & { id: string },
  kind: HandoverCodeKind,
  given: string
) {
  const check = checkHandoverCode({
    expected: (kind === 'pickup' ? booking.pickupCode : booking.deliveryCode) ?? null,
    given,
    attempts: (kind === 'pickup' ? booking.pickupCodeAttempts : booking.deliveryCodeAttempts) ?? 0,
  })
  if (check === 'ok') return
  if (check === 'locked') throw codeLocked(kind)
  if (check === 'missing') {
    throw new AppError(
      409,
      `This booking has no ${CODE_NAMES[kind]}. Call Detlio support to confirm the handover.`,
      'HANDOVER_CODE_MISSING'
    )
  }

  const attempts = await bookingsRepository.recordWrongCode(booking.id, kind, MAX_CODE_ATTEMPTS)
  log.warn({ bookingId: booking.id, kind, attempts }, 'booking:handover_code_wrong')
  if (attempts === null || attempts >= MAX_CODE_ATTEMPTS) throw codeLocked(kind)
  const left = codeTriesLeft(attempts)
  throw new AppError(
    400,
    `That code doesn't match. Ask the customer for the 4-digit ${CODE_NAMES[kind]} in their Detlio app. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
    'HANDOVER_CODE_WRONG'
  )
}

// A numbering failure that outlasts a retry (a counter set behind the numbers
// by hand, a migration not applied) fails every payment and every receipt
// view the same way, so the first alert says everything the rest would.
const RECEIPT_ALERT_QUIET_MINUTES = 10
const receiptAlertDue = createThrottle(RECEIPT_ALERT_QUIET_MINUTES * 60_000)

/**
 * Says so, loudly, when a receipt number could not be issued (see
 * allocateReceiptNumber): logged, and sent to ops, because the receipt page
 * cannot open without a number and the causes that outlast a retry need a
 * person to fix them. The payment stands either way.
 *
 * Shared by every path a booking's payment goes through on, and by the
 * receipt read when its own try fails.
 */
export function logReceiptNumberFailure(
  receipt: ReceiptNumberAllocation | null | undefined,
  bookingId: string
) {
  if (receipt?.kind !== 'failed') return
  log.error({ err: receipt.error, bookingId }, 'receipt:number_failed')

  if (receiptAlertDue()) {
    alertOps({
      kind: 'receipt_number_failed',
      bookingId,
      errorMessage: databaseErrorMessage(receipt.error),
      quietMinutes: RECEIPT_ALERT_QUIET_MINUTES,
    })
  }
}

/**
 * Postgres's own words for a failed query. Drizzle wraps them in "Failed
 * query: <the SQL> params: …", which is longer and says less.
 */
function databaseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  return error.cause instanceof Error ? error.cause.message : error.message
}

// Once the garage has accepted, customers must cancel or reschedule at least
// this far ahead of the time. Before it accepts, they can do either any time:
// nobody has committed to the slot yet.
const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000
// A booking may be rescheduled at most this many times across its chain.
// Mirrored in packages/core/src/booking-types.ts (the legal pages print it).
const MAX_RESCHEDULES = 2
import { paise, rupees } from '../../lib/gift-credit.js'
import type { PaymentRecord } from './bookings.repository.js'
import type {
  CreateBookingInput,
  ListMyBookingsQuery,
  ListVendorBookingsQuery,
} from './bookings.validation.js'

type BookingWithRelations = {
  id: string
  status: string
  bookingType: string
  scheduledAt: Date
  durationMins?: number | null
  amount: string
  subtotalAmount?: string | null
  discountAmount?: string | null
  discountCode?: string | null
  discountFundedBy?: 'platform' | 'vendor' | null
  paymentMethod: string
  lat: number | null
  lng: number | null
  address: string | null
  cancelledBy?: string | null
  cancellationReason?: string | null
  cancelledAt?: Date | null
  cancelledOnBehalfOf?: string | null
  noShow?: string | null
  originalBookingId?: string | null
  rescheduledFromId?: string | null
  rescheduleCount?: number | null
  acceptedAt?: Date | null
  startedAt?: Date | null
  completedAt?: Date | null
  // Pickup & drop (0037); null on every other type.
  pickedUpAt?: Date | null
  atGarageAt?: Date | null
  outForDeliveryAt?: Date | null
  deliveredAt?: Date | null
  pickupCode?: string | null
  deliveryCode?: string | null
  pickupCodeAttempts?: number
  deliveryCodeAttempts?: number
  // The garage's deadline to answer, and whether it was cancelled for
  // missing it (0042). Optional so a hand-built row still type-checks.
  respondBy?: Date | null
  responseMissedAt?: Date | null
  // The garage the booking is with, and whether Detlio waived its photo
  // standard on it (0045). Optional so a hand-built row still type-checks.
  vendorId?: string
  photosWaivedAt?: Date | null
  // Detlio Guarantee (0051): a free redo of an earlier job, and a refund
  // Detlio approved instead of a redo. Optional so a hand-built row still
  // type-checks.
  guaranteeRedo?: boolean
  guaranteeRefundAt?: Date | null
  createdAt: Date
  review?: {
    id: string
    rating: number
    comment: string | null
    createdAt: Date
  } | null
  user?: {
    id: string
    name: string
    phone: string
  } | null
  vendor?: {
    id: string
    businessName: string
    phone: string
    city: string
    address: string
    lat: number | null
    lng: number | null
    whatsapp: string | null
    // Optional so a hand-built row (tests, older reads) still type-checks.
    mapsUrl?: string | null
  } | null
  service?: {
    id: string
    name: string
    category: string
    pricingType: string
    durationMins: number
  } | null
  items?: Array<{
    id: string
    serviceId: string
    name: string
    amount: string
    durationMins: number
    sortOrder: number
    // The service's pricing type, when the read joined it (BOOKING_ITEMS).
    service?: { pricingType: string } | null
  }> | null
  // Loaded only where one job is shown in full (JOB_RECORDS in the
  // repository). Absent from lists, and then absent from the payload too —
  // an empty list there would claim the job has none.
  photos?: Array<{
    id: string
    stage: JobPhotoStage
    url: string
    createdAt: Date
    // 0045: whose photo, and the guided angle. Optional for hand-built rows.
    uploadedByRole?: string | null
    angle?: string | null
  }>
  // Final bills and extra work (0041) alike; the mappers pick each out.
  charges?: Array<
    FinalBillRecord & {
      photos?: Array<{ storageKey: string; url: string }>
      cancelledAt?: Date | null
      cancelReason?: string | null
    }
  >
  // The garage's time suggestions (0041), newest first, with JOB_RECORDS.
  timeProposals?: ProposalRecord[]
  vehicle?: {
    id: string
    make: string
    model: string
    licensePlate: string | null
    vehicleType: string
  } | null
  payment?: PaymentRecord | null
}

function toPaymentResponse(payment: PaymentRecord | null | undefined) {
  if (!payment) {
    return null
  }

  return {
    id: payment.id,
    gateway: payment.gateway,
    gatewayTxnId: payment.gatewayTxnId,
    // What came through Razorpay; with Detlio credit (0049) the rest is
    // `creditAmount`, and the two together are the booking's `amount`.
    amount: payment.amount,
    creditAmount: rupees(paise(payment.creditAmount)),
    // When the credit part went back to the customer's credit (cancelled).
    creditReturnedAt: payment.creditReturnedAt ? new Date(payment.creditReturnedAt).toISOString() : null,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  }
}

/** The four handover steps of a pickup & drop job, as ISO times. */
function pickupStepTimes(booking: BookingWithRelations) {
  return {
    pickedUpAt: booking.pickedUpAt?.toISOString() ?? null,
    atGarageAt: booking.atGarageAt?.toISOString() ?? null,
    outForDeliveryAt: booking.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: booking.deliveredAt?.toISOString() ?? null,
  }
}

const LIVE_STATUSES = new Set(['pending', 'confirmed', 'in_progress'])

/**
 * The customer's view of a pickup & drop job: the steps, and the two codes
 * they give the garage — each only while it is still to be used, and none
 * once the booking is no longer on. Only this mapper ever reads the codes;
 * the garage's and admin's shapes are built without them.
 */
function customerPickupView(booking: BookingWithRelations) {
  if (booking.bookingType !== 'pickup') return null
  const live = LIVE_STATUSES.has(booking.status)
  return {
    ...pickupStepTimes(booking),
    pickupCode: live && !booking.pickedUpAt ? (booking.pickupCode ?? null) : null,
    deliveryCode: live && !booking.deliveredAt ? (booking.deliveryCode ?? null) : null,
  }
}

/**
 * The garage's view: the steps, what the job is waiting for (so the portal
 * shows one button and never restates the order), and the tries left on
 * each code. Never the codes themselves.
 */
function vendorPickupView(booking: BookingWithRelations) {
  if (booking.bookingType !== 'pickup') return null
  return {
    ...pickupStepTimes(booking),
    nextStep: nextPickupStep(pickupJobOf(booking)),
    pickupCodeTriesLeft: codeTriesLeft(booking.pickupCodeAttempts ?? 0),
    deliveryCodeTriesLeft: codeTriesLeft(booking.deliveryCodeAttempts ?? 0),
  }
}

function finalBillOf(charges: FinalBillRecord[]) {
  const bill = liveFinalBill(charges)
  return bill ? toFinalBillView(bill) : null
}

/**
 * The customer's shape of a booking. `moved` is whether they moved it to a
 * new time (another booking was rescheduled from it): its payment went with
 * it, so it is never shown as money owed back. False wherever the caller has
 * just written the booking, which cannot have been moved yet.
 */
export function toBookingResponse(
  booking: BookingWithRelations,
  moved = false,
  refundRecords: readonly CustomerRefundRecord[] = []
) {
  // The contact window (lib/contact-window.ts): the garage's phone and
  // WhatsApp ride on the customer's booking only from 2 hours before the
  // slot until the job is done (plus an hour), and never on a cancelled
  // one. The garage's mapper below applies the same window to the
  // customer's phone.
  const window = contactWindow(booking, new Date())
  return {
    id: booking.id,
    status: booking.status,
    bookingType: booking.bookingType,
    scheduledAt: booking.scheduledAt.toISOString(),
    amount: booking.amount,
    // Pre-discount price, what came off, and who paid for it. `amount` stays
    // the figure actually charged, so every existing consumer is unaffected.
    subtotalAmount: booking.subtotalAmount ?? booking.amount,
    discountAmount: booking.discountAmount ?? '0.00',
    discountCode: booking.discountCode ?? null,
    discountFundedBy: booking.discountFundedBy ?? null,
    // What the garage is owed — the full price when Detlio funded the
    // discount, the discounted price when the garage did. Computed here so the
    // web Earnings screen never has to know the rule.
    vendorPayoutAmount: computeVendorPayout({
      amount: booking.amount,
      subtotalAmount: booking.subtotalAmount ?? booking.amount,
      discountFundedBy: booking.discountFundedBy ?? null,
    }),
    paymentMethod: booking.paymentMethod,
    lat: booking.lat,
    lng: booking.lng,
    address: booking.address,
    cancelledBy: booking.cancelledBy ?? null,
    cancellationReason: booking.cancellationReason ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    // Set only when Detlio cancelled it ('admin'): whose call it was, and
    // whether it was a no-show. Both decide what the customer and the garage
    // are told — a customer no-show keeps the payment, a garage no-show is
    // refunded. The ops team's internal notes are never part of this payload.
    cancelledOnBehalfOf: booking.cancelledOnBehalfOf ?? null,
    noShow: booking.noShow ?? null,
    originalBookingId: booking.originalBookingId ?? null,
    rescheduledFromId: booking.rescheduledFromId ?? null,
    rescheduleCount: booking.rescheduleCount ?? 0,
    remainingReschedules: Math.max(0, MAX_RESCHEDULES - (booking.rescheduleCount ?? 0)),
    maxReschedules: MAX_RESCHEDULES,
    // When each step happened. Null until it does, and on jobs from before
    // these were recorded.
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    startedAt: booking.startedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    // Pickup & drop only (null on every other type): the handover steps and
    // the customer's codes. See customerPickupView; the garage's mapper
    // replaces this with its own view.
    pickup: customerPickupView(booking),
    // The garage's deadline to answer (0042), for the garage's countdown and
    // the customer's "by 10:42 am", with whether it is enforced
    // (AUTO_CANCEL_UNANSWERED) so neither app promises a cancellation the
    // server won't make. Null when the booking has none.
    responseDeadline: responseDeadlineView(booking, {
      enforced: env.autoCancelUnanswered,
      windowMins: env.garageResponseMinutes,
    }),
    // Cancelled by the cron because the garage did not answer in time:
    // "Not accepted in time", refunded in full.
    notAcceptedInTime: Boolean(booking.responseMissedAt),
    // When the other side's number shows: both apps explain a hidden number
    // from this ("shows 2 hours before…", "hidden after the job").
    contactWindow: window,
    // A free redo of an earlier job (Detlio Guarantee, 0051): ₹0, no
    // receipt. The garage's job card and the customer's page both flag it.
    guaranteeRedo: Boolean(booking.guaranteeRedo),
    createdAt: booking.createdAt.toISOString(),
    review: booking.review
      ? {
          id: booking.review.id,
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt.toISOString(),
        }
      : null,
    user: booking.user
      ? {
          id: booking.user.id,
          name: booking.user.name,
          phone: booking.user.phone,
        }
      : null,
    // Where the garage is and how to reach it: the customer's booking page
    // gives directions and a call/WhatsApp button from these. This is the
    // only place a customer gets them (owner decision, 17 Oct 2026): the
    // public garage page (GET /vendors/:id, vendors.public.ts) carries no
    // phone, WhatsApp, street address or maps link, so a customer reaches the
    // garage through a booking, not around one. Every caller of this mapper
    // serves the booking's own customer (or, via toVendorBookingResponse, the
    // garage itself). The phone and WhatsApp are null outside the contact
    // window (owner decision, 18 Oct 2026); the address, pin and maps link
    // always stay, since the customer plans the trip from them.
    vendor: booking.vendor
      ? {
          id: booking.vendor.id,
          businessName: booking.vendor.businessName,
          phone: window.open ? booking.vendor.phone : null,
          city: booking.vendor.city,
          address: booking.vendor.address,
          lat: booking.vendor.lat,
          lng: booking.vendor.lng,
          whatsapp: window.open ? booking.vendor.whatsapp : null,
          // The garage's own Google Maps link, for directions when it has
          // no pin (the Directions sheet checks it is a Maps link).
          mapsUrl: booking.vendor.mapsUrl ?? null,
        }
      : null,
    // The services this booking is for, in the order they were picked, with
    // the name and price as sold. Every consumer that shows more than one
    // service reads this.
    items: (booking.items ?? []).map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      name: item.name,
      amount: item.amount,
      durationMins: item.durationMins,
      // How the service is priced today. An inspection job says what the
      // customer prepaid was a fee, not the whole price.
      pricingType: item.service?.pricingType ?? null,
    })),
    durationMins:
      booking.durationMins ??
      (booking.items ?? []).reduce((total, item) => total + item.durationMins, 0),
    // Deprecated: the first item, kept so clients that predate `items` keep
    // rendering something correct for a single-service booking. Remove once
    // they have all moved over.
    service: booking.service
      ? {
          id: booking.service.id,
          name: booking.service.name,
          category: booking.service.category,
          pricingType: booking.service.pricingType,
          durationMins: booking.service.durationMins,
        }
      : null,
    vehicle: booking.vehicle
      ? {
          id: booking.vehicle.id,
          make: booking.vehicle.make,
          model: booking.vehicle.model,
          licensePlate: booking.vehicle.licensePlate,
          vehicleType: booking.vehicle.vehicleType,
        }
      : null,
    payment: toPaymentResponse(booking.payment),
    // Whether money is owed back on this booking or has gone back, how much,
    // and when (lib/refunds.ts): what the booking page tells the customer
    // about their refund. No refund ids, notes or who did it. Never 'owed' on
    // a customer no-show, which keeps the payment.
    refund: customerRefund({
      status: booking.status,
      noShow: (booking.noShow as 'customer' | 'garage' | null | undefined) ?? null,
      moved,
      // A refund instead of a free redo (0051).
      guaranteeRefund: Boolean(booking.guaranteeRefundAt),
      payment: booking.payment,
      charges: booking.charges,
    }, refundRecords),
    // Whether GET /bookings/:id/receipt has a receipt to give: the booking
    // page offers "View receipt" from this, so the rule lives in one place
    // (lib/receipts.ts) rather than being re-derived from the payment status.
    receiptAvailable:
      receiptAvailability({
        status: booking.status,
        moved,
        payment: booking.payment,
        guaranteeRedo: booking.guaranteeRedo,
      }) === 'available',
    // Whether the customer moved this booking to a new time. A move cancels
    // the old row, and the customer's list leaves it out: the booking they
    // have is the new one, which carries the payment.
    moved,
    // The customer sees the garage's photos once the work has started, next
    // to the step that says so (see customerSeesPhotos), and their own
    // photos of the car always (0045). `conditionPhotos` says when they can
    // add theirs.
    ...(booking.photos !== undefined && {
      photos: booking.photos
        .filter((photo) => photo.uploadedByRole === 'customer' || customerSeesPhotos(booking.status))
        .map((photo) => toJobPhotoView(photo, jobPhotoLink)),
      conditionPhotos: customerPhotoWindowsView(photoStandardJob(booking), Date.now()),
    }),
    // The final bill of an inspection job, if the garage has raised one: the
    // one that stands, not any it replaced.
    // `paidAtBooking` is what the booking already covers toward a bill (its
    // pre-discount price once paid; see creditAtBooking): the garage's form
    // shows it before there is a bill to read it from.
    ...(booking.charges !== undefined && {
      finalBill: finalBillOf(booking.charges),
      paidAtBooking: creditAtBooking(booking),
      // Extra work the garage asked for (0041), newest first, whatever
      // became of each: what, how much, the photos and where it stands.
      extraWork: extraWorkViews(booking.charges, jobPhotoLink),
    }),
    // The garage's suggested times (0041): the live suggestion while it can
    // be answered, or how the last one ended. Null when there never was one.
    ...(booking.timeProposals !== undefined && {
      timeProposal: proposalViewOf(booking),
    }),
  }
}

/** The facts the photo standard reads (0045), from a booking with its photos. */
function photoStandardJob(booking: BookingWithRelations) {
  return {
    status: booking.status,
    bookingType: booking.bookingType,
    scheduledAt: booking.scheduledAt,
    completedAt: booking.completedAt ?? null,
    pickedUpAt: booking.pickedUpAt ?? null,
    outForDeliveryAt: booking.outForDeliveryAt ?? null,
    photosWaivedAt: booking.photosWaivedAt ?? null,
    photos: booking.photos ?? [],
  }
}

function proposalViewOf(booking: BookingWithRelations) {
  const proposal = latestProposal(booking.timeProposals)
  return proposal
    ? toProposalView(proposal, { status: booking.status, bookingType: booking.bookingType as BookingType }, Date.now())
    : null
}

/** The pricing types of a booking's services, as BOOKING_ITEMS reads them. */
function pricingTypesOf(booking: BookingWithRelations): string[] {
  return (booking.items ?? []).flatMap((item) =>
    item.service?.pricingType ? [item.service.pricingType] : []
  )
}

/**
 * The vendor-facing shape of a booking. Two mappers for two audiences, not one
 * mapper with a role flag: the vendor payload has a single fixed shape whatever
 * the caller's role, which is easier to type on the client and impossible to get
 * wrong per request.
 *
 * What is missing is the whole point. `vendorPayoutAmount`, `subtotalAmount`,
 * `discountAmount` and `discountFundedBy` had no vendor-side consumer left once
 * the earnings computation moved server-side, so they are simply absent — and a
 * field that is never serialized cannot be forgotten about on a new endpoint.
 *
 * `amount` and `paymentMethod` stay: a cash booking goes pending → collected at
 * completion, so whoever finishes the job has to know what to collect.
 */
export function toVendorBookingResponse(booking: BookingWithRelations) {
  const {
    vendorPayoutAmount: _payout,
    subtotalAmount: _subtotal,
    discountAmount: _discountAmount,
    discountFundedBy: _fundedBy,
    // What the customer gets back is between them and Detlio.
    refund: _refund,
    // So is the customer's receipt.
    receiptAvailable: _receiptAvailable,
    // Never worked out for the garage (always false here), so not sent rather
    // than sent wrong. The garage's card says a job was moved from the new
    // booking's `rescheduledFromId`.
    moved: _moved,
    // The customer's pickup view carries the handover codes, which the
    // garage must get from the customer, never from us.
    pickup: _customerPickup,
    // When the customer may add their own photos is theirs to read.
    conditionPhotos: _conditionPhotos,
    ...vendorView
  } = toBookingResponse(booking)

  // How the customer paid is between them and Detlio (0049): the garage sees
  // the payment as it always did, the whole amount paid, with no split
  // between Razorpay and Detlio credit (it is paid the same either way).
  const { creditAmount: _creditAmount, creditReturnedAt: _creditReturnedAt, ...garagePayment } =
    vendorView.payment ?? { creditAmount: null, creditReturnedAt: null }
  const payment = vendorView.payment
    ? { ...garagePayment, amount: rupees(paise(vendorView.payment.amount) + paise(vendorView.payment.creditAmount)) }
    : null

  return {
    ...vendorView,
    payment,
    // The customer's name always; their phone only inside the contact
    // window (lib/contact-window.ts, the same window the customer's payload
    // applies to the garage's number). `contactWindow` says when it shows.
    user: vendorView.user
      ? { ...vendorView.user, phone: vendorView.contactWindow.open ? vendorView.user.phone : null }
      : null,
    // The garage's own row: its own phone and WhatsApp are no secret from
    // it, so the window that hides them from customers does not apply.
    vendor:
      vendorView.vendor && booking.vendor
        ? { ...vendorView.vendor, phone: booking.vendor.phone, whatsapp: booking.vendor.whatsapp }
        : vendorView.vendor,
    pickup: vendorPickupView(booking),
    // The garage sees every photo of the job, its own and, once it has
    // accepted the job, the customer's (0045: both sides share one record) —
    // the customer's view of the garage's waits for the work to start. `photoStandard` is what Start
    // and Complete wait for (lib/job-photo-standards.ts), so the portal never
    // restates the rule.
    ...(booking.photos !== undefined && {
      photos: booking.photos
        .filter((photo) => photo.uploadedByRole !== 'customer' || garageSeesCustomerPhotos(booking))
        .map((photo) => toJobPhotoView(photo, jobPhotoLink)),
      photoStandard: garagePhotoStandardView(
        photoStandardJob(booking),
        jobPhotosRequiredFor(booking.vendorId ?? booking.vendor?.id ?? ''),
        Date.now()
      ),
    }),
    // Whether the job card offers "Raise final bill" now. Worked out here so
    // the portal never restates the rules (lib/final-bill.ts). The bill
    // itself (`finalBill`) is not payout money: it is what the garage asked
    // the customer for, and whoever raised it has to see where it stands.
    ...(booking.charges !== undefined && {
      canRaiseFinalBill:
        finalBillRefusal({
          status: booking.status,
          pricingTypes: pricingTypesOf(booking),
          completedAt: booking.completedAt ?? null,
          scheduledAt: booking.scheduledAt,
          now: Date.now(),
        }) === null && liveFinalBill(booking.charges)?.status !== 'paid',
      // Whether the card offers "Ask for extra work", and if not, why
      // (lib/extra-work.ts): 'on_inspection' says the final bill covers it.
      extraWorkRefusal: extraWorkRefusal({
        status: booking.status,
        pricingTypes: pricingTypesOf(booking),
        openCount: openExtraWork(booking.charges).length,
      }),
      // Mark completed (and Delivered) wait for the customer's answer.
      completeBlockedByExtraWork: completionBlockedByExtraWork(booking.charges),
    }),
    // Whether the card offers "Suggest another time" (0041).
    ...(booking.timeProposals !== undefined && {
      canSuggestTimes:
        proposalRefusal({
          status: booking.status,
          paymentStatus: booking.payment?.status,
          hasOpenProposal: hasOpenProposal(booking),
        }) === null,
    }),
  }
}

/**
 * Whether a suggestion of the garage's is still open on the booking: one
 * waiting for the customer, or one past its time the cron has not yet
 * swept (the garage can't accept or decline over either).
 */
function hasOpenProposal(booking: BookingWithRelations): boolean {
  return (booking.timeProposals ?? []).some((proposal) => proposal.status === 'open')
}

/** The garage's Accept or Decline while its suggested times wait for an answer. */
function proposalOpen() {
  return new AppError(
    409,
    'You suggested other times for this booking. Withdraw them first, or wait for the customer to pick one.',
    'TIME_PROPOSAL_OPEN'
  )
}

/**
 * Whether the garage's answer (Accept, Suggest times) comes too late for
 * this booking now (0042): refused with 409 RESPONSE_TIME_PASSED. Throws.
 */
export function assertGarageCanAnswer(
  booking: { status: string; respondBy?: Date | null; responseMissedAt?: Date | null },
  now = Date.now()
): void {
  assertCanStillAnswer(booking, env.autoCancelUnanswered, now)
}

/** Mark completed (or Delivered) while extra work waits for the customer. */
export function extraWorkAwaiting() {
  return new AppError(
    409,
    "The customer hasn't answered your extra-work request yet. Withdraw it, or wait for their answer, before completing the job.",
    'EXTRA_WORK_AWAITING'
  )
}

/**
 * The vendorId always comes from `resolveTenant`, which has already checked the
 * caller has an active seat in it. This re-reads the row; it does not
 * re-authorize.
 */
async function getTenantVendor(vendorId: string) {
  const vendor = await vendorsRepository.findVendorById(vendorId)

  if (!vendor) {
    throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  }

  return vendor
}

/**
 * Whether the garage would still take an existing booking's time: not paused,
 * not a holiday, and a bay free with that booking itself left out. For paying
 * an unpaid booking later (payments.service createOrder), which is the moment
 * that booking starts to hold a bay. Answers rather than throws, because the
 * words for "you can't pay for this" are the caller's.
 *
 * The same reads checkGarageCanTake makes under its lock; this is the cheap
 * look before any payment order is opened.
 */
export async function garageRefusalForBooking(booking: {
  id: string
  vendorId: string
  scheduledAt: Date
  durationMins: number
}): Promise<GarageRefusal | null> {
  const vendor = await bookingsRepository.findVendorById(booking.vendorId)
  // A garage in the Bin is refused like a paused one, as checkGarageCanTake
  // refuses it under the lock.
  if (!vendor || vendor.bookingsPausedAt || isInBin(vendor)) return 'paused'

  const date = getDateKeyFromScheduledAt(booking.scheduledAt)
  const [closure, busy] = await Promise.all([
    bookingsRepository.findClosure(booking.vendorId, date),
    bookingsRepository.listCapacityHolders({
      vendorId: booking.vendorId,
      date,
      excludeBookingId: booking.id,
    }),
  ])
  if (closure) return 'closed'

  return hasCapacity(booking.scheduledAt, {
    durationMins: booking.durationMins,
    busy,
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
  })
    ? null
    : 'slot_full'
}

async function validateSlotAvailability(
  vendorId: string,
  serviceIds: string[],
  scheduledAt: Date,
  // The total across every service in the booking. A five-service cart needs a
  // block long enough for all of it, and may not fit the day at all.
  durationMins: number,
  // The booking a reschedule is moving. It still holds its old time, so it
  // must not count against the garage's room for the new one.
  excludeBookingId?: string
) {
  const date = getDateKeyFromScheduledAt(scheduledAt)
  const dayOfWeek = getDayOfWeekFromDate(date)
  log.info({ vendorId, serviceIds, date, dayOfWeek, durationMins, scheduledAt: scheduledAt.toISOString() }, 'booking:slot_check_start')

  const vendor = await bookingsRepository.findVendorById(vendorId)

  if (!vendor) {
    log.error({ vendorId }, 'booking:vendor_missing_in_slot_check')
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }

  // A reschedule reads the garage by id alone, so the Bin is checked here:
  // a garage off the app is as unknown to a customer as one that never was.
  if (isInBin(vendor)) {
    log.warn({ vendorId }, 'booking:vendor_in_bin')
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }

  const [hours, closure] = await Promise.all([
    vendorsRepository.findWorkingHoursForDay(vendorId, dayOfWeek),
    bookingsRepository.findClosure(vendorId, date),
  ])

  log.info({ vendorId, date, dayOfWeek, hours: hours ? { openTime: hours.openTime, closeTime: hours.closeTime, isClosed: hours.isClosed } : null, holiday: !!closure }, 'booking:working_hours_fetched')

  const day = dayStatus({
    pausedAt: vendor.bookingsPausedAt,
    isHoliday: !!closure,
    hours,
  })

  if (!day.open) {
    log.warn({ vendorId, date, dayOfWeek, reason: day.reason }, 'booking:slot_unavailable_closed')
    // `excludeBookingId` is only ever set by a reschedule, so it doubles as
    // "the customer already has a booking here".
    if (day.reason === 'paused') {
      throw excludeBookingId ? garagePausedForChange() : garagePaused()
    }
    if (day.reason === 'holiday') throw garageClosedThatDay()
    throw new AppError(
      400,
      'Selected slot is not available',
      'SLOT_UNAVAILABLE'
    )
  }

  // `hours` is known to be an open day from here on.
  const openHours = hours!

  const availableSlots = computeAvailableSlots({
    date,
    openTime: openHours.openTime,
    closeTime: openHours.closeTime,
    intervalMins: vendor.slotIntervalMins,
    isClosed: openHours.isClosed,
    serviceDurationMins: durationMins,
  })

  log.info({ vendorId, date, availableSlotsCount: availableSlots.length, requestedSlot: scheduledAt.toISOString() }, 'booking:available_slots_computed')

  if (!isScheduledAtAvailable(scheduledAt, availableSlots)) {
    log.warn({ vendorId, date, scheduledAt: scheduledAt.toISOString(), durationMins, availableSlotsCount: availableSlots.length }, 'booking:slot_unavailable_taken')

    // A long enough list of services fits nowhere in the day, and "that slot
    // has gone" would be a lie — the customer can retry all afternoon and
    // never succeed. Say which it is.
    if (availableSlots.length === 0) {
      throw new AppError(
        400,
        'These services need more time than this garage has left in the day. Remove one, or pick another day.',
        'DURATION_EXCEEDS_WORKING_DAY'
      )
    }

    throw new AppError(
      400,
      'Selected slot is not available',
      'SLOT_UNAVAILABLE'
    )
  }

  // The garage's room at that time. Checked here so a full slot is refused
  // before any payment order exists; the write re-checks it under a lock,
  // because another customer can take the last bay in between.
  const busy = await bookingsRepository.listCapacityHolders({
    vendorId,
    date,
    excludeBookingId,
  })

  if (
    !hasCapacity(scheduledAt, {
      durationMins,
      busy,
      bays: vendor.bays,
      jobsPerDay: vendor.jobsPerDay,
    })
  ) {
    log.warn({ vendorId, date, scheduledAt: scheduledAt.toISOString(), durationMins, bays: vendor.bays, jobsPerDay: vendor.jobsPerDay, busy: busy.length }, 'booking:slot_full')
    throw slotFull()
  }

  log.info({ vendorId, scheduledAt: scheduledAt.toISOString() }, 'booking:slot_available')
}

async function getBookingForCustomer(userId: string, bookingId: string) {
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking || booking.userId !== userId) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  return booking
}

async function getBookingForVendor(vendorId: string, bookingId: string) {
  const vendor = await getTenantVendor(vendorId)
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking || booking.vendorId !== vendor.id) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  return { booking, vendor }
}

/**
 * Read authorization for `GET /bookings/:id`, which serves customers *and*
 * vendors, and is the only place the old 1:1 was assumed inline. The vendor
 * branch is a mapping lookup now: "does this person hold an active seat in the
 * company that owns this booking?" — which is true for every member of that
 * company and for nobody else.
 *
 * Returns how the viewer resolved, because the vendor payload omits the money
 * breakdown the customer receipt needs (see toVendorBookingResponse).
 */
async function getBookingForViewer(userId: string, bookingId: string) {
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  if (booking.userId === userId) {
    return { booking, viewer: 'customer' as const }
  }

  const seat = await membersRepository.findActiveVendorSeat(
    booking.vendorId,
    userId
  )

  if (seat) {
    return { booking, viewer: 'vendor' as const }
  }

  // A platform grant reads every company, same as it resolves every tenant.
  const platformRow = await membersRepository.findActivePlatformRow(userId)

  if (platformRow?.role === 'super_admin') {
    // Logged here rather than in middleware, which is the exception and worth
    // being explicit about: this route serves customers too, so it never runs
    // `resolveTenant` — and `resolveTenant` is where every other support-access
    // row is written. Without this, staff could read any booking's customer
    // name, phone and doorstep address on any garage with no trace, which is
    // exactly the access the audit log exists to record.
    await membersRepository.logInternalAccess({
      userId,
      vendorId: booking.vendorId,
      method: 'GET',
      endpoint: `/bookings/${bookingId}`,
    })

    return { booking, viewer: 'vendor' as const }
  }

  throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

/**
 * Validate and price a booking request, without writing anything.
 *
 * This is everything that has to be true before money can be taken: the slot is
 * real, the vendor takes this booking type, the service is priced for this
 * customer's vehicle, and the promo code applies. It is deliberately separate
 * from the write so the payment flow can price a booking that does not exist
 * yet — see booking-intents — while `createBooking` keeps using the exact same
 * rules. Two copies of this would be one edit away from a checkout that charges
 * a different figure than the booking it creates.
 */
export async function resolveBookingDraft(
  userId: string,
  input: CreateBookingInput
) {
  const scheduledAt = new Date(input.scheduledAt)

  if (Number.isNaN(scheduledAt.getTime())) {
    log.warn({ userId, scheduledAt: input.scheduledAt }, 'booking:invalid_scheduled_at')
    throw new AppError(400, 'Invalid scheduledAt', 'INVALID_SCHEDULED_AT')
  }

  if (scheduledAt.getTime() <= Date.now()) {
    log.warn({ userId, scheduledAt: scheduledAt.toISOString() }, 'booking:scheduled_at_in_past')
    throw new AppError(
      400,
      'Cannot book a slot in the past',
      'INVALID_SCHEDULED_AT'
    )
  }

  // Time for the garage to see and accept it, and for a doorstep crew to get
  // there. Checked here, before any payment order exists, so a refusal costs
  // the customer nothing. (Payment itself does not re-check: an intent lives
  // 30 minutes, so a booking paid late still has at least 30 minutes' notice
  // at the garage and 2h30 doorstep — and never starts in the past.)
  assertMinNotice(scheduledAt, input.bookingType)

  const vendor = await bookingsRepository.findPublicVendorById(input.vendorId)
  log.info({ vendorId: input.vendorId, found: !!vendor, isVerified: vendor?.isVerified, status: vendor?.status }, 'booking:vendor_lookup')

  if (!vendor) {
    log.warn({ userId, vendorId: input.vendorId }, 'booking:vendor_not_found')
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }

  // Before anything about the cart or the address: whatever else is wrong,
  // a paused garage is the thing the customer needs to hear.
  if (vendor.bookingsPausedAt) {
    log.warn({ userId, vendorId: vendor.id }, 'booking:garage_paused')
    throw garagePaused()
  }

  if (input.bookingType === 'dropin' && !vendor.dropinEnabled) {
    log.warn({ userId, vendorId: vendor.id, bookingType: input.bookingType }, 'booking:dropin_not_enabled')
    throw new AppError(
      400,
      'Vendor does not accept drop-in bookings',
      'DROPIN_NOT_ENABLED'
    )
  }

  // Every requested service must belong to this vendor and be active. Fetched
  // in one query and then re-ordered to the customer's order, so the summary,
  // the receipt and the deprecated `bookings.service_id` all agree on which
  // service came first.
  const found = await bookingsRepository.findServicesForVendor(
    vendor.id,
    input.serviceIds
  )
  const byId = new Map(found.map((row) => [row.id, row]))
  const services = input.serviceIds.map((id) => byId.get(id))

  log.info({ vendorId: vendor.id, serviceIds: input.serviceIds, foundCount: found.length }, 'booking:service_lookup')

  const missing = input.serviceIds.filter((id) => {
    const row = byId.get(id)
    return !row || !row.isActive
  })

  if (missing.length > 0) {
    log.warn({ userId, vendorId: vendor.id, serviceIds: input.serviceIds, missing }, 'booking:service_not_found')
    throw new AppError(
      404,
      missing.length === input.serviceIds.length
        ? 'Service not found'
        : 'One of the services you picked is no longer available',
      'SERVICE_NOT_FOUND'
    )
  }

  const resolvedServices = services as NonNullable<(typeof services)[number]>[]
  // The first service, for the columns that still hold one. Not a fallback:
  // `serviceIds` is non-empty by schema, so this always exists.
  const service = resolvedServices[0]

  const vehicle = await bookingsRepository.findVehicleForUser(
    userId,
    input.vehicleId
  )
  log.info({ userId, vehicleId: input.vehicleId, found: !!vehicle }, 'booking:vehicle_lookup')

  if (!vehicle) {
    log.warn({ userId, vehicleId: input.vehicleId }, 'booking:vehicle_not_found')
    throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
  }

  // Price each line from its pricing type and the customer's vehicle.
  // A per-vehicle service with no price for this tier has no defensible
  // amount — `price` is the cheapest tier, so charging it would bill an SUV
  // at the hatchback rate. Refuse instead of guessing, and name the service:
  // with several in the cart, "this service isn't priced" does not tell the
  // customer which one to remove.
  const items = resolvedServices.map((row) => {
    const lineAmount = computeServiceAmount(row, vehicle.vehicleType)

    if (lineAmount === null) {
      log.warn(
        {
          userId,
          serviceId: row.id,
          vehicleType: vehicle.vehicleType,
        },
        'booking:service_not_priced_for_vehicle'
      )
      throw new AppError(
        400,
        `${row.name} is not priced for your vehicle type yet. Remove it, or contact the garage.`,
        'SERVICE_NOT_PRICED_FOR_VEHICLE'
      )
    }

    return {
      serviceId: row.id,
      name: row.name,
      amount: lineAmount,
      durationMins: row.durationMins,
    }
  })

  // Sum the lines, then discount — never discount per line — or the invariant
  // `amount = subtotalAmount - discountAmount` drifts by a paisa. Summed in
  // paise so the arithmetic never runs through a float.
  //
  // A booking type's own fee goes on here, before any promo code
  // (bookingTypeFee, lib/pickup.ts). Zero for every type today: the pickup &
  // drop fee is to be decided (owner, 17 Oct 2026).
  const amount = sumAmounts([
    ...items.map((item) => item.amount),
    bookingTypeFee(input.bookingType),
  ])
  const durationMins = items.reduce((total, item) => total + item.durationMins, 0)

  // Resolve the promo code against the *server-computed* subtotal. A
  // failure here (expired, limit reached, wrong garage) surfaces as the
  // engine's own AppError, so the customer sees why.
  let discount: BookingDiscount | null = null
  let chargeAmount = amount

  if (input.discountCode) {
    const resolved = await discountsService.resolveDiscount({
      code: input.discountCode,
      userId,
      vendorId: vendor.id,
      subtotal: amount,
      // A coupon voucher limited to one service type (0056) comes off those lines.
      lines: resolvedServices.map((row, index) => ({ category: row.category, amount: items[index]!.amount })),
    })

    discount = {
      discountId: resolved.discountId,
      code: resolved.code,
      discountAmount: resolved.discountAmount,
      fundedBy: resolved.fundedBy,
      perUserLimit: resolved.perUserLimit,
      totalUsageLimit: resolved.totalUsageLimit,
    }
    chargeAmount = resolved.finalAmount

    log.info(
      {
        userId,
        code: resolved.code,
        subtotal: amount,
        discountAmount: resolved.discountAmount,
        chargeAmount,
      },
      'booking:discount_resolved'
    )
  }

  // Doorstep and pickup & drop snapshot the customer's location onto the
  // booking, so a later edit to the saved address cannot change where the
  // garage was told to go (or collect the car from).
  //
  // Drop-in leaves all three null: the customer comes to the garage, so there
  // is no address to record.
  let lat: number | null = null
  let lng: number | null = null
  let address: string | null = null

  const bookingType = input.bookingType

  if (bookingType === 'doorstep' && !vendor.doorstepEnabled) {
    log.warn(
      { userId, vendorId: vendor.id },
      'booking:doorstep_not_enabled'
    )
    throw new AppError(
      400,
      'Vendor does not accept doorstep bookings',
      'DOORSTEP_NOT_ENABLED'
    )
  }

  // On, with the responsibility terms on file (lib/pickup.ts).
  if (bookingType === 'pickup' && !isPickupOffered(vendor)) {
    log.warn({ userId, vendorId: vendor.id }, 'booking:pickup_not_offered')
    throw new AppError(
      400,
      "This garage doesn't offer pickup & drop",
      'PICKUP_NOT_OFFERED'
    )
  }

  if (usesCustomerAddress(bookingType)) {
    const pickup = bookingType === 'pickup'

    if (!input.addressId) {
      throw new AppError(
        400,
        pickup ? 'Choose the address we should collect the car from' : 'Choose the address we should come to',
        'ADDRESS_REQUIRED'
      )
    }

    const savedAddress = await bookingsRepository.findAddressForUser(
      userId,
      input.addressId
    )

    if (!savedAddress) {
      throw new AppError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
    }

    // An address saved without a pin is fine for drop-in and normal to have —
    // this is the one moment its coordinates actually matter, which is why the
    // customer is prompted here rather than nagged in their profile.
    if (savedAddress.lat === null || savedAddress.lng === null) {
      throw new AppError(
        422,
        pickup
          ? 'Confirm exactly where the car should be collected from on the map'
          : 'Confirm exactly where we should come on the map',
        'ADDRESS_LOCATION_REQUIRED'
      )
    }

    // Doorstep: the garage's drawn area or travel radius. Pickup: its pickup
    // radius from its pin (10 km when empty).
    const covered = pickup
      ? await bookingsRepository.isWithinPickupRadius(vendor.id, savedAddress.lat, savedAddress.lng)
      : await bookingsRepository.isWithinDoorstepRadius(vendor.id, savedAddress.lat, savedAddress.lng)

    if (!covered) {
      log.warn(
        { userId, vendorId: vendor.id, addressId: input.addressId, bookingType },
        pickup ? 'booking:outside_pickup_radius' : 'booking:outside_doorstep_radius'
      )
      throw pickup
        ? new AppError(
            400,
            "This garage doesn't collect cars from that address",
            'OUTSIDE_PICKUP_RADIUS'
          )
        : new AppError(
            400,
            'This garage does not travel to that address',
            'OUTSIDE_DOORSTEP_RADIUS'
          )
    }

    lat = savedAddress.lat
    lng = savedAddress.lng
    address = savedAddress.address
  }

  log.info({ userId, vendorId: vendor.id, serviceIds: input.serviceIds, scheduledAt: scheduledAt.toISOString(), durationMins }, 'booking:slot_validation_start')

  await validateSlotAvailability(
    vendor.id,
    input.serviceIds,
    scheduledAt,
    durationMins
  )
  return {
    vendor,
    // The lines as they will be written, and the first service for the columns
    // that still carry one.
    items,
    service,
    durationMins,
    vehicle,
    scheduledAt,
    // Pre-discount total, and what is actually charged. Equal when no code.
    amount,
    chargeAmount,
    discount,
    lat,
    lng,
    address,
  }
}

/**
 * What a move writes, copied from the booking being moved: the same lines,
 * price, discount, place, codes, payment and Test mark. One builder for the
 * customer's reschedule and the pick of a garage's suggested time (0041), so
 * the two can never carry a booking differently.
 */
function moveParams(
  booking: Awaited<ReturnType<typeof bookingsRepository.findBookingById>> & object,
  move: {
    userId: string
    newScheduledAt: Date
    durationMins: number
    expectedStatus: 'pending' | 'confirmed'
    reason: string | null
    proposal?: { id: string; acceptedBy: string | null; reason: string } | null
  }
) {
  const items = booking.items ?? []
  return {
    sourceBookingId: booking.id,
    rootBookingId: booking.originalBookingId ?? booking.id,
    userId: move.userId,
    vendorId: booking.vendorId,
    items: items.map((item) => ({
      serviceId: item.serviceId,
      name: item.name,
      amount: item.amount,
      durationMins: item.durationMins,
    })),
    vehicleId: booking.vehicleId,
    bookingType: booking.bookingType,
    newScheduledAt: move.newScheduledAt,
    durationMins: move.durationMins,
    expectedStatus: move.expectedStatus,
    subtotalAmount: booking.subtotalAmount ?? booking.amount,
    amount: booking.amount,
    discountAmount: booking.discountAmount ?? '0.00',
    discountId: booking.discountId ?? null,
    discountCode: booking.discountCode ?? null,
    discountFundedBy: booking.discountFundedBy ?? null,
    paymentMethod: booking.paymentMethod,
    lat: booking.lat,
    lng: booking.lng,
    address: booking.address,
    handoverCodes:
      booking.pickupCode && booking.deliveryCode
        ? { pickupCode: booking.pickupCode, deliveryCode: booking.deliveryCode }
        : null,
    sourcePayment: booking.payment
      ? {
          gateway: booking.payment.gateway,
          gatewayTxnId: booking.payment.gatewayTxnId,
          gatewayMode: booking.payment.gatewayMode,
          amount: booking.payment.amount,
          creditAmount: booking.payment.creditAmount,
          currency: booking.payment.currency,
          status: booking.payment.status,
          paidAt: booking.payment.paidAt,
        }
      : null,
    reason: move.reason,
    maxReschedules: MAX_RESCHEDULES,
    markedTestAt: booking.markedTestAt,
    markedTestBy: booking.markedTestBy,
    proposal: move.proposal ?? null,
    responseWindowMins: env.garageResponseMinutes,
  }
}

/**
 * Moves a pending booking to one of the times its garage suggested (0041),
 * through the reschedule write: a new booking in the chain, already
 * accepted, carrying the payment, receipt chain and pickup codes; the old
 * one retired as moved. The write re-checks, under the vehicle, chain,
 * booking, suggestion and vendor-day locks, that the suggestion is still
 * open with this time on it and that the garage still has room. Answers
 * what the write said; the caller has the words.
 */
export async function moveToSuggestedTime(
  booking: Awaited<ReturnType<typeof bookingsRepository.findBookingById>> & object,
  newScheduledAt: Date,
  proposal: { id: string; acceptedBy: string | null; reason: string }
) {
  const items = booking.items ?? []
  const durationMins =
    booking.durationMins ?? items.reduce((total, item) => total + item.durationMins, 0)
  const result = await bookingsRepository.rescheduleBookingWithPayment(
    moveParams(booking, {
      userId: booking.userId,
      newScheduledAt,
      durationMins,
      expectedStatus: 'pending',
      reason: proposal.reason,
      proposal,
    })
  )
  return result
}

export const bookingsService = {
  async listMyBookings(userId: string, query: ListMyBookingsQuery) {
    const bookings = await bookingsRepository.listBookingsForUser(userId, {
      status: query.status,
      bookingType: query.booking_type,
    })
    const moved = await bookingsRepository.findMovedBookingIds(
      bookings.map((booking) => booking.id)
    )

    return bookings.map((booking) => toBookingResponse(booking, moved.has(booking.id)))
  },

  async getBookingDetail(userId: string, bookingId: string) {
    const { booking, viewer } = await getBookingForViewer(userId, bookingId)

    // The same booking, two shapes. The customer who owns it still gets the
    // discount breakdown their receipt needs; a vendor member does not.
    if (viewer === 'vendor') return toVendorBookingResponse(booking)

    const moved = await bookingsRepository.findMovedBookingIds([booking.id])
    // The refund history, for "Refund of ₹X started on …" while a refund
    // the app sent through Razorpay is on its way (lib/refunds.ts
    // startedRefunds). Only the booking page says it; lists don't.
    const refundRecords = await bookingsRepository.listRefundRecordsForBooking(booking.id)
    return toBookingResponse(booking, moved.has(booking.id), refundRecords)
  },

  /**
   * The customer's payment receipt for one of their bookings. Anyone else
   * gets the same 404 as for a booking that does not exist; a booking with
   * no payment through yet, or one moved to a new time, gets
   * RECEIPT_NOT_AVAILABLE. A paid one whose receipt number cannot be issued
   * right now gets 503 RECEIPT_NUMBER_PENDING, and ops is alerted.
   */
  async getReceipt(userId: string, bookingId: string) {
    const booking = await getBookingForCustomer(userId, bookingId)
    const moved = await bookingsRepository.findMovedBookingIds([booking.id])

    const availability = receiptAvailability({
      status: booking.status,
      moved: moved.has(booking.id),
      payment: booking.payment,
      guaranteeRedo: booking.guaranteeRedo,
    })
    if (availability === 'free_redo') {
      throw new AppError(
        404,
        "This was a free redo, so there's no receipt for it. The receipt for the original job stands.",
        'RECEIPT_NOT_AVAILABLE'
      )
    }
    if (availability === 'moved') {
      throw new AppError(
        404,
        'This booking was moved to a new time and its payment went with it. The receipt is on the new booking.',
        'RECEIPT_NOT_AVAILABLE'
      )
    }
    if (availability === 'unpaid') {
      throw new AppError(
        404,
        'There is no receipt for this booking yet. One is ready once a payment for it has gone through.',
        'RECEIPT_NOT_AVAILABLE'
      )
    }

    // The number belongs to the first booking of the reschedule chain, and is
    // issued when the payment goes through. A receipt that reaches here with
    // none (a payment path that missed it, a row written by hand) gets it now,
    // dated by its payment like any other, rather than going out unnumbered.
    // Two first views at once still get one number (allocateReceiptNumber).
    //
    // After the test-data reset restarts a financial year (0032), nothing
    // kept in that year can still be waiting here for a number: a year with
    // a kept receipt, numbered or owed one, is never restarted but has its
    // test numbers voided instead (planReceipts in lib/data-reset.ts). So the
    // first number issued in a restarted year, here or by a payment, is a
    // real 000001, and no earlier receipt is numbered after it.
    //
    // If that fails, the answer is not the 500 a raw database error would be,
    // which the page could only read as "not yours or removed": the customer
    // paid and the booking is theirs. Ops is told, and a try later may well
    // work (a lock timeout, a deploy that ran ahead of its migration).
    const notReadyYet = (error: unknown) => {
      logReceiptNumberFailure({ kind: 'failed', error }, booking.id)
      return new AppError(
        503,
        "Your receipt isn't ready yet. Please try again in a few minutes, or call Detlio support.",
        'RECEIPT_NUMBER_PENDING'
      )
    }
    const rootBookingId = booking.originalBookingId ?? booking.id
    let receiptNumber = await bookingsRepository
      .findReceiptNumber(rootBookingId)
      .catch((error: unknown) => {
        throw notReadyYet(error)
      })
    if (!receiptNumber) {
      const issued = await bookingsRepository.issueReceiptNumber(
        rootBookingId,
        receiptIssuedAt(booking.payment!)
      )
      if (issued.kind === 'failed') throw notReadyYet(issued.error)
      if (issued.kind === 'issued') {
        log.warn(
          { bookingId: booking.id, rootBookingId, receiptNumber: issued.number },
          'receipt:number_issued_late'
        )
      }
      receiptNumber = issued.number
    }

    const refundRecords = await bookingsRepository.listRefundRecordsForBooking(booking.id)
    return buildReceipt(booking, refundRecords, receiptNumber)
  },

  /**
   * × on Home's "Rate your wash" card: the prompt is not shown for this
   * booking again. The customer can still review it from the booking. Only
   * the booking's own customer; anyone else gets the same 404 as for a
   * booking that does not exist. Repeating it changes nothing.
   */
  async dismissReviewPrompt(userId: string, bookingId: string) {
    const booking = await getBookingForCustomer(userId, bookingId)
    await bookingsRepository.dismissReviewPrompt(booking.id)
  },

  async createBooking(userId: string, input: CreateBookingInput) {
    log.info({
      userId,
      vendorId: input.vendorId,
      serviceIds: input.serviceIds,
      vehicleId: input.vehicleId,
      scheduledAt: input.scheduledAt,
      bookingType: input.bookingType,
      paymentMethod: input.paymentMethod,
    }, 'booking:create_start')

    try {
      const {
        vendor,
        items,
        durationMins,
        vehicle,
        scheduledAt,
        amount,
        chargeAmount,
        discount,
        lat,
        lng,
        address,
      } = await resolveBookingDraft(userId, input)

      const bookingDate = getDateKeyFromScheduledAt(scheduledAt)
      log.info({ userId, vendorId: vendor.id, bookingDate, scheduledAt: scheduledAt.toISOString() }, 'booking:db_insert_start')

      const result =
        await bookingsRepository.createBookingWithPayment({
          userId,
          vendorId: vendor.id,
          items,
          vehicleId: vehicle.id,
          bookingType: input.bookingType,
          scheduledAt,
          durationMins,
          subtotalAmount: amount,
          amount: chargeAmount,
          paymentMethod: input.paymentMethod,
          lat,
          lng,
          address,
          discount,
          handoverCodes: input.bookingType === 'pickup' ? newHandoverCodes() : null,
        })

      if (result.vehicleClash) {
        log.warn(
          {
            userId,
            vehicleId: vehicle.id,
            scheduledAt: scheduledAt.toISOString(),
            clashingBookingId: result.vehicleClash.id,
          },
          'booking:vehicle_double_booked'
        )
        throw new AppError(
          409,
          'This vehicle already has a booking that overlaps this time',
          'VEHICLE_DOUBLE_BOOKED'
        )
      }

      // Paused, a holiday or the last bay taken since the checks above.
      if (result.garageRefusal) {
        log.warn(
          {
            userId,
            vendorId: vendor.id,
            scheduledAt: scheduledAt.toISOString(),
            refusal: result.garageRefusal,
          },
          'booking:garage_refused_at_write'
        )
        throw garageRefusalError(result.garageRefusal)
      }

      // The limits were re-checked under a lock inside the transaction, so a
      // code that was free a moment ago can still be gone by the time we write.
      if (result.discountUnavailable) {
        log.warn(
          { userId, code: input.discountCode },
          'booking:discount_exhausted_at_write'
        )
        throw new AppError(
          409,
          'That code was just fully redeemed. Please try again without it.',
          'DISCOUNT_EXHAUSTED'
        )
      }

      const { booking, payment } = result
      log.info({ bookingId: booking.id, paymentId: payment.id }, 'booking:db_insert_done')

      const fullBooking = await bookingsRepository.findBookingById(booking.id)

      if (!fullBooking) {
        log.error({ bookingId: booking.id, userId, vendorId: vendor.id }, 'booking:full_fetch_failed')
        throw new AppError(
          500,
          'Failed to load created booking',
          'BOOKING_CREATE_FAILED'
        )
      }

      log.info({
        bookingId: booking.id,
        userId,
        vendorId: vendor.id,
        serviceIds: input.serviceIds,
        vehicleId: vehicle.id,
        scheduledAt: scheduledAt.toISOString(),
        bookingType: input.bookingType,
        paymentMethod: input.paymentMethod,
        amount,
      }, 'booking:created')

      return toBookingResponse({ ...fullBooking, payment })
    } catch (err) {
      if (err instanceof AppError) throw err
      log.error({
        err,
        userId,
        vendorId: input.vendorId,
        serviceIds: input.serviceIds,
        vehicleId: input.vehicleId,
        scheduledAt: input.scheduledAt,
      }, 'booking:create_failed')
      throw err
    }
  },

  async cancelBooking(userId: string, bookingId: string, reason?: string) {
    const booking = await getBookingForCustomer(userId, bookingId)

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new AppError(
        400,
        'Only pending or confirmed bookings can be cancelled',
        'INVALID_BOOKING_STATUS'
      )
    }

    // Pickup & drop: once the garage has the car, it has to come back first.
    const withCar = customerChangeRefusal(pickupJobOf(booking))
    if (withCar) throw new AppError(409, withCar, 'CAR_WITH_GARAGE')

    // Until the garage accepts, the customer can cancel any time — even after
    // the start, when a garage never answered. The cutoff protects a garage
    // that has committed to the slot.
    const from = booking.status === 'confirmed' ? 'confirmed' : 'pending'
    if (from === 'confirmed') {
      const msUntilBooking = booking.scheduledAt.getTime() - Date.now()
      if (msUntilBooking < CANCELLATION_CUTOFF_MS) {
        throw new AppError(
          400,
          'Once the garage has accepted, bookings can only be cancelled at least 2 hours before the scheduled time',
          'CANCELLATION_WINDOW_PASSED'
        )
      }
    }

    const [cancelled] = await bookingsRepository.cancelBooking(bookingId, 'user', from, reason)
    if (!cancelled) throw stateChanged()
    log.info({ bookingId, userId, status: 'cancelled', cancelledBy: 'user', from }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    alertOps({ kind: 'customer_cancelled', booking: updated!, reason })
    // The garage's team (0044); never the customer's reason, which is typed text.
    pushService.notifyGarage(updated!.vendorId, pushMessages.garageCustomerCancelled(updated!))
    // A free redo (0051) was never a booking anyone paid for: no usage event.
    if (!updated!.guaranteeRedo) analyticsService.bookingCancelled(bookingId, 'customer')
    // Its time is free again: anyone waiting for that day hears (0047).
    slotAlertsService.capacityFreed(updated!, 'customer_cancelled')
    // A free redo cancelled (0051): its claim lets them pick again.
    if (updated!.guaranteeRedo) guaranteeService.redoChanged(bookingId)
    // Cancelled in the allowed time (the cutoff above): a paid one is
    // refunded at once when AUTO_REFUNDS is on.
    if (updated?.payment?.status === 'paid') refundsService.queueAutoRefund({ kind: 'booking', id: bookingId })
    return toBookingResponse(updated!)
  },

  async rescheduleBooking(
    userId: string,
    bookingId: string,
    newScheduledAtInput: string,
    reason?: string
  ) {
    const booking = await getBookingForCustomer(userId, bookingId)

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new AppError(
        400,
        'Only pending or confirmed bookings can be rescheduled',
        'INVALID_BOOKING_STATUS'
      )
    }

    const withCar = customerChangeRefusal(pickupJobOf(booking))
    if (withCar) throw new AppError(409, withCar, 'CAR_WITH_GARAGE')

    // A free redo (Detlio Guarantee, 0051) is not moved: it is tied to its
    // claim's window. Cancelling it lets the customer pick another time
    // from the claim while the window is open.
    if (booking.guaranteeRedo) {
      throw new AppError(
        409,
        "A free redo can't be moved. Cancel it and pick another time from the original booking.",
        'GUARANTEE_REDO_NO_RESCHEDULE'
      )
    }

    // Extra work already paid for belongs to this job at this time (0041):
    // moving it would leave that payment on the retired booking, owed back,
    // and the garage's figures counting it meanwhile. Cancel (which refunds
    // it) or ask for help instead.
    if ((booking.charges ?? []).some((charge) => charge.kind === 'extra_work' && charge.status === 'paid')) {
      throw new AppError(
        409,
        "You've paid for extra work on this booking, so it can't be moved in the app. Use Help with this booking to reach the garage or our team.",
        'EXTRA_WORK_PAID'
      )
    }

    if ((booking.rescheduleCount ?? 0) >= MAX_RESCHEDULES) {
      throw new AppError(
        400,
        `A booking can be rescheduled at most ${MAX_RESCHEDULES} times`,
        'RESCHEDULE_LIMIT_REACHED'
      )
    }

    // Same rule as cancelling: the cutoff protects a garage that has accepted.
    if (booking.status === 'confirmed') {
      const msUntilBooking = booking.scheduledAt.getTime() - Date.now()
      if (msUntilBooking < CANCELLATION_CUTOFF_MS) {
        throw new AppError(
          400,
          'Once the garage has accepted, bookings can only be rescheduled at least 2 hours before the scheduled time',
          'RESCHEDULE_WINDOW_PASSED'
        )
      }
    }

    const newScheduledAt = new Date(newScheduledAtInput)
    if (Number.isNaN(newScheduledAt.getTime())) {
      throw new AppError(400, 'Invalid scheduledAt', 'INVALID_SCHEDULED_AT')
    }
    if (newScheduledAt.getTime() <= Date.now()) {
      throw new AppError(
        400,
        'Cannot reschedule to a slot in the past',
        'INVALID_SCHEDULED_AT'
      )
    }
    assertMinNotice(newScheduledAt, booking.bookingType)

    // A move re-books exactly what was sold, so the lines come off the booking
    // rather than being re-resolved: a service repriced or deactivated since
    // must not change (or block) a booking the customer has already paid for.
    const items = booking.items ?? []
    if (items.length === 0) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const durationMins =
      booking.durationMins ??
      items.reduce((total, item) => total + item.durationMins, 0)

    await validateSlotAvailability(
      booking.vendorId,
      items.map((item) => item.serviceId),
      newScheduledAt,
      durationMins,
      booking.id
    )

    const rootBookingId = booking.originalBookingId ?? booking.id

    const result = await bookingsRepository.rescheduleBookingWithPayment(
      moveParams(booking, {
        userId,
        newScheduledAt,
        durationMins,
        expectedStatus: booking.status === 'confirmed' ? 'confirmed' : 'pending',
        reason: reason ?? null,
      })
    )

    if (result.capReached) {
      throw new AppError(
        400,
        `A booking can be rescheduled at most ${MAX_RESCHEDULES} times`,
        'RESCHEDULE_LIMIT_REACHED'
      )
    }

    if (result.stateChanged || result.proposalGone) throw stateChanged()

    if (result.garageRefusal) {
      log.warn(
        {
          userId,
          bookingId: booking.id,
          vendorId: booking.vendorId,
          newScheduledAt: newScheduledAt.toISOString(),
          refusal: result.garageRefusal,
        },
        'booking:reschedule_garage_refused'
      )
      throw result.garageRefusal === 'paused'
        ? garagePausedForChange()
        : garageRefusalError(result.garageRefusal)
    }

    if (result.vehicleClash) {
      log.warn(
        {
          userId,
          vehicleId: booking.vehicleId,
          newScheduledAt: newScheduledAt.toISOString(),
          clashingBookingId: result.vehicleClash.id,
        },
        'booking:vehicle_double_booked'
      )
      throw new AppError(
        409,
        'This vehicle already has another booking that overlaps this time',
        'VEHICLE_DOUBLE_BOOKED'
      )
    }

    if (!result.booking) throw stateChanged()

    log.info(
      {
        userId,
        fromBookingId: booking.id,
        toBookingId: result.booking.id,
        rootBookingId,
        newScheduledAt: newScheduledAt.toISOString(),
      },
      'booking:rescheduled'
    )

    const fullBooking = await bookingsRepository.findBookingById(
      result.booking.id
    )
    alertOps({
      kind: 'rescheduled',
      booking: fullBooking!,
      previousScheduledAt: booking.scheduledAt,
    })
    pushService.notifyGarage(
      fullBooking!.vendorId,
      pushMessages.garageRescheduled(fullBooking!, booking.scheduledAt, new Date(), env.garageResponseMinutes)
    )
    // The time it moved from is free again (0047).
    slotAlertsService.capacityFreed(booking, 'moved')
    return toBookingResponse(fullBooking!)
  },

  async listVendorBookings(vendorId: string, query: ListVendorBookingsQuery) {
    const vendor = await getTenantVendor(vendorId)
    const bookings = await bookingsRepository.listBookingsForVendor(
      vendor.id,
      query.status
    )

    // Detlio Rewards (0050): the level name of a customer whose level has
    // the garage badge on (Diamond, Detlio Icon), and nothing else about
    // them. Two grouped reads; a failure leaves the badges off, never the list.
    const badges = await rewardsService
      .garageBadges(bookings.map((booking) => booking.userId))
      .catch((err: unknown) => {
        log.warn({ err, vendorId: vendor.id }, 'booking:reward_badges_failed')
        return new Map<string, string>()
      })
    return bookings.map((booking) => ({
      ...toVendorBookingResponse(booking),
      customerBadge: badges.get(booking.userId) ?? null,
    }))
  },

  async acceptBooking(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)
    const now = new Date()

    // Too late to answer (0042): the cron has cancelled it already, or the
    // switch is on and the deadline has passed. Before the status check, so
    // a garage that taps Accept on a card the cron just cancelled is told
    // why rather than "only pending bookings".
    assertGarageCanAnswer(booking, now.getTime())

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be accepted',
        'INVALID_BOOKING_STATUS'
      )
    }

    // Belt and braces with the payment filter in listBookingsForVendor: a
    // vendor must never be able to commit to a job that has not been paid for,
    // whichever route the booking id arrived by.
    if (
      !booking.payment ||
      !['paid', 'collected'].includes(booking.payment.status)
    ) {
      throw new AppError(
        400,
        'This booking has not been paid for yet',
        'BOOKING_NOT_PAID'
      )
    }

    // A slot that has already started can't be taken on any more: the
    // customer has waited past their time. Declining it is what is left.
    if (booking.scheduledAt.getTime() <= Date.now()) {
      throw new AppError(
        400,
        "This booking's start time has passed, so it can't be accepted. Reject it so the customer can be refunded.",
        'BOOKING_START_PASSED'
      )
    }

    if (hasOpenProposal(booking)) throw proposalOpen()

    const [accepted] = await bookingsRepository.updateBookingStatus(
      bookingId,
      'confirmed',
      'pending',
      { acceptedBy: actorId, acceptedAt: now },
      {
        noOpenProposal: true,
        // In the write too while the switch is on: an Accept and the
        // cron's auto-cancel racing on this booking leave one winner.
        ...(env.autoCancelUnanswered && { responseTimeLeftAt: now }),
      }
    )
    if (!accepted) {
      // Lost to the cron's auto-cancel, or to the deadline passing in
      // between: say so. Anything else changed it some other way.
      const fresh = await bookingsRepository.findBookingById(bookingId)
      if (fresh) assertGarageCanAnswer(fresh)
      throw stateChanged()
    }
    log.info({ bookingId, vendorId, actorId, status: 'confirmed' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    pushService.notifyCustomer(updated!.userId, pushMessages.customerAccepted(updated!))
    return toVendorBookingResponse(updated!)
  },

  async rejectBooking(
    vendorId: string,
    actorId: string,
    bookingId: string,
    reason?: string
  ) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be rejected',
        'INVALID_BOOKING_STATUS'
      )
    }

    if (hasOpenProposal(booking)) throw proposalOpen()

    const [declined] = await bookingsRepository.cancelBooking(bookingId, 'vendor', 'pending', reason)
    if (!declined) throw stateChanged()
    log.info({ bookingId, vendorId, actorId, status: 'cancelled', cancelledBy: 'vendor' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    alertOps({ kind: 'garage_declined', booking: updated!, reason })
    pushService.notifyCustomer(
      updated!.userId,
      pushMessages.customerDeclined(
        updated!,
        // The card/UPI part only: a part paid with Detlio credit goes back as
        // credit (0049), and a booking paid wholly with it has no refund due.
        updated?.payment?.status === 'paid' && paise(updated.payment.amount) > 0 ? updated.payment.amount : null
      )
    )
    analyticsService.bookingCancelled(bookingId, 'garage')
    slotAlertsService.capacityFreed(updated!, 'garage_declined')
    // Declined by the garage: a paid one is refunded at once when
    // AUTO_REFUNDS is on.
    if (updated?.payment?.status === 'paid') refundsService.queueAutoRefund({ kind: 'booking', id: bookingId })
    return toVendorBookingResponse(updated!)
  },

  async markInProgress(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'confirmed') {
      throw new AppError(
        400,
        'Only confirmed bookings can be marked in progress',
        'INVALID_BOOKING_STATUS'
      )
    }

    // Pickup & drop: the work starts once the car is at the garage.
    if (booking.bookingType === 'pickup') assertPickupStep(booking, 'start_work')

    // 0045: two before photos from the garage, unless waived or relaxed.
    const garagePhotos = assertPhotoGate(booking, 'start')

    const [started] = await bookingsRepository.updateBookingStatus(
      bookingId,
      'in_progress',
      'confirmed',
      { startedAt: new Date() },
      { garagePhotos }
    )
    if (!started) {
      if (garagePhotos) await photoGateOrStateChanged(bookingId, 'start')
      throw stateChanged()
    }
    log.info({ bookingId, vendorId, actorId, status: 'in_progress' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    // The customer sees the garage's photos from now on (customerSeesPhotos).
    if (garagePhotoCount(updated!, 'before') > 0) {
      pushService.notifyCustomer(updated!.userId, pushMessages.customerBeforePhotos(updated!))
    }
    return toVendorBookingResponse(updated!)
  },

  async markCompleted(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'in_progress') {
      throw new AppError(
        400,
        'Only in-progress bookings can be completed',
        'INVALID_BOOKING_STATUS'
      )
    }

    // Pickup & drop finishes on Delivered, with the customer's code.
    const pickupRefusal = completeRefusal(booking)
    if (pickupRefusal) {
      throw new AppError(pickupRefusal.status, pickupRefusal.message, pickupRefusal.code)
    }

    if (completionBlockedByExtraWork(booking.charges)) throw extraWorkAwaiting()

    // 0045: two after photos from the garage, unless waived or relaxed.
    const garagePhotos = assertPhotoGate(booking, 'finish')

    const [completed] = await bookingsRepository.updateBookingStatus(
      bookingId,
      'completed',
      'in_progress',
      { completedBy: actorId, completedAt: new Date() },
      { noOpenExtraWork: true, garagePhotos }
    )
    if (!completed) {
      if (garagePhotos) await photoGateOrStateChanged(bookingId, 'finish')
      throw stateChanged()
    }

    await collectCashOnCompletion(booking)

    log.info({ bookingId, vendorId, actorId, status: 'completed', paymentMethod: booking.paymentMethod }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    pushService.notifyCustomer(
      updated!.userId,
      pushMessages.customerCompleted(updated!, { afterPhotos: garagePhotoCount(updated!, 'after') > 0 })
    )
    // Coating and detailing follow-ups for the car (0046), after the response.
    carHistoryService.scheduleAfterCompletion(bookingId)
    // A free redo done (0051): its claim closes.
    if (updated!.guaranteeRedo) guaranteeService.redoChanged(bookingId)
    // Detlio Rewards (0050): a stamp and a scratch card, or why not.
    rewardsService.scheduleAfterCompletion(bookingId)
    return toVendorBookingResponse(updated!)
  },

  // ─── Pickup & drop steps (0037) ────────────────────────────────────────────
  //
  // Picked up → At garage → (Mark in progress, the normal work) → Out for
  // delivery → Delivered, which completes the job. The order is
  // lib/pickup.ts's; each write is conditional on the state checked here
  // (bookings.repository.ts), so a second phone or a cancel in between
  // leaves one winner. Open to operators, like every job step.

  /** The garage has the car: needs the customer's pickup code. */
  async markPickedUp(vendorId: string, actorId: string, bookingId: string, code: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)
    assertPickupStep(booking, 'picked_up')
    await assertHandoverCode(booking, 'pickup', code)

    const [row] = await bookingsRepository.markPickedUp(bookingId, {
      at: new Date(),
      maxAttempts: MAX_CODE_ATTEMPTS,
    })
    if (!row) throw stateChanged()
    log.info({ bookingId, vendorId, actorId, step: 'picked_up' }, 'booking:pickup_step')

    const updated = await bookingsRepository.findBookingById(bookingId)
    pushService.notifyCustomer(updated!.userId, pushMessages.customerPickupStep(updated!, 'picked_up'))
    return toVendorBookingResponse(updated!)
  },

  /** The car has arrived at the garage. */
  async markAtGarage(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)
    assertPickupStep(booking, 'at_garage')

    const [row] = await bookingsRepository.markAtGarage(bookingId, new Date())
    if (!row) throw stateChanged()
    log.info({ bookingId, vendorId, actorId, step: 'at_garage' }, 'booking:pickup_step')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toVendorBookingResponse(updated!)
  },

  /** The work is done and the car is on its way back. */
  async markOutForDelivery(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)
    assertPickupStep(booking, 'out_for_delivery')
    // 0045: the car leaves with its after photos taken, at the garage.
    const garagePhotos = assertPhotoGate(booking, 'finish')

    const [row] = await bookingsRepository.markOutForDelivery(bookingId, new Date(), garagePhotos)
    if (!row) {
      if (garagePhotos) await photoGateOrStateChanged(bookingId, 'finish')
      throw stateChanged()
    }
    log.info({ bookingId, vendorId, actorId, step: 'out_for_delivery' }, 'booking:pickup_step')

    const updated = await bookingsRepository.findBookingById(bookingId)
    pushService.notifyCustomer(updated!.userId, pushMessages.customerPickupStep(updated!, 'out_for_delivery'))
    return toVendorBookingResponse(updated!)
  },

  /** The customer has the car back: needs the delivery code, and completes the job. */
  async markDelivered(vendorId: string, actorId: string, bookingId: string, code: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)
    assertPickupStep(booking, 'delivered')
    // Before the code is checked, so a wrong try is not spent on it.
    if (completionBlockedByExtraWork(booking.charges)) throw extraWorkAwaiting()
    const garagePhotos = assertPhotoGate(booking, 'finish')
    await assertHandoverCode(booking, 'delivery', code)

    const [row] = await bookingsRepository.markDelivered(bookingId, {
      at: new Date(),
      completedBy: actorId,
      maxAttempts: MAX_CODE_ATTEMPTS,
      garagePhotos,
    })
    if (!row) {
      if (garagePhotos) await photoGateOrStateChanged(bookingId, 'finish')
      throw stateChanged()
    }
    await collectCashOnCompletion(booking)
    log.info({ bookingId, vendorId, actorId, step: 'delivered', status: 'completed' }, 'booking:pickup_step')

    const updated = await bookingsRepository.findBookingById(bookingId)
    // Delivered completes the job: "Your car is back", and the rating ask.
    pushService.notifyCustomer(
      updated!.userId,
      pushMessages.customerCompleted(updated!, { afterPhotos: garagePhotoCount(updated!, 'after') > 0 })
    )
    carHistoryService.scheduleAfterCompletion(bookingId)
    // A free redo done (0051): its claim closes.
    if (updated!.guaranteeRedo) guaranteeService.redoChanged(bookingId)
    rewardsService.scheduleAfterCompletion(bookingId)
    return toVendorBookingResponse(updated!)
  },

  /**
   * Detlio confirms a code step from admin for a customer who cannot give
   * the code (lost phone, code locked after wrong tries), after speaking to
   * them. Same order rules and conditional write as the garage's, without
   * the code; the admin's name is stored on the booking. Answers nothing:
   * the caller reloads its own view.
   */
  async confirmHandoverAsDetlio(
    bookingId: string,
    step: 'picked_up' | 'delivered',
    adminName: string
  ) {
    const booking = await bookingsRepository.findBookingById(bookingId)
    if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
    assertPickupStep(booking, step)
    if (step === 'delivered' && completionBlockedByExtraWork(booking.charges)) throw extraWorkAwaiting()
    // 0045: Detlio holds the same standard; it waives it on the booking first
    // when there is a genuine reason.
    const garagePhotos = step === 'delivered' ? assertPhotoGate(booking, 'finish', { forDetlio: true }) : undefined

    const at = new Date()
    const [row] =
      step === 'picked_up'
        ? await bookingsRepository.markPickedUp(bookingId, { at, maxAttempts: null, overrideBy: adminName })
        : await bookingsRepository.markDelivered(bookingId, {
            at,
            completedBy: null,
            maxAttempts: null,
            overrideBy: adminName,
            garagePhotos,
          })
    if (!row) throw stateChanged()
    if (step === 'delivered') {
      await collectCashOnCompletion(booking)
      carHistoryService.scheduleAfterCompletion(bookingId)
      if (booking.guaranteeRedo) guaranteeService.redoChanged(bookingId)
      rewardsService.scheduleAfterCompletion(bookingId)
    }
    log.info({ bookingId, step, adminName }, 'booking:pickup_step_confirmed_by_detlio')
  },
}

/** The garage's own photos of a stage on a booking read with its photos. */
function garagePhotoCount(booking: BookingWithRelations, stage: JobPhotoStage): number {
  return (booking.photos ?? []).filter(
    (photo) => photo.stage === stage && (photo.uploadedByRole ?? 'garage') === 'garage'
  ).length
}

/**
 * A legacy cash booking's money is collected when the job completes, with
 * its receipt number (markCashCollected). Shared by Mark completed and
 * pickup & drop's Delivered.
 */
async function collectCashOnCompletion(booking: {
  id: string
  paymentMethod: string
  originalBookingId?: string | null
}) {
  if (booking.paymentMethod !== 'cash') return
  const { receipt } = await bookingsRepository.markCashCollected({
    bookingId: booking.id,
    rootBookingId: booking.originalBookingId ?? booking.id,
    collectedAt: new Date(),
  })
  logReceiptNumberFailure(receipt, booking.id)
}
