import { NOTE_EDIT_HOURS, noteEditRefusal, noteEditableUntil, type NoteEditRefusal } from '../../lib/booking-notes.js'
import { AT_GARAGE_ADDRESS_MESSAGE, atGarageAddressRefused, garageAddressLine } from '../../lib/garage-address.js'
import { timingSafeEqual } from 'node:crypto'
import { env } from '../../lib/env.js'
import { leadsRepository } from '../leads/leads.repository.js'
import { leadsService } from '../leads/leads.service.js'
import { AppError } from '../../lib/errors.js'
import { signAdminToken } from '../../lib/jwt.js'
import { logger } from '../../lib/logger.js'
import { adminLoginsService, adminSubjectName } from '../admin-logins/admin-logins.service.js'
import {
  adminCancellationNote,
  bookingReference,
  checkNoShow,
  isAdminCancellable,
  istDateRange,
  noShowNote,
  parseBookingSearch,
  waitingMinutes,
} from '../../lib/booking-ops.js'
import { liveFinalBill, type FinalBillRecord } from '../../lib/final-bill.js'
import { toExtraWorkView } from '../../lib/extra-work.js'
import { bookingRefundTotals } from '../../lib/refunds.js'
import { toJobPhotoView } from '../../lib/job-records.js'
import { jobPhotoLink } from '../../lib/job-photo-storage.js'
import { garagePhotoStandardView } from '../../lib/job-photo-standards.js'
import { photoComplianceByGarage, photoComplianceSince, type PhotoCompliance } from '../../lib/photo-compliance.js'
import { jobPhotosRequiredFor } from '../job-photos/job-photos.service.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { summariseAcceptTime, summarisePilot } from '../../lib/pilot-stats.js'
import { resolveServicePricing } from '../../lib/pricing.js'
import { planServiceReconcile } from '../../lib/service-reconcile.js'
import { outsideServiceCity } from '../../lib/service-city.js'
import { istDayBounds, todayDateKey } from '../../lib/slots.js'
import { vendorMissing, type MissingKey } from '../../lib/vendor-missing.js'
import { vendorReadiness } from '../../lib/vendor-readiness.js'
import { collectionListsService } from '../collection-lists/collection-lists.service.js'
import { onboardingMarksService } from '../onboarding-marks/onboarding-marks.service.js'
import { isDocumentStorageConfigured } from '../../lib/document-storage.js'
import {
  summariesByVendor,
  summariseDocuments,
  type DocumentsSummary,
} from '../../lib/vendor-documents.js'
import { vendorDocumentsRepository } from '../vendor-documents/vendor-documents.repository.js'
import { bypassReportsService } from '../bypass-reports/bypass-reports.service.js'
import { certificationRepository } from '../certification/certification.repository.js'
import { graceEndsOn, isCertified } from '../../lib/certification.js'
import { tiersService } from '../tiers/tiers.service.js'
import { usesCustomerAddress } from '../../lib/booking-types.js'
import {
  codeTriesLeft,
  customerChangeRefusal,
  isPickupOffered,
  legacyPickupIntent,
  planPickupChange,
  type PickupPatch,
  type PickupSettings,
} from '../../lib/pickup.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { bookingsService } from '../bookings/bookings.service.js'
import {
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
} from '../../lib/storage.js'
import { membersRepository } from '../members/members.repository.js'
import { membersService } from '../members/members.service.js'
import type { AddMemberInput, UpdateMemberInput } from '../members/members.validation.js'
import { refundsService } from '../refunds/refunds.service.js'
import { vendorInBin } from '../../lib/vendor-bin.js'
import { isInBin, isListedToCustomers } from '../vendors/vendors.predicates.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { vendorsService } from '../vendors/vendors.service.js'
import {
  adminRepository,
  type BookingFilterSet,
  type BookingViewWindow,
} from './admin.repository.js'
import { rewardsService } from '../rewards/rewards.service.js'
import { slotAlertsService } from '../slot-alerts/slot-alerts.service.js'
import { areaSignupsService } from '../area-signups/area-signups.service.js'
import { guaranteeService } from '../guarantee/guarantee.service.js'
import type {
  AdminCancelBookingInput,
  BookingViewCountsQuery,
  CreateBookingNoteInput,
  WaiveJobPhotosInput,
  CreateVendorInput,
  GrantSuperAdminInput,
  ListBookingsQuery,
  MarkNoShowInput,
  LoginInput,
  PickupStepOverrideInput,
  MediaUrlInput,
  PauseVendorInput,
  PilotStatsQuery,
  SetServiceActiveInput,
  UpdateVendorInput,
  UploadUrlInput,
} from './admin.validation.js'
import type { AddPhotoInput } from '../service-media/service-media.validation.js'
import { serviceMediaService } from '../service-media/service-media.service.js'
import { toManagedMedia } from '../../lib/service-media.js'

const log = logger.child({ module: 'admin' })

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Constant-time string compare to avoid leaking credential length/prefix via timing.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * A garage admin can see. One deleted forever and kept only as a tombstone
 * for its receipts is gone as far as admin is concerned: a 404, like an id
 * that never was.
 */
async function assertVendor(vendorId: string) {
  const vendor = await adminRepository.findVendorById(vendorId)
  if (!vendor || vendor.purgedAt) {
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }
  return vendor
}

/**
 * A garage admin can change: as assertVendor, and not in the Bin. A garage
 * in the Bin takes two changes only, Restore and Delete forever
 * (modules/vendor-bin); anything else is 409 VENDOR_IN_BIN, so the edit
 * page's read-only view is the server's rule too, not just the panel's.
 */
async function assertWritableVendor(vendorId: string) {
  const vendor = await assertVendor(vendorId)
  if (isInBin(vendor)) throw vendorInBin()
  return vendor
}

async function assertService(serviceId: string) {
  const service = await adminRepository.findServiceById(serviceId)
  if (!service) {
    throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
  }
  return service
}

// Only accept URLs that actually point at our bucket, so an admin can't
// register an arbitrary external image as vendor media.
function assertOwnBucketUrl(url: string, code: string): string {
  const storageKey = keyFromPublicUrl(url)
  if (!storageKey) {
    throw new AppError(400, 'Invalid image URL', code)
  }
  return storageKey
}

async function assertPhotoCapacity(vendorId: string) {
  const [{ count }] = await vendorsRepository.countPhotos(vendorId)
  if (count >= env.r2MaxPhotosPerVendor) {
    throw new AppError(
      409,
      `This garage can have at most ${env.r2MaxPhotosPerVendor} photos`,
      'PHOTO_LIMIT_REACHED'
    )
  }
}

/**
 * A service's own commission percent as the column takes it (0064): a
 * number is stored as written, null clears it, and left out (an older
 * panel) leaves what is stored.
 */
function commissionColumn(rate: number | null | undefined): { commissionRate?: string | null } {
  if (rate === undefined) return {}
  return { commissionRate: rate === null ? null : rate.toFixed(2) }
}

/**
 * A garage with no coordinates cannot be distance-sorted, cannot be found by a
 * customer browsing nearby, and cannot have its doorstep radius checked.
 *
 * Public listings already require `is_verified`, so refusing to verify without
 * a pin is what keeps pin-less garages out of customer-facing results — with no
 * special case in the listing query and no "location not set" tail to design.
 * The invariant is enforced at the one gate a human already stands at.
 */
function assertPinnedBeforeVerifying(vendor: {
  lat: number | null
  lng: number | null
}) {
  // Off by default while the pre-map-picker backlog is still unpinned — see
  // env.geoRequirePin. Verifying without a pin is survivable now that the
  // listing appends unlocated garages after the located ones; what it costs
  // them is distance sorting and doorstep coverage, not visibility.
  if (!env.geoRequirePin) return

  if (vendor.lat === null || vendor.lng === null) {
    throw new AppError(
      422,
      'Set the garage location on the map before showing it to customers',
      'VENDOR_LOCATION_REQUIRED'
    )
  }
}

/**
 * What an admin save writes for pickup & drop (lib/pickup.ts). Turning it on
 * needs the admin's tick that the garage signed the responsibility
 * agreement, recorded as "admin: <name>"; turning it off never does. The
 * legacy `pickup` answer from an older panel counts only when it differs
 * from what is stored, as that panel sends it back on every save.
 */
async function pickupPatchFor(
  current: PickupSettings,
  input: {
    pickupEnabled?: boolean
    pickupAgreementSigned?: boolean
    pickup?: 'yes' | 'nearby' | 'no' | null
    pickupRadiusKm?: number | null
  },
  sub: string
): Promise<PickupPatch> {
  const enabled = input.pickupEnabled ?? legacyPickupIntent(current.pickup, input.pickup)
  if (enabled === undefined && input.pickupRadiusKm === undefined) return {}

  const change = planPickupChange(current, {
    enabled,
    radiusKm: input.pickupRadiusKm,
    termsAccepted: input.pickupAgreementSigned,
    actor: `admin: ${await resolveNoteAuthor(sub)}`,
    now: new Date(),
  })
  if (!change.ok) {
    throw new AppError(
      400,
      "To turn on pickup & drop, tick that the garage has signed the agreement to be responsible for the customer's car from pickup until it is returned.",
      change.code
    )
  }
  return change.patch
}

// ─── Bookings ────────────────────────────────────────────────────────────────


type AdminBookingRecord = NonNullable<
  Awaited<ReturnType<typeof adminRepository.findBookingById>>
>
type BookingNoteRecord = NonNullable<
  Awaited<ReturnType<typeof adminRepository.findBookingDetail>>
>['notes'][number]

/** Someone else changed the booking between our read and our write. */
function stateChanged() {
  return new AppError(
    409,
    // The panel refetches the booking when an action is refused, so by the
    // time this is read the page already shows what changed.
    'This booking was just updated by someone else. Its latest status is shown now.',
    'BOOKING_STATE_CHANGED'
  )
}

function noteNotFound() {
  return new AppError(404, 'Note not found', 'NOTE_NOT_FOUND')
}

function bookingNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

function toBookingNoteResponse(note: BookingNoteRecord) {
  return {
    id: note.id,
    author: note.author,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    // 0065: typed by a person, or written by an action (never editable).
    // `authorSub` is the session that typed it, which the panel compares
    // with its own (GET /admin/me `sub`) to offer Edit and Delete; admin
    // only, like every note.
    kind: note.kind,
    authorSub: note.kind === 'typed' ? note.authorSub : null,
    editedAt: note.editedAt?.toISOString() ?? null,
    editableUntil: note.kind === 'typed' ? noteEditableUntil(note.createdAt).toISOString() : null,
  }
}

function noteRefused(refusal: NoteEditRefusal) {
  switch (refusal) {
    case 'system_note':
      return new AppError(409, 'This note was written by an action, so it stays as it is.', 'NOTE_SYSTEM')
    case 'not_author':
      return new AppError(403, 'Only the person who typed a note can change it.', 'NOTE_NOT_YOURS')
    case 'window_closed':
      return new AppError(409, 'A note can be changed for 24 hours after it is written.', 'NOTE_LOCKED')
  }
}

/**
 * One row of the admin bookings list: everything ops needs to answer a call
 * about a booking without opening it.
 *
 * The last three keys are the shape the panel read before this one existed.
 * The API and the panel deploy separately, so they stay until every deployed
 * panel reads `garage`, `customer` and `items` instead.
 */
/**
 * A final bill as ops sees it: everything the customer and the garage see,
 * plus the Razorpay ids to find the payment by, and when it last changed.
 */
function toAdminFinalBill(bill: FinalBillRecord) {
  return {
    id: bill.id,
    status: bill.status,
    lines: bill.lines.map((line) => ({ description: line.description, amount: line.amount })),
    totalAmount: bill.totalAmount,
    paidBefore: bill.paidBefore,
    amountDue: bill.amountDue,
    note: bill.note,
    gatewayOrderId: bill.gatewayOrderId,
    gatewayPaymentId: bill.gatewayPaymentId,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  }
}

/**
 * The balance a customer still has to pay on a final bill, for the list's
 * "Bill due" flag. Null when there is none — no bill, nothing left to pay, or
 * a booking that was cancelled (a cancelled job is not chased for money).
 */
function billDueOf(booking: AdminBookingRecord): string | null {
  if (booking.status === 'cancelled') return null
  // The final bill and any extra work waiting to be paid (0041), added up.
  const due = booking.charges.filter(
    (charge) =>
      charge.status === 'due' && (charge.kind === 'extra_work' || charge === liveFinalBill(booking.charges))
  )
  if (due.length === 0) return null
  return (due.reduce((total, charge) => total + Math.round(Number(charge.amountDue) * 100), 0) / 100).toFixed(2)
}

/**
 * Extra work on a booking as ops sees it (0041): what the customer sees, plus
 * the Razorpay ids, the refund so far and why it was closed.
 */
function toAdminExtraWork(charge: AdminBookingRecord['charges'][number]) {
  return {
    ...toExtraWorkView(charge, jobPhotoLink),
    cancelReason: charge.cancelReason ?? null,
    gatewayOrderId: charge.gatewayOrderId,
    gatewayPaymentId: charge.gatewayPaymentId,
    refundedAmount: charge.refundedAmount ?? null,
  }
}

/** A time suggestion as ops sees it: the times, the outcome, and when. */
function toAdminTimeProposal(
  proposal: {
    id: string
    status: string
    slots: string[]
    note: string | null
    expiresAt: Date
    chosenSlot: Date | null
    resultBookingId: string | null
    resolvedAt: Date | null
    createdAt: Date
  }
) {
  return {
    id: proposal.id,
    status: proposal.status,
    slots: proposal.slots,
    note: proposal.note,
    expiresAt: proposal.expiresAt.toISOString(),
    chosenSlot: proposal.chosenSlot?.toISOString() ?? null,
    resultBookingId: proposal.resultBookingId,
    resolvedAt: proposal.resolvedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
  }
}

/**
 * What is still to give back on a booking, and what has gone back, for the
 * list's "Refund owed ₹X" / "Refunded" flag: its payment and any bills, by
 * the rules in lib/refunds.ts. `moved` is whether the customer moved it to a
 * new time, which took its payment with it.
 */
function refundFlagsOf(booking: AdminBookingRecord, moved: boolean) {
  const totals = bookingRefundTotals({
    status: booking.status,
    noShow: booking.noShow,
    moved,
    // A refund instead of a free redo (0051).
    guaranteeRefund: booking.guaranteeRefundAt !== null,
    payment: booking.payment,
    charges: booking.charges,
  })
  return {
    refundOwed: Number(totals.owed) > 0 ? totals.owed : null,
    refunded: Number(totals.refunded) > 0 ? totals.refunded : null,
  }
}

function toAdminBookingRow(
  booking: AdminBookingRecord,
  notesCount: number,
  now: number,
  moved = false
) {
  return {
    id: booking.id,
    reference: bookingReference(booking.id),
    status: booking.status,
    bookingType: booking.bookingType,
    scheduledAt: booking.scheduledAt.toISOString(),
    createdAt: booking.createdAt.toISOString(),
    waitingMins: waitingMinutes(
      {
        status: booking.status,
        createdAt: booking.createdAt,
        paidAt: booking.payment?.paidAt,
      },
      now
    ),
    durationMins: booking.durationMins,
    amount: booking.amount,
    subtotalAmount: booking.subtotalAmount,
    discountAmount: booking.discountAmount,
    discountCode: booking.discountCode,
    discountFundedBy: booking.discountFundedBy,
    paymentMethod: booking.paymentMethod,
    payment: booking.payment
      ? {
          status: booking.payment.status,
          // The Razorpay payment id ops searches for in the dashboard to refund.
          gatewayTxnId: booking.payment.gatewayTxnId,
          // Which Razorpay mode it was taken in; null on payments from
          // before 0032 recorded it.
          gatewayMode: booking.payment.gatewayMode,
          paidAt: booking.payment.paidAt?.toISOString() ?? null,
          // Gift a wash (0049): what came through Razorpay and the part paid
          // with Detlio credit (which goes back as credit, never through the
          // Refunds page), and when that part went back.
          amount: booking.payment.amount,
          creditAmount: booking.payment.creditAmount,
          creditReturnedAt: booking.payment.creditReturnedAt
            ? new Date(booking.payment.creditReturnedAt).toISOString()
            : null,
        }
      : null,
    // Detlio Guarantee (0051): a free redo of an earlier job (₹0), and when
    // Detlio approved a refund instead of a redo on this one.
    guaranteeRedo: booking.guaranteeRedo,
    guaranteeRefundAt: booking.guaranteeRefundAt?.toISOString() ?? null,
    // Marked "Test" by ops: left out of the pilot numbers.
    markedTest: booking.markedTestAt
      ? { at: booking.markedTestAt.toISOString(), by: booking.markedTestBy }
      : null,
    garage: booking.vendor
      ? {
          id: booking.vendor.id,
          name: booking.vendor.businessName,
          phone: booking.vendor.phone,
        }
      : null,
    customer: booking.user
      ? { id: booking.user.id, name: booking.user.name, phone: booking.user.phone }
      : null,
    // Only a doorstep job (where the crew goes) and a pickup & drop job
    // (where the car is collected and returned) have an address; a drop-in
    // happens at the garage.
    address: usesCustomerAddress(booking.bookingType) ? booking.address : null,
    // Pickup & drop's handover steps, and who at Detlio confirmed a code
    // step for a customer who could not give the code. Never the codes.
    pickup:
      booking.bookingType === 'pickup'
        ? {
            pickedUpAt: booking.pickedUpAt?.toISOString() ?? null,
            atGarageAt: booking.atGarageAt?.toISOString() ?? null,
            outForDeliveryAt: booking.outForDeliveryAt?.toISOString() ?? null,
            deliveredAt: booking.deliveredAt?.toISOString() ?? null,
            pickupOverrideBy: booking.pickupOverrideBy,
            deliveryOverrideBy: booking.deliveryOverrideBy,
            pickupCodeTriesLeft: codeTriesLeft(booking.pickupCodeAttempts),
            deliveryCodeTriesLeft: codeTriesLeft(booking.deliveryCodeAttempts),
          }
        : null,
    vehicle: booking.vehicle
      ? {
          id: booking.vehicle.id,
          make: booking.vehicle.make,
          model: booking.vehicle.model,
          plate: booking.vehicle.licensePlate,
        }
      : null,
    items: booking.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      name: item.name,
      amount: item.amount,
      durationMins: item.durationMins,
    })),
    cancelledBy: booking.cancelledBy,
    cancelledOnBehalfOf: booking.cancelledOnBehalfOf,
    cancellationReason: booking.cancellationReason,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    noShow: booking.noShow,
    noShowMarkedAt: booking.noShowMarkedAt?.toISOString() ?? null,
    // When the garage moved the job on. Null on jobs from before these were
    // recorded, even when the status says the step happened.
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    startedAt: booking.startedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    // The garage's deadline to accept (0042), and whether the cron cancelled
    // it for missing it ("Not accepted in time", a full refund owed).
    respondBy: booking.respondBy?.toISOString() ?? null,
    notAcceptedInTime: booking.responseMissedAt?.toISOString() ?? null,
    billDue: billDueOf(booking),
    ...refundFlagsOf(booking, moved),
    notesCount,
    rescheduledFromId: booking.rescheduledFromId,
    // Deprecated — see above.
    vendor: booking.vendor
      ? {
          id: booking.vendor.id,
          businessName: booking.vendor.businessName,
          phone: booking.vendor.phone,
        }
      : null,
    user: booking.user
      ? { id: booking.user.id, name: booking.user.name, phone: booking.user.phone }
      : null,
    service: booking.service
      ? {
          id: booking.service.id,
          name: booking.service.name,
          pricingType: booking.service.pricingType,
        }
      : null,
  }
}

async function loadBookingDetail(id: string, now: number) {
  const booking = await adminRepository.findBookingDetail(id)
  if (!booking) throw bookingNotFound()

  // Who took each job photo (0045), named like the steps.
  const staffIds = [
    ...new Set(
      [booking.acceptedBy, booking.completedBy, ...booking.photos.map((photo) => photo.uploadedBy)].filter(
        (staffId): staffId is string => staffId !== null
      )
    ),
  ]
  const [rescheduledToId, names, refunds] = await Promise.all([
    adminRepository.findRescheduledToId(id),
    adminRepository.findUserNames(staffIds),
    refundsService.listForBooking(id),
  ])

  const { notes, photos, timeProposals, ...row } = booking
  const finalBill = liveFinalBill(booking.charges)
  return {
    ...toAdminBookingRow(row, notes.length, now, rescheduledToId !== null),
    // Money owed back on this booking, or given back: its payment and any
    // bills, each with what ops needs to refund it and mark it done.
    refunds,
    // The bill that stands, and the unpaid ones it replaced, newest first. A
    // replaced bill with a payment id on it is money taken for a bill that no
    // longer stands — a refund to do.
    finalBill: finalBill ? toAdminFinalBill(finalBill) : null,
    replacedFinalBills: booking.charges
      .filter((charge) => charge.kind === 'final_bill' && charge.status === 'cancelled')
      .map(toAdminFinalBill),
    // Extra work the garage asked for (0041), newest first, whatever became
    // of each, and the times it suggested instead of declining.
    extraWork: booking.charges.filter((charge) => charge.kind === 'extra_work').map(toAdminExtraWork),
    timeProposals: timeProposals.map(toAdminTimeProposal),
    // Every photo of the job, both sides', with who added it (0045): the
    // garage person's name, or the customer's. Null once that account is gone.
    photos: photos.map((photo) => ({
      ...toJobPhotoView(photo, jobPhotoLink),
      uploadedByName: photo.uploadedBy ? (names.get(photo.uploadedBy) ?? null) : null,
    })),
    // What Start and Complete wait for on this job, as the garage sees it,
    // and Detlio's waiver with its name and reason.
    photoStandard: garagePhotoStandardView(
      {
        status: booking.status,
        bookingType: booking.bookingType,
        scheduledAt: booking.scheduledAt,
        completedAt: booking.completedAt,
        pickedUpAt: booking.pickedUpAt,
        outForDeliveryAt: booking.outForDeliveryAt,
        photosWaivedAt: booking.photosWaivedAt,
        photos,
      },
      jobPhotosRequiredFor(booking.vendorId),
      now
    ),
    photosWaiver: booking.photosWaivedAt
      ? {
          at: booking.photosWaivedAt.toISOString(),
          by: booking.photosWaivedBy,
          reason: booking.photosWaivedReason,
        }
      : null,
    lat: booking.lat,
    lng: booking.lng,
    // A doorstep-only garage may have no street address (0064): the city.
    garageAddress: booking.vendor ? garageAddressLine(booking.vendor) : null,
    // Who at the garage moved the job on. Null on bookings from before the
    // team model, and on any the garage never touched.
    acceptedByName: booking.acceptedBy ? (names.get(booking.acceptedBy) ?? null) : null,
    completedByName: booking.completedBy ? (names.get(booking.completedBy) ?? null) : null,
    originalBookingId: booking.originalBookingId,
    rescheduledToId,
    rescheduleCount: booking.rescheduleCount,
    notes: notes.map(toBookingNoteResponse),
  }
}

/**
 * Who wrote a note, as a name. The break-glass login is the shared admin
 * account and has no users row, so it signs as 'admin'; a personal admin
 * login (0058) signs with its name, and a named super-admin as themselves.
 */
async function resolveNoteAuthor(sub: string): Promise<string> {
  const adminName = await adminSubjectName(sub)
  if (adminName) return adminName
  const user = await adminRepository.findUserById(sub)
  return (user?.name.trim() || user?.phone || sub).slice(0, 100)
}

/**
 * A garage's Detlio Certified standing for the admin list (0048): certified
 * now, eligible at its last evaluation, falling short since (its 14 days
 * running), and how the last certification ended. Null when never evaluated
 * or certified.
 */
function certificationSummary(
  row:
    | {
        certifiedAt: Date | null
        revokedAt: Date | null
        revokeKind: string | null
        eligible: boolean
        lastEvaluatedAt: Date | null
        ineligibleSince: Date | null
      }
    | undefined
) {
  if (!row) return null
  const certified = isCertified(row)
  return {
    certified,
    certifiedAt: certified ? (row.certifiedAt?.toISOString() ?? null) : null,
    eligible: row.eligible,
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    keepsUntil: certified && row.ineligibleSince ? graceEndsOn(row.ineligibleSince) : null,
    endedAt: !certified && row.revokedAt ? row.revokedAt.toISOString() : null,
    endedKind: !certified && row.revokedAt ? row.revokeKind : null,
  }
}

/**
 * What the bookings list's saved views need (0059): today's IST day,
 * waiting bookings from a day back (Today's rule) and, for Needs action,
 * the bookings with a refund owed (the Refunds page's own rule, so the two
 * never disagree).
 */
async function bookingViewWindow(
  now: number,
  withRefunds: boolean
): Promise<BookingViewWindow> {
  const { start, end } = istDayBounds(todayDateKey(now))
  const owed = withRefunds ? await refundsService.listRefunds({ status: 'owed' }) : []
  return {
    todayStart: start,
    todayEnd: end,
    waitingAfter: new Date(now - 24 * 60 * 60 * 1000),
    refundOwedIds: [
      ...new Set(owed.flatMap((refund) => (refund.bookingId ? [refund.bookingId] : []))),
    ],
  }
}

/**
 * The bookings list's filters (0059) as the repository reads them, the same
 * for the list and its views' counts.
 */
function bookingFilterSet(
  query: BookingViewCountsQuery,
  refundOwedIds: readonly string[]
): BookingFilterSet {
  const { start, end } = istDateRange(query.from, query.to)
  return {
    status: query.status,
    vendorId: query.vendorId,
    search: parseBookingSearch(query.q),
    start,
    end,
    test: query.test,
    bookingType: query.bookingType,
    payment: query.payment,
    refundOwedIds,
  }
}

/** A garage with no completed jobs in the window: nothing to grade. */
const NO_COMPLETED_JOBS: PhotoCompliance = { jobs: 0, compliant: 0, waived: 0, percent: null }

export const adminService = {
  async login(input: LoginInput): Promise<{ accessToken: string }> {
    const validUser = safeEqual(input.username, env.adminUsername)
    const validPass = safeEqual(input.password, env.adminPassword)

    // The shared env login: the bootstrap and break-glass door, as before.
    if (validUser && validPass) {
      const accessToken = await signAdminToken()
      log.info('admin:login')
      return { accessToken }
    }

    // Otherwise a personal login (0058). One refusal for every way of being
    // wrong, so it never says which usernames exist.
    const sub = await adminLoginsService.signIn(input.username, input.password)
    if (!sub) {
      throw new AppError(401, 'Invalid username or password', 'INVALID_CREDENTIALS')
    }
    return { accessToken: await signAdminToken(sub) }
  },

  async listVendors() {
    const vendors = await adminRepository.listVendors()
    // One grouped count for every garage rather than a query per card:
    // every booking it has had, in any state, for the card's "Has N
    // bookings".
    const bookingCounts = new Map(
      (await adminRepository.countBookingsByVendor()).map((row) => [
        row.vendorId,
        row.value,
      ])
    )
    const drawnAreas = new Set(await adminRepository.listVendorIdsWithDoorstepArea())
    // Photo compliance (0045, lib/photo-compliance.ts): the share of each
    // garage's jobs completed in the last 90 days with 2 before and 2 after
    // photos of its own. One grouped read for every garage.
    const now = new Date()
    const compliance = photoComplianceByGarage(
      await adminRepository.listPhotoComplianceJobs(photoComplianceSince(now)),
      now
    )
    // Garage documents (0043), as type and status only, for the "Documents
    // to review" chip and the checklist. Null for every garage while they
    // are off.
    const documentsOn = isDocumentStorageConfigured()
    const documents = documentsOn
      ? summariesByVendor(await vendorDocumentsRepository.listAllStates())
      : new Map<string, DocumentsSummary>()
    // Detlio Certified (0048), from each garage's last evaluation: the
    // "Certified" and "Eligible, not yet certified" chips. Never the
    // snapshot's rules (the edit page measures afresh).
    const certifications = new Map(
      (await certificationRepository.listStates()).map((row) => [row.vendorId, row])
    )
    // Bronze / Silver / Gold (0063): the tier each garage holds (whatever
    // customers are shown), for the card's tier chip. Three grouped reads.
    const tiers = await tiersService.heldTiers(vendors.map((vendor) => vendor.id), now)
    // Bypass reports (0052): each garage's strikes, confirmed reports of the
    // last 180 IST days. One grouped read; 2 or more are highlighted.
    const strikes = await bypassReportsService.strikesByGarage(now)
    // Detlio Guarantee (0051): approved free redo claims per garage in the
    // last 90 days, for the card's "N redo claims in 90 days". Null while off.
    const redoClaims = await guaranteeService.approvedByGarage(now)
    // Onboarding marks (0059): what each garage still owes us (worked out
    // here, lib/vendor-missing.ts), its open marks and its open collection
    // list. One grouped read each: payout accounts, open marks, open items.
    const [payoutIds, openMarks] = await Promise.all([
      onboardingMarksService.payoutVendorIds(),
      onboardingMarksService.openBriefsByVendor(),
    ])
    const documentSummaryOf = (vendorId: string) =>
      documentsOn ? (documents.get(vendorId) ?? summariseDocuments([])) : null
    const missing = new Map<string, MissingKey[]>(
      vendors.map((vendor) => [
        vendor.id,
        vendorMissing({
          ...vendor,
          photoCount: vendor.photos.length,
          hasDoorstepArea: drawnAreas.has(vendor.id),
          documents: documentSummaryOf(vendor.id),
          hasPayout: payoutIds.has(vendor.id),
        }),
      ])
    )
    const openCollection = await collectionListsService.openCollectionByVendor(missing)
    // Still the full array, every stage and the Bin included: the Bookings
    // garage filter reads this list too (and leaves the Bin out itself). The
    // panel's chips filter and count it on the client. A garage deleted
    // forever and kept as a tombstone is not in it at all.
    return vendors.map(({ services, photos, workingHours, ...vendor }) => {
      const hasDoorstepArea = drawnAreas.has(vendor.id)
      const documentSummary = documentSummaryOf(vendor.id)
      return {
        ...vendor,
        serviceCount: services.length,
        bookingCount: bookingCounts.get(vendor.id) ?? 0,
        // The same sign customers see, so ops knows which garages carry it. A
        // garage whose city says Chennai but shows it is usually pinned wrong.
        outsideServiceCity: outsideServiceCity(vendor),
        hasDoorstepArea,
        // The customer lists' own rule (vendors.predicates.ts), so "Live" in
        // the panel is exactly the garages customers can find.
        live: isListedToCustomers(vendor),
        // On with the responsibility terms on file (lib/pickup.ts).
        pickupEnabled: isPickupOffered(vendor),
        documents: documentSummary,
        certification: certificationSummary(certifications.get(vendor.id)),
        tier: tiers.get(vendor.id) ?? null,
        tierHidden: vendor.tierHidden,
        photoCompliance: compliance.get(vendor.id) ?? NO_COMPLETED_JOBS,
        bypassStrikes: strikes.get(vendor.id) ?? 0,
        redoClaims90d: redoClaims ? (redoClaims.get(vendor.id) ?? 0) : null,
        readiness: vendorReadiness({
          ...vendor,
          hasDoorstepArea,
          photoCount: photos.length,
          services,
          workingHours,
          documents: documentSummary,
        }),
        missing: missing.get(vendor.id) ?? [],
        openMarks: openMarks.get(vendor.id) ?? [],
        onboardedByName: vendor.onboardedByName ?? null,
        openCollection: openCollection.get(vendor.id) ?? null,
      }
    })
  },

  async getVendor(id: string) {
    // Holidays from today on: past ones are history nobody acts on here.
    const vendor = await adminRepository.findVendorDetailById(id, todayDateKey())
    // A garage in the Bin still opens, read-only, with its Restore button;
    // one deleted forever does not.
    if (!vendor || vendor.purgedAt) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }
    // So the editor's "How customers book" can say a drawn area, not the
    // radius, is what covers doorstep customers.
    const documentsOn = isDocumentStorageConfigured()
    const [hasDoorstepArea, payoutIds, documentRows] = await Promise.all([
      adminRepository.hasDoorstepArea(id),
      onboardingMarksService.payoutVendorIds([id]),
      documentsOn ? vendorDocumentsRepository.listDocuments(id) : Promise.resolve([]),
    ])
    const documents = documentsOn ? summariseDocuments(documentRows) : null
    // The Garages list's checklist and missing keys (0059), for the
    // editor's status panel: the same rules on the same facts.
    const facts = {
      ...vendor,
      hasDoorstepArea,
      photoCount: vendor.photos.length,
      services: vendor.services,
      workingHours: vendor.workingHours,
      documents,
    }
    // `images` stays the photo rows the editor always read; `media` is the
    // photo-and-video block's view of the same rows.
    return {
      ...vendor,
      hasDoorstepArea,
      readiness: vendorReadiness(facts),
      missing: vendorMissing({ ...facts, hasPayout: payoutIds.has(id) }),
      onboardedByName: vendor.onboardedByName ?? null,
      pickupEnabled: isPickupOffered(vendor),
      services: vendor.services.map(({ images, ...service }) => ({
        ...service,
        images: images.filter((image) => image.kind === 'image'),
        media: toManagedMedia(images),
      })),
    }
  },

  async updateVendor(id: string, input: UpdateVendorInput, sub: string) {
    const vendor = await assertWritableVendor(id)

    // Pickup & drop's tick, checked before anything is written, like the
    // hours below.
    const pickupPatch = await pickupPatchFor(vendor, input, sub)

    // Checked before anything is written. The owner, the vendor row and the
    // hours are separate writes, so a bad Saturday found after the first two
    // would return an error for a save that had in fact half happened — and
    // the admin reads an error as "nothing saved".
    for (const day of input.workingHours ?? []) {
      if (!day.isClosed && day.openTime >= day.closeTime) {
        throw new AppError(
          400,
          `Opening time must be before closing time on ${DAY_NAMES[day.dayOfWeek]}`,
          'INVALID_WORKING_HOURS'
        )
      }
    }

    // Customers drive in to an at-garage garage, so it keeps its address
    // and pincode; a doorstep-only one needs only its pin (0064).
    // Before any write, like the hours above.
    if (atGarageAddressRefused(vendor, input)) {
      throw new AppError(400, AT_GARAGE_ADDRESS_MESSAGE, 'ADDRESS_REQUIRED')
    }

    // The services list, planned before anything is written for the same
    // reason: a stale tab naming a service deleted since is refused whole
    // (lib/service-reconcile.ts), not after the vendor row has been saved.
    const servicePlan =
      input.services !== undefined
        ? planServiceReconcile(input.services, await adminRepository.listServiceStates(id))
        : null
    if (servicePlan && servicePlan.deleted.length > 0) {
      throw new AppError(
        409,
        'A service in this list was deleted since the page loaded. Reload to see the latest services, then save again.',
        'SERVICE_DELETED'
      )
    }

    // Owner name/phone live on the linked user row. Guard against moving the
    // owner phone onto a number that already belongs to another account.
    if (input.ownerPhone !== undefined || input.ownerName !== undefined) {
      if (input.ownerPhone !== undefined) {
        const existing = await adminRepository.findUserByPhone(input.ownerPhone)
        if (existing && existing.id !== vendor.ownerId) {
          throw new AppError(
            409,
            'Another account already uses this owner phone',
            'PHONE_IN_USE'
          )
        }
      }
      await adminRepository.updateUser(vendor.ownerId, {
        ...(input.ownerName !== undefined && { name: input.ownerName }),
        ...(input.ownerPhone !== undefined && { phone: input.ownerPhone }),
      })
    }

    // Flipping isVerified through the general update has the same requirement
    // as the dedicated verify endpoint, and must check against the pin the row
    // will have *after* this patch — an admin can legitimately set the
    // coordinates and verify in one submit.
    if (input.isVerified) {
      assertPinnedBeforeVerifying({
        lat: input.lat ?? vendor.lat,
        lng: input.lng ?? vendor.lng,
      })
    }

    const pinMoved =
      input.lat !== undefined &&
      input.lng !== undefined &&
      (input.lat !== vendor.lat || input.lng !== vendor.lng)

    if (input.confirmLocation === true && !pinMoved && vendor.lat === null) {
      throw new AppError(
        422,
        'Set the garage location before confirming it',
        'VENDOR_LOCATION_REQUIRED'
      )
    }

    // Only forward vendor-table columns that were actually provided. `null`
    // clears a nullable column; `undefined` leaves it untouched.
    const patch: Parameters<typeof adminRepository.updateVendor>[1] = {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.whatsapp !== undefined && { whatsapp: input.whatsapp }),
      ...(input.yearsInOperation !== undefined && {
        yearsInOperation: input.yearsInOperation,
      }),
      ...(input.mapsUrl !== undefined && { mapsUrl: input.mapsUrl }),
      ...pickupPatch,
      ...(input.doorstepRadiusKm !== undefined && {
        doorstepRadiusKm: input.doorstepRadiusKm,
      }),
      // Staff placing a pin by hand is its own provenance, and it supersedes
      // whatever the vendor originally set. Moving it also counts as confirming
      // it — an admin who just dragged a marker onto a garage has done exactly
      // the checking that `geoConfirmedAt` records.
      //
      // Compared against the stored value rather than merely being present: the
      // edit form round-trips the current coordinates on every save, so keying
      // off presence alone would let someone confirm a pin by editing a phone
      // number.
      ...(pinMoved && {
        lat: input.lat,
        lng: input.lng,
        geoSource: 'admin' as const,
        geoConfirmedAt: new Date(),
      }),
      // An explicit "this pin is already right" from the admin screen, for the
      // common case where nothing needs moving. Without it there was no way to
      // confirm a pin at all once a vendor was verified — `verifyVendor` was the
      // only writer, and it cannot run twice.
      ...(input.confirmLocation === true && { geoConfirmedAt: new Date() }),
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && {
        doorstepEnabled: input.doorstepEnabled,
      }),
      ...(input.slotIntervalMins !== undefined && {
        slotIntervalMins: input.slotIntervalMins,
      }),
      ...(input.bays !== undefined && { bays: input.bays }),
      ...(input.jobsPerDay !== undefined && { jobsPerDay: input.jobsPerDay }),
      ...(input.vehicleTypes !== undefined && { vehicleTypes: input.vehicleTypes }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.onboardedByName !== undefined && {
        onboardedByName: input.onboardedByName,
      }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.isVerified !== undefined && { isVerified: input.isVerified }),
    }

    const [updated] = Object.keys(patch).length
      ? await adminRepository.updateVendor(id, patch)
      : [vendor]

    // Per-day hours, exactly as given, for only the days given. The panel
    // sends them only when the admin touched the schedule, so saving any other
    // field leaves the garage's hours as they were.
    if (input.workingHours !== undefined) {
      await vendorsRepository.upsertWorkingHours(id, input.workingHours)
    } else if (input.workingDays !== undefined) {
      // The older shape: one schedule for every open day. Still honoured for
      // a caller that sends it, but it rewrites the whole week.
      await adminRepository.deleteWorkingHours(id)
      if (input.workingDays.length > 0) {
        const open = new Set(input.workingDays)
        const openTime = input.openTime ?? '09:00'
        const closeTime = input.closeTime ?? '18:00'
        await adminRepository.insertWorkingHours(
          Array.from({ length: 7 }, (_, dayOfWeek) => ({
            vendorId: id,
            dayOfWeek,
            openTime,
            closeTime,
            isClosed: !open.has(dayOfWeek),
          }))
        )
      }
    }

    // Reconcile the services list when provided (lib/service-reconcile.ts).
    // Live rows are updated in place, rows without an id inserted, and live
    // services missing from the payload soft-deleted (bookings reference
    // services with a restrict FK). An id from a stale tab is never taken on
    // trust: a service hidden since stays hidden, and one deleted since made
    // the save refuse above, so it can never come back as a fresh copy.
    if (input.services !== undefined && servicePlan) {
      const plan = servicePlan
      const columnsFor = (s: (typeof input.services)[number]) => ({
        name: s.name,
        description: s.description ?? null,
        category: s.category,
        ...resolveServicePricing(s),
        // Left blank: no duration (0064). The slot calendar holds the
        // default 60 minutes for it; admin flags "Duration not set".
        durationMins: s.durationMins ?? null,
        ...commissionColumn(s.commissionRate),
      })

      for (const row of plan.update) {
        await adminRepository.updateService(row.id, {
          ...columnsFor(input.services[row.index]!),
          isActive: row.isActive,
        })
      }

      const toInsert: Parameters<typeof adminRepository.insertServices>[0] =
        plan.insert.map((index) => ({ vendorId: id, ...columnsFor(input.services![index]!) }))
      if (toInsert.length > 0) {
        await adminRepository.insertServices(toInsert)
      }

      if (plan.deactivate.length > 0) {
        await adminRepository.deactivateServices(plan.deactivate)
      }
    }

    if (pickupPatch.pickup !== undefined) {
      log.info({ vendorId: id, pickup: pickupPatch.pickup }, 'admin:vendor-pickup-updated')
    }
    log.info({ vendorId: id }, 'admin:vendor-updated')
    // Hours, bays, the day's cap or the slot length may have made room (0047).
    slotAlertsService.garageChanged(id, 'admin_garage_updated')
    // A status, verification or pin change may list it in a new area (0062).
    areaSignupsService.launchSoon()
    return { ...updated, pickupEnabled: isPickupOffered(updated) }
  },

  /**
   * The garage's hidden services: plain services switched off, by the garage
   * in its app or from here. Packages are left out, as everywhere in admin.
   * The editor loads only live services, so this list is the only way back to
   * a hidden one.
   */
  async listHiddenServices(vendorId: string) {
    await assertVendor(vendorId)
    const services = await vendorsService.listMyServices(vendorId)
    return services.filter((service) => !service.isActive)
  },

  /**
   * Hides a service from customers, or shows a hidden one again — the same
   * switch the garage has in its app, so a hidden service keeps its bookings
   * and its history and is never deleted.
   *
   * Two refusals the garage's switch does not have. A package is a 404 here:
   * admin cannot see or edit packages, so it should not be able to switch one
   * off blind. And a service inside a package cannot be hidden: the package
   * would still list it as included while customers could no longer find it
   * on its own.
   */
  async setServiceActive(
    vendorId: string,
    serviceId: string,
    input: SetServiceActiveInput
  ) {
    await assertWritableVendor(vendorId)

    // findServiceById excludes packages, and a service of another garage is
    // as unknown here as a made-up id.
    const service = await vendorsRepository.findServiceById(vendorId, serviceId)
    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    if (!input.isActive) {
      const containing = await vendorsRepository.findPackagesContaining(
        vendorId,
        serviceId
      )
      if (containing.length > 0) {
        const names = containing.map((p) => `"${p.name}"`).join(', ')
        const one = containing.length === 1
        throw new AppError(
          409,
          `This service is part of the ${one ? 'package' : 'packages'} ${names}. Take it out of ${one ? 'that package' : 'those packages'} in the garage app first, then hide it.`,
          'SERVICE_IN_PACKAGE'
        )
      }
    }

    const updated = await vendorsService.toggleServiceActive(
      vendorId,
      serviceId,
      input
    )
    log.info(
      { vendorId, serviceId, isActive: input.isActive },
      'admin:service-visibility-changed'
    )
    return updated
  },

  /**
   * Deletes a service, live or hidden — the garage app's Delete. One nobody
   * has booked goes for good; one that bookings name is marked deleted, so
   * it is listed nowhere again while those bookings keep it. A service in a
   * package is refused, as hiding it is: take it out of the package first.
   */
  async deleteService(vendorId: string, serviceId: string) {
    await assertWritableVendor(vendorId)
    const deleted = await vendorsService.deleteService(vendorId, serviceId)
    log.info({ vendorId, serviceId }, 'admin:service-deleted')
    return deleted
  },

  /**
   * Where demand outruns supply.
   *
   * Each cell reports how many live garages and how many doorstep bookings it
   * contains. `gap` is the ops signal: bookings with no garage in the cell means
   * customers are being served from further away than they should be, which is
   * where the next garage is worth recruiting.
   */
  async getDemandSupply() {
    const cells = await adminRepository.getDemandSupplyCells()

    return cells.map((cell) => ({
      ...cell,
      // Positive when a cell has demand it cannot serve locally. Kept as a raw
      // difference rather than a ratio so a cell with 3 bookings and 0 garages
      // is not indistinguishable from one with 30 and 0.
      gap: cell.bookingCount - cell.vendorCount,
    }))
  },

  /**
   * The pilot's numbers over the last 7 or 30 days, rolling from now: the
   * checkout funnel, how bookings ended, the money, the busiest garages, the
   * median minutes from payment to the garage accepting, and refunds (all
   * still owed, and those recorded in the window). Definitions live in
   * lib/pilot-stats.ts.
   *
   * The accept time reads `accepted_at`, which only bookings accepted since
   * migration 0028 have; under three accepts in the window it says so rather
   * than showing a median of one or two.
   */
  async getPilotStats(query: PilotStatsQuery, now = Date.now()) {
    const since = new Date(now - query.days * 24 * 60 * 60 * 1000)
    const [intents, bookingRows, accepts, refunds] = await Promise.all([
      adminRepository.listIntentsCreatedSince(since),
      adminRepository.listBookingsCreatedSince(since),
      adminRepository.listAcceptsSince(since),
      refundsService.pilotRefunds(since),
    ])

    return {
      days: query.days,
      since: since.toISOString(),
      ...summarisePilot(intents, bookingRows),
      ...summariseAcceptTime(accepts, since),
      ...refunds,
    }
  },

  async verifyVendor(id: string) {
    const vendor = await assertWritableVendor(id)

    assertPinnedBeforeVerifying(vendor)

    // Verifying is the moment a human looked at this garage, so it is also the
    // moment its pin becomes confirmed.
    const [updated] = await adminRepository.verifyVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-verified')
    // Its area may go live now (customer reach, 0062; the cron catches any miss).
    areaSignupsService.launchSoon()
    return updated
  },

  async archiveVendor(id: string) {
    await assertWritableVendor(id)

    const [updated] = await adminRepository.archiveVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-archived')
    return updated
  },

  async unarchiveVendor(id: string) {
    await assertWritableVendor(id)

    const [updated] = await adminRepository.unarchiveVendor(id)
    log.info({ vendorId: id }, 'admin:vendor-unarchived')
    slotAlertsService.garageChanged(id, 'admin_unarchived')
    areaSignupsService.launchSoon()
    return updated
  },

  /**
   * Stops a garage taking new bookings on its behalf. Same effect as the
   * owner's own switch: out of the lists, checkout refused, existing bookings
   * untouched. Pausing a paused garage only changes the reason.
   */
  async pauseVendor(id: string, input: PauseVendorInput) {
    const vendor = await assertWritableVendor(id)
    const [updated] = await vendorsRepository.updateVendor(id, {
      bookingsPausedAt: vendor.bookingsPausedAt ?? new Date(),
      bookingsPausedReason: input.reason || null,
    })
    log.info({ vendorId: id }, 'admin:vendor-paused')
    return updated
  },

  async resumeVendor(id: string) {
    await assertWritableVendor(id)
    const [updated] = await vendorsRepository.updateVendor(id, {
      bookingsPausedAt: null,
      bookingsPausedReason: null,
    })
    log.info({ vendorId: id }, 'admin:vendor-resumed')
    slotAlertsService.garageChanged(id, 'admin_resumed')
    areaSignupsService.launchSoon()
    return updated
  },

  async createVendor(input: CreateVendorInput, sub: string) {
    // Onboarded from a lead (0064): that lead must still be waiting for its
    // garage, checked before anything is written.
    if (input.leadId) {
      const lead = await leadsRepository.findById(input.leadId)
      if (!lead) throw new AppError(404, 'Lead not found', 'LEAD_NOT_FOUND')
      if (lead.vendorId) {
        throw new AppError(409, 'That lead is already a garage.', 'LEAD_ALREADY_ONBOARDED')
      }
    }

    // Pickup & drop's tick, before anything is written.
    const pickupPatch = await pickupPatchFor(
      { pickup: null, pickupRadiusKm: null, pickupTermsAcceptedAt: null },
      input,
      sub
    )

    // Resolve (or create) the owner user for this vendor.
    let owner = await adminRepository.findUserByPhone(input.ownerPhone)

    if (owner) {
      if (!owner.isVendorOwner) {
        ;[owner] = await adminRepository.setUserAsVendorOwner(owner.id)
      }
      // No "already a vendor" block: one person owning several garages is the
      // point of the team model, and refusing it here would leave admins unable
      // to onboard the exact operators this feature exists for.
    } else {
      ;[owner] = await adminRepository.createOwner({
        name: input.ownerName,
        phone: input.ownerPhone,
      })
    }

    if (input.isVerified) {
      assertPinnedBeforeVerifying({
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      })
    }

    const [vendor] = await adminRepository.createVendor({
      ownerId: owner.id,
      businessName: input.businessName,
      phone: input.phone,
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      yearsInOperation: input.yearsInOperation ?? null,
      mapsUrl: input.mapsUrl ?? null,
      pickup: null,
      pickupRadiusKm: null,
      ...pickupPatch,
      doorstepRadiusKm: input.doorstepRadiusKm ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      ...(input.lat !== undefined && { geoSource: 'admin' as const }),
      ...(input.dropinEnabled !== undefined && { dropinEnabled: input.dropinEnabled }),
      ...(input.doorstepEnabled !== undefined && { doorstepEnabled: input.doorstepEnabled }),
      ...(input.slotIntervalMins !== undefined && { slotIntervalMins: input.slotIntervalMins }),
      bays: input.bays ?? null,
      jobsPerDay: input.jobsPerDay ?? null,
      ...(input.vehicleTypes !== undefined && { vehicleTypes: input.vehicleTypes }),
      notes: input.notes ?? null,
      onboardedByName: input.onboardedByName ?? null,
      ...(input.status !== undefined && { status: input.status }),
      ...(input.isVerified !== undefined && { isVerified: input.isVerified }),
    })

    // The owner's seat. Same write as the self-serve path — both company-create
    // paths dual-write, so no company is ever left with zero members.
    await membersRepository.createOwnerMembership(vendor.id, owner.id)

    // Working hours: open on the selected days, closed on the rest. Only written
    // when the admin picked days, so a bare vendor keeps the defaults (none).
    if (input.workingDays && input.workingDays.length > 0) {
      const open = new Set(input.workingDays)
      const openTime = input.openTime ?? '09:00'
      const closeTime = input.closeTime ?? '18:00'
      await adminRepository.insertWorkingHours(
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
          vendorId: vendor.id,
          dayOfWeek,
          openTime,
          closeTime,
          isClosed: !open.has(dayOfWeek),
        }))
      )
    }

    if (input.services && input.services.length > 0) {
      await adminRepository.insertServices(
        input.services.map((s) => ({
          vendorId: vendor.id,
          name: s.name,
          description: s.description ?? null,
          category: s.category,
          // Resolve pricing type + tiers into the columns to persist.
          ...resolveServicePricing(s),
          // No duration given: none is stored (0064), never guessed.
          durationMins: s.durationMins ?? null,
          ...commissionColumn(s.commissionRate),
        }))
      )
    }

    // The lead it came from is now this garage. Only while that lead is
    // still unlinked, so a double press links it once; the garage stands
    // either way. A customer's recommendation made into that lead is linked
    // to the garage in the same transaction (its referral credit).
    if (input.leadId) {
      const linked = await leadsService
        .linkOnboardedGarage(input.leadId, vendor.id, new Date())
        .catch((err: unknown) => {
          log.error({ err, vendorId: vendor.id }, 'admin:lead_link_failed')
          return false
        })
      if (!linked) log.warn({ vendorId: vendor.id }, 'admin:lead_not_linked')
    }

    log.info({ vendorId: vendor.id, ownerId: owner.id }, 'admin:vendor-created')
    return vendor
  },

  async listBookings(query: ListBookingsQuery, now = Date.now()) {
    // The refunds owed are read only when a rule needs them.
    const window =
      query.view || query.payment === 'refund_owed'
        ? await bookingViewWindow(
            now,
            query.view === 'needs_action' || query.payment === 'refund_owed'
          )
        : null
    const ids = await adminRepository.searchBookingIds({
      ...bookingFilterSet(query, window?.refundOwedIds ?? []),
      ...(query.view && window && { view: { kind: query.view, window } }),
      after: query.cursor ?? null,
      limit: query.limit,
      offset: query.cursor ? 0 : (query.page - 1) * query.limit,
    })

    const [rows, notesCounts, movedIds] = await Promise.all([
      adminRepository.findBookingsByIds(ids),
      adminRepository.countNotesByBooking(ids),
      adminRepository.findMovedBookingIds(ids),
    ])

    // The rows come back unordered; the id query decided the order.
    const byId = new Map(rows.map((row) => [row.id, row]))
    return ids.flatMap((id) => {
      const booking = byId.get(id)
      return booking
        ? [toAdminBookingRow(booking, notesCounts.get(id) ?? 0, now, movedIds.has(id))]
        : []
    })
  },

  /**
   * How many bookings each saved view holds (0059), under every filter the
   * list has, so a chip's count is the rows it lists. One count query,
   * after the refunds owed.
   */
  async bookingViewCounts(query: BookingViewCountsQuery, now = Date.now()) {
    const window = await bookingViewWindow(now, true)
    return adminRepository.countBookingViews(
      bookingFilterSet(query, window.refundOwedIds),
      window
    )
  },

  async getBooking(id: string, now = Date.now()) {
    return loadBookingDetail(id, now)
  },

  /**
   * Cancels a booking as Detlio, on behalf of whoever's call it was.
   *
   * Allowed from any state the booking is still live in — unlike the
   * customer's cancel, there is no 2-hour cutoff: ops cancels because
   * something has already gone wrong, often at the last minute. The money is
   * not touched here: a paid one goes on the Refunds page (and gets the alert
   * below) until it is refunded there, or, with AUTO_REFUNDS on, is refunded
   * through Razorpay right after this commits (refundsService.queueAutoRefund).
   */
  async cancelBooking(id: string, sub: string, input: AdminCancelBookingInput) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    if (!isAdminCancellable(booking.status)) {
      throw new AppError(
        400,
        'Only pending, confirmed or in-progress bookings can be cancelled',
        'INVALID_BOOKING_STATUS'
      )
    }

    const author = await resolveNoteAuthor(sub)
    const cancelled = await adminRepository.cancelBookingAsAdmin(
      id,
      booking.status,
      {
        onBehalfOf: input.onBehalfOf,
        reason: input.reason,
        noShow: null,
        at: new Date(),
      },
      { author, body: adminCancellationNote(input.onBehalfOf, input.reason) }
    )
    if (!cancelled) throw stateChanged()

    log.info(
      { bookingId: id, from: booking.status, onBehalfOf: input.onBehalfOf, author },
      'admin:booking-cancelled'
    )
    // Recorded only if it was paid for (lib/analytics.ts bookingEventProps).
    // A free redo (0051) was never a booking anyone paid for: no usage event.
    if (!booking.guaranteeRedo) analyticsService.bookingCancelled(id, 'detlio')
    // Its time is free again: anyone waiting for that day hears (0047).
    slotAlertsService.capacityFreed(booking, 'admin_cancelled')
    // A free redo that did not happen (0051): its claim moves on.
    if (booking.guaranteeRedo) guaranteeService.redoChanged(booking.id)

    // Only a paid booking leaves anything to do: an unpaid one has no money
    // to return. With AUTO_REFUNDS on it goes back at once.
    if (booking.payment?.status === 'paid') {
      const updated = await adminRepository.findBookingById(id)
      alertOps({
        kind: 'admin_cancelled',
        booking: updated!,
        onBehalfOf: input.onBehalfOf,
        reason: input.reason,
      })
      refundsService.queueAutoRefund({ kind: 'booking', id })
    }

    return loadBookingDetail(id, Date.now())
  },

  /**
   * Records who didn't turn up for an accepted booking, and cancels it.
   *
   * The party decides the money, per the published policy: a customer
   * no-show keeps the payment (the garage held the slot), so the payment row
   * is deliberately left as it is; a garage no-show is always refunded in
   * full: the alert asks for it, and AUTO_REFUNDS sends it when on.
   */
  async markNoShow(id: string, sub: string, input: MarkNoShowInput, now = Date.now()) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    // A pickup & drop job whose car the garage collected did not have a
    // customer who failed to turn up.
    if (input.party === 'customer' && customerChangeRefusal(booking)) {
      throw new AppError(
        400,
        'The garage already collected this car, so the customer did turn up. Cancel the booking instead if it has to stop.',
        'INVALID_BOOKING_STATUS'
      )
    }

    const check = checkNoShow(booking, now)
    if (check === 'wrong_status') {
      throw new AppError(
        400,
        'Only an accepted booking (confirmed or in progress) can be marked as a no-show',
        'INVALID_BOOKING_STATUS'
      )
    }
    if (check === 'too_early') {
      throw new AppError(
        400,
        "A no-show can only be marked once the booking's start time has passed",
        'NO_SHOW_TOO_EARLY'
      )
    }

    const author = await resolveNoteAuthor(sub)
    const cancelled = await adminRepository.cancelBookingAsAdmin(
      id,
      booking.status,
      {
        // Ops is recording what happened, not passing on anyone's request.
        onBehalfOf: 'detlio',
        reason: null,
        noShow: input.party,
        at: new Date(now),
      },
      { author, body: noShowNote(input.party, input.note) }
    )
    if (!cancelled) throw stateChanged()

    log.info(
      { bookingId: id, from: booking.status, party: input.party, author },
      'admin:booking-no-show'
    )
    // Whatever is left of its time is free again (0047).
    slotAlertsService.capacityFreed(booking, 'no_show')
    // A free redo that did not happen (0051): its claim moves on.
    if (booking.guaranteeRedo) guaranteeService.redoChanged(booking.id)
    // Detlio Rewards (0050): a customer no-show takes one level off (recorded).
    if (input.party === 'customer') rewardsService.scheduleAfterNoShow(id)

    if (input.party === 'garage') {
      const updated = await adminRepository.findBookingById(id)
      alertOps({ kind: 'garage_no_show', booking: updated! })
      refundsService.queueAutoRefund({ kind: 'booking', id })
    }

    return loadBookingDetail(id, now)
  },

  /**
   * Marks a booking "Test", or takes the mark off: the whole reschedule
   * chain, since a chain is one customer booking. A marked booking is left
   * out of the pilot numbers and, while the test-data reset is switched on,
   * can be deleted from its page. The mark changes nothing else: slots,
   * refunds and receipts read it nowhere. Leaves a note either way; marking
   * what is already marked changes nothing and answers with the booking.
   */
  async setTestMark(id: string, sub: string, marked: boolean, now = Date.now()) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    const author = await resolveNoteAuthor(sub)
    const changed = await adminRepository.setChainTestMark(
      booking.originalBookingId ?? booking.id,
      marked ? { at: new Date(now), by: author } : null,
      {
        bookingId: id,
        author,
        body: marked
          ? 'Marked as a test booking. It is left out of the pilot numbers.'
          : 'Test mark removed. It counts in the pilot numbers again.',
      }
    )

    if (changed) {
      log.info({ bookingId: id, marked, rows: changed.length, author }, 'admin:booking-test-mark')
    }
    return loadBookingDetail(id, now)
  },

  /**
   * Confirms a pickup & drop handover for a customer who cannot give the
   * code: Picked up or Delivered (which completes the job), in the job's
   * own order (lib/pickup.ts). The admin's name is stored on the booking
   * and the reason goes in the notes, like every booking action here.
   */
  async overridePickupStep(id: string, sub: string, input: PickupStepOverrideInput) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    const author = await resolveNoteAuthor(sub)
    await bookingsService.confirmHandoverAsDetlio(id, input.step, author)
    await adminRepository.createBookingNote({
      bookingId: id,
      author,
      body: `${input.step === 'picked_up' ? 'Picked up' : 'Delivered'} confirmed by Detlio without the customer's code: ${input.note}`,
    })

    log.info({ bookingId: id, step: input.step, author }, 'admin:booking-pickup-step-confirmed')
    return loadBookingDetail(id, Date.now())
  },

  /**
   * Detlio waives the photo standard on one booking (0045): Start and
   * Complete stop waiting for the garage's photos, and the job leaves the
   * garage's photo compliance. For genuine cases (the garage's phone died,
   * the customer would not wait); the typed name and the reason are stored
   * on the booking and left as a note. Once only; not on a cancelled booking.
   */
  async waiveJobPhotos(id: string, input: WaiveJobPhotosInput) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()
    if (booking.photosWaivedAt) {
      throw new AppError(409, 'Photos are already waived on this booking.', 'PHOTOS_ALREADY_WAIVED')
    }

    const [waived] = await adminRepository.waiveJobPhotos(id, {
      by: input.actorName,
      reason: input.reason,
      at: new Date(),
    })
    if (!waived) {
      throw new AppError(
        409,
        "This booking changed (cancelled, or waived by someone else). Reload to see it as it is now.",
        'BOOKING_STATE_CHANGED'
      )
    }
    await adminRepository.createBookingNote({
      bookingId: id,
      author: input.actorName,
      body: `Job photos waived by ${input.actorName}: ${input.reason}`,
    })

    log.info({ bookingId: id, actorName: input.actorName }, 'admin:job-photos-waived')
    return loadBookingDetail(id, Date.now())
  },

  async addBookingNote(id: string, sub: string, input: CreateBookingNoteInput) {
    const booking = await adminRepository.findBookingById(id)
    if (!booking) throw bookingNotFound()

    const author = await resolveNoteAuthor(sub)
    // Typed by a person (0065): its author may edit or delete it for 24 h.
    const [note] = await adminRepository.createBookingNote({
      bookingId: id,
      author,
      body: input.body,
      kind: 'typed',
      authorSub: sub,
    })

    log.info({ bookingId: id, noteId: note.id, author }, 'admin:booking-note-added')
    return toBookingNoteResponse(note)
  },

  /**
   * Its author edits a typed note within 24 hours (0065). The write is
   * conditional on the same rule, so a press at the 24th hour changes nothing.
   */
  async editBookingNote(id: string, noteId: string, sub: string, input: CreateBookingNoteInput, now = new Date()) {
    const note = await adminRepository.findBookingNote(id, noteId)
    if (!note) throw noteNotFound()
    const refusal = noteEditRefusal(note, sub, now)
    if (refusal) throw noteRefused(refusal)
    const actorName = await resolveNoteAuthor(sub)
    const updated = await adminRepository.editTypedNote({
      bookingId: id,
      noteId,
      sub,
      body: input.body,
      at: now,
      since: new Date(now.getTime() - NOTE_EDIT_HOURS * 60 * 60 * 1000),
      actorName,
    })
    if (!updated) throw noteRefused('window_closed')
    log.info({ bookingId: id, noteId }, 'admin:booking-note-edited')
    return toBookingNoteResponse(updated)
  },

  /** Its author deletes a typed note within 24 hours (0065). Audited by id. */
  async deleteBookingNote(id: string, noteId: string, sub: string, now = new Date()) {
    const note = await adminRepository.findBookingNote(id, noteId)
    if (!note) throw noteNotFound()
    const refusal = noteEditRefusal(note, sub, now)
    if (refusal) throw noteRefused(refusal)
    const actorName = await resolveNoteAuthor(sub)
    const deleted = await adminRepository.deleteTypedNote({
      bookingId: id,
      noteId,
      sub,
      since: new Date(now.getTime() - NOTE_EDIT_HOURS * 60 * 60 * 1000),
      actorName,
    })
    if (!deleted) throw noteRefused('window_closed')
    log.info({ bookingId: id, noteId }, 'admin:booking-note-deleted')
    return { id: noteId, deleted: true }
  },

  // ─── Media ─────────────────────────────────────────────────────────────────
  //
  // The same logo / gallery / service-image capabilities the vendor panel has,
  // reachable by an admin on any vendor's behalf. The vendor module owns the
  // storage-backed queries, so these reuse vendorsRepository rather than
  // restating them; what differs is only how the caller is authorized — an
  // admin names the vendor, an owner is resolved from their token.

  async createVendorLogoUploadUrl(vendorId: string, input: UploadUrlInput) {
    const vendor = await assertWritableVendor(vendorId)
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType,
      'logo'
    )
    return { uploadUrl, publicUrl }
  },

  async setVendorLogo(vendorId: string, input: MediaUrlInput) {
    const vendor = await assertWritableVendor(vendorId)

    const storageKey = assertOwnBucketUrl(input.url, 'INVALID_LOGO_URL')
    const previousKey = vendor.logoStorageKey

    const [updated] = await adminRepository.updateVendor(vendor.id, {
      logoUrl: input.url,
      logoStorageKey: storageKey,
    })

    if (previousKey && previousKey !== storageKey) {
      await deleteObject(previousKey)
    }

    log.info({ vendorId: vendor.id }, 'admin:vendor-logo-updated')
    return updated
  },

  async deleteVendorLogo(vendorId: string) {
    const vendor = await assertWritableVendor(vendorId)

    const [updated] = await adminRepository.updateVendor(vendor.id, {
      logoUrl: null,
      logoStorageKey: null,
    })

    const key = vendor.logoStorageKey ?? keyFromPublicUrl(vendor.logoUrl ?? '')
    if (key) {
      await deleteObject(key)
    }

    log.info({ vendorId: vendor.id }, 'admin:vendor-logo-removed')
    return updated
  },

  async createVendorPhotoUploadUrl(vendorId: string, input: UploadUrlInput) {
    const vendor = await assertWritableVendor(vendorId)
    await assertPhotoCapacity(vendor.id)

    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendor.id,
      input.contentType
    )
    return { uploadUrl, publicUrl }
  },

  async addVendorPhoto(vendorId: string, input: MediaUrlInput) {
    const vendor = await assertWritableVendor(vendorId)
    const storageKey = assertOwnBucketUrl(input.url, 'INVALID_PHOTO_URL')

    // Re-checked after the presign: that URL stays usable for its whole TTL,
    // so this is the check that actually holds the cap.
    await assertPhotoCapacity(vendor.id)

    const [{ maxOrder }] = await vendorsRepository.getNextPhotoSortOrder(
      vendor.id
    )
    const [created] = await vendorsRepository.createPhoto(vendor.id, {
      url: input.url,
      storageKey,
      sortOrder: maxOrder + 1,
    })

    log.info(
      { vendorId: vendor.id, photoId: created.id },
      'admin:vendor-photo-added'
    )
    return created
  },

  async deleteVendorPhoto(vendorId: string, photoId: string) {
    const vendor = await assertWritableVendor(vendorId)
    const photo = await vendorsRepository.findPhotoById(vendor.id, photoId)

    if (!photo) {
      throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
    }

    const [deleted] = await vendorsRepository.deletePhoto(vendor.id, photoId)

    const key = deleted.storageKey ?? keyFromPublicUrl(deleted.url)
    if (key) {
      await deleteObject(key)
    }

    return deleted
  },

  // Service photos and video. The rules (the privacy tick, the limits, AI
  // samples giving way to a real photo, removing the files) are
  // serviceMediaService's, shared with the garage's app. Each mutation
  // answers with the service's media, as the upload block shows it.

  async createServiceImageUploadUrl(sub: string, serviceId: string, input: UploadUrlInput) {
    return serviceMediaService.createPhotoUploadUrl({ kind: 'admin', sub }, serviceId, input)
  },

  async addServiceImage(sub: string, serviceId: string, input: AddPhotoInput) {
    const service = await serviceMediaService.addPhoto({ kind: 'admin', sub }, serviceId, input)
    return serviceMediaService.listManaged(service.id)
  },

  /** Removes a photo or the video. */
  async deleteServiceImage(sub: string, serviceId: string, imageId: string) {
    const service = await serviceMediaService.deleteMedia({ kind: 'admin', sub }, serviceId, imageId)
    return serviceMediaService.listManaged(service.id)
  },

  // ─── Vendor team ───────────────────────────────────────────────────────────
  //
  // membersService's own rules, behind the Bin check: a garage in the Bin
  // takes no team changes (its seats are kept as they are for Restore).

  async addVendorMember(vendorId: string, actorId: string | null, input: AddMemberInput) {
    await assertWritableVendor(vendorId)
    return membersService.addMember(vendorId, actorId, input)
  },

  async updateVendorMember(
    vendorId: string,
    actorId: string | null,
    membershipId: string,
    input: UpdateMemberInput
  ) {
    await assertWritableVendor(vendorId)
    return membersService.updateMember(vendorId, actorId, membershipId, input)
  },

  async removeVendorMember(vendorId: string, actorId: string | null, membershipId: string) {
    await assertWritableVendor(vendorId)
    return membersService.removeMember(vendorId, actorId, membershipId)
  },

  // ─── Platform admins ───────────────────────────────────────────────────────

  async listSuperAdmins() {
    const rows = await membersRepository.listPlatformRows()

    return rows
      .filter((row) => row.role === 'super_admin')
      .map((row) => ({
        id: row.id,
        userId: row.user.id,
        name: row.user.name,
        phone: row.user.phone,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      }))
  },

  /**
   * Grant platform admin to a real, named person.
   *
   * This is the trade the design makes on purpose: folding platform roles into
   * the mapping table means an OTP session *can* be super-admin, which an
   * env-only admin password could not. What it buys is named admins with an
   * `added_by` and an immediate revocation path, instead of a shared secret.
   *
   * Two refusals keep the blast radius bounded, and both are checks here rather
   * than conventions:
   *
   *  - never to a company owner. The two grants compose into "owns a garage, and
   *    can silently act on its competitors" — and worse, tenant resolution
   *    prefers their own seat, so the request that matters is not even logged as
   *    support access.
   *  - never to an account that can authenticate without a one-time code. Today
   *    OTP is the only login path for a `users` row, so this holds by
   *    construction; if a password or social login is ever added, this is the
   *    check that has to grow with it.
   */
  async grantSuperAdmin(input: GrantSuperAdminInput, grantedBy: string | null) {
    const user = await membersRepository.findUserByPhone(input.phone)

    if (!user) {
      throw new AppError(
        404,
        'No account found for this phone number',
        'USER_NOT_FOUND'
      )
    }

    if (await membersRepository.ownsAnyVendor(user.id)) {
      throw new AppError(
        409,
        'A company owner cannot be granted platform admin',
        'OWNER_CANNOT_BE_SUPER_ADMIN'
      )
    }

    const existing = await membersRepository.findActivePlatformRow(user.id)

    if (existing?.role === 'super_admin') {
      return { id: existing.id, userId: user.id }
    }

    const [created] = await membersRepository.createMembership({
      vendorId: null,
      userId: user.id,
      role: 'super_admin',
      // The break-glass subject has no users row, so there is nobody to
      // attribute the grant to. Null is the honest answer.
      addedBy: grantedBy,
    })

    log.info({ userId: user.id, grantedBy }, 'admin:super_admin_granted')
    return { id: created.id, userId: user.id }
  },

  /**
   * Revocation is a delete, and it takes effect on the next request — every
   * check reads the table, never a token.
   */
  async revokeSuperAdmin(membershipId: string) {
    const row = await membersRepository.findMembershipById(membershipId)

    if (!row || row.vendorId !== null || row.role !== 'super_admin') {
      throw new AppError(404, 'Grant not found', 'GRANT_NOT_FOUND')
    }

    await membersRepository.deleteMembership(membershipId)
    log.info({ userId: row.userId }, 'admin:super_admin_revoked')
  },
}
