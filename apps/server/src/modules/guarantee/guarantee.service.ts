/**
 * Detlio Guarantee (0051): a free redo within 48 hours, decided on photos,
 * with limits against misuse. Every rule is lib/guarantee.ts (pure); this
 * file reads, writes through the repository, and tells people.
 *
 * Who: the customer acts only on their own bookings and claims (the
 * session's id; anyone else's is a 404). The garage acts only on its own
 * claims (the garage from resolveTenant; another garage's is a 404). Detlio
 * decides from admin (super-admin, typed name). Tenant isolation is in every
 * repository write's WHERE as well as here.
 */
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { bookingReference } from '../../lib/booking-ops.js'
import { runInBackground } from '../../lib/background.js'
import {
  ADMIN_TAB_STATUSES,
  GUARANTEE_ISSUES,
  GUARANTEE_RULES,
  ISSUE_LABELS,
  ROUTE_REASON_LABELS,
  approvedForRedo,
  claimDeadline,
  claimInputProblem,
  claimOverdue,
  claimPhotoFolder,
  claimRefusal,
  claimRefusalMessage,
  claimsLeft,
  customerStatusLine,
  decidableFrom,
  decisionRefusal,
  detlioDecideBy,
  garageAnswerRefusal,
  garageReviewBy,
  garageTimedOut,
  isClaimPhotoKey,
  isClosedStatus,
  limitReached,
  nextClaimMove,
  redoBookBy,
  redoDates,
  redoTimeRefusal,
  routeClaim,
  type AdminClaimTab,
  type ClaimDecision,
  type ClaimStatus,
  type CloseReason,
  type GuaranteeIssue,
} from '../../lib/guarantee.js'
import { toJobPhotoView } from '../../lib/job-records.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { firstNameOf } from '../../lib/payouts.js'
import { newHandoverCodes } from '../../lib/pickup.js'
import * as pushMessages from '../../lib/push-messages.js'
import type { PushMessage } from '../../lib/push.js'
import { getDateKeyFromScheduledAt, isScheduledAtAvailable } from '../../lib/slots.js'
import { createPresignedUpload, publicUrlForKey } from '../../lib/storage.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { pushService } from '../push/push.service.js'
import { refundsService } from '../refunds/refunds.service.js'
import { rewardsService } from '../rewards/rewards.service.js'
import { jobSlots } from '../vendors/vendors.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import {
  guaranteeRepository,
  type ClaimRecord,
  type ClaimWithPhotos,
} from './guarantee.repository.js'
import type {
  AdminClaimsQuery,
  BookRedoInput,
  ClaimPhotoUploadInput,
  CreateClaimInput,
  DecideClaimInput,
} from './guarantee.validation.js'

const log = logger.child({ module: 'guarantee' })

const HOUR_MS = 60 * 60 * 1000
/** The cron's time budget, like the other sweeps'. */
const SWEEP_BUDGET_MS = 10_000

// ─── Errors ──────────────────────────────────────────────────────────────────

function bookingNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

function claimNotFound() {
  return new AppError(404, 'Claim not found', 'GUARANTEE_CLAIM_NOT_FOUND')
}

function claimChanged() {
  return new AppError(409, 'This claim has just changed. Refresh to see where it stands.', 'GUARANTEE_CLAIM_CHANGED')
}

function garageUnavailable() {
  return new AppError(
    409,
    "The garage isn't taking bookings right now, so a redo can't be booked. Use Help with this booking to reach Detlio.",
    'GUARANTEE_GARAGE_UNAVAILABLE'
  )
}

// ─── Views ───────────────────────────────────────────────────────────────────

function photoView(photo: { id: string; url: string; createdAt: Date }) {
  return { id: photo.id, url: photo.url, createdAt: photo.createdAt.toISOString() }
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

/**
 * The claim as its customer sees it: where it stands in plain words, their
 * own photos and choices, the redo. Never the garage's note, Detlio's
 * internal note, the route's reasons or how many claims they have left.
 */
function toCustomerClaim(
  claim: ClaimWithPhotos,
  context: { garageName: string; redo: { scheduledAt: Date; status: string } | null; now: Date }
) {
  const line = customerStatusLine({
    status: claim.status,
    garageName: context.garageName,
    garageRespondBy: claim.garageRespondBy,
    redoBookBy: claim.redoBookBy,
    redoScheduledAt: context.redo?.scheduledAt ?? null,
    closeReason: claim.closeReason as CloseReason | null,
    decisionReason: claim.decisionReason,
  })
  return {
    id: claim.id,
    bookingId: claim.bookingId,
    status: claim.status,
    title: line.title,
    body: line.body,
    issues: claim.issues,
    otherText: claim.otherText,
    photos: claim.photos.map(photoView),
    createdAt: claim.createdAt.toISOString(),
    garageRespondBy: claim.status === 'waiting_garage' ? iso(claim.garageRespondBy) : null,
    redoBookBy: claim.status === 'redo_approved' ? iso(claim.redoBookBy) : null,
    redoBooking: claim.redoBookingId && context.redo
      ? { id: claim.redoBookingId, scheduledAt: context.redo.scheduledAt.toISOString(), status: context.redo.status }
      : null,
    canBookRedo:
      claim.status === 'redo_approved' && claim.redoBookBy !== null && context.now <= claim.redoBookBy,
    // Only a claim that was not approved says why; the customer reads it.
    reason: claim.status === 'rejected' ? claim.decisionReason : null,
  }
}

export type CustomerClaimView = ReturnType<typeof toCustomerClaim>

type ClaimBooking = Awaited<ReturnType<typeof guaranteeRepository.bookingsForClaims>>[number]

/** The garage's before/after photos of the job: what the claim is compared with. */
function garagePhotosOf(booking: ClaimBooking | undefined) {
  return (booking?.photos ?? [])
    .filter((photo) => photo.uploadedByRole !== 'customer')
    .map(toJobPhotoView)
}

function serviceLabel(booking: ClaimBooking | undefined): string {
  const names = (booking?.items ?? []).map((item) => item.name)
  if (names.length === 0) return 'Service'
  return names.length === 1 ? names[0]! : `${names[0]} + ${names.length - 1} more`
}

/**
 * The claim as the garage sees it: the customer's photos beside its own
 * before/after, what is wrong in the customer's words, the clock, and the
 * outcome. The customer by first name only, never their phone.
 */
function toGarageClaim(
  claim: ClaimWithPhotos,
  booking: ClaimBooking | undefined,
  redo: { scheduledAt: Date; status: string } | null,
  now: Date
) {
  return {
    id: claim.id,
    bookingId: claim.bookingId,
    bookingRef: bookingReference(claim.bookingId),
    status: claim.status,
    route: claim.route,
    issues: claim.issues.map((issue) => ({ key: issue, label: ISSUE_LABELS[issue] })),
    otherText: claim.otherText,
    customerFirstName: firstNameOf(booking?.user?.name),
    service: serviceLabel(booking),
    scheduledAt: iso(booking?.scheduledAt),
    completedAt: iso(booking?.completedAt ?? booking?.deliveredAt),
    customerPhotos: claim.photos.map(photoView),
    garagePhotos: garagePhotosOf(booking),
    createdAt: claim.createdAt.toISOString(),
    garageRespondBy: iso(claim.garageRespondBy),
    canAnswer: garageAnswerRefusal(claim, 'accept', now) === null,
    canDispute: garageAnswerRefusal(claim, 'dispute', now) === null,
    garageResponse: claim.garageResponse,
    garageNote: claim.garageNote,
    decision: claim.decision,
    // Detlio's reason is shown to the garage too when a claim is not approved.
    decisionReason: claim.decision === 'reject' ? claim.decisionReason : null,
    redoBookBy: iso(claim.redoBookBy),
    redoBooking: claim.redoBookingId && redo
      ? { id: claim.redoBookingId, scheduledAt: redo.scheduledAt.toISOString(), status: redo.status }
      : null,
    closeReason: claim.closeReason,
  }
}

export type GarageClaimView = ReturnType<typeof toGarageClaim>

// ─── Telling people ──────────────────────────────────────────────────────────

/** The push the customer gets for a decision on their claim, by the original booking. */
function tellCustomer(claim: ClaimRecord, outcome: 'redo' | 'refund' | 'reject') {
  pushService.notifyCustomer(claim.userId, async () => {
    const booking = await bookingsRepository.findBookingById(claim.bookingId)
    return booking ? pushMessages.customerClaimDecided(booking, outcome) : null
  })
}

type FullBooking = NonNullable<Awaited<ReturnType<typeof bookingsRepository.findBookingById>>>

function tellGarage(claim: ClaimRecord, build: (booking: FullBooking) => PushMessage) {
  pushService.notifyGarage(claim.vendorId, async () => {
    const booking = await bookingsRepository.findBookingById(claim.bookingId)
    return booking ? build(booking) : null
  })
}

// ─── The service ─────────────────────────────────────────────────────────────

export const guaranteeService = {
  /**
   * Whether the guarantee is on, with every number the apps show (the
   * checkout badge, the claim screen, the Help centre's answer). Public: it
   * says nothing about anyone.
   */
  config() {
    return {
      enabled: env.guaranteeEnabled,
      claimWindowHours: GUARANTEE_RULES.claimWindowHours,
      minPhotos: GUARANTEE_RULES.minPhotos,
      maxPhotos: GUARANTEE_RULES.maxPhotos,
      garageReviewHours: GUARANTEE_RULES.garageReviewHours,
      detlioDecideHours: GUARANTEE_RULES.detlioDecideHours,
      redoWithinDays: GUARANTEE_RULES.redoWithinDays,
      issues: GUARANTEE_ISSUES.map((key) => ({ key, label: ISSUE_LABELS[key] })),
    }
  },

  // ─── The customer ───────────────────────────────────────────────────────

  /**
   * The guarantee on one of the customer's bookings: whether they can claim
   * now (and until when), or their claim and where it stands. Anyone else's
   * booking is a 404. A garage deadline that ran out is settled here first,
   * so the page never says "waiting" past it.
   */
  async forBooking(userId: string, bookingId: string, now = new Date()) {
    const booking = await guaranteeRepository.findClaimableBooking(bookingId)
    if (!booking || booking.userId !== userId) throw bookingNotFound()

    let claim = await guaranteeRepository.findClaimByBooking(booking.id)
    if (claim && garageTimedOut(claim, now)) {
      await guaranteeService.reconcile(claim, now)
      claim = await guaranteeRepository.findClaimByBooking(booking.id)
    }
    if (claim) {
      const redo = claim.redoBookingId ? (await guaranteeRepository.redoTimes([claim.redoBookingId])).get(claim.redoBookingId) ?? null : null
      return {
        canClaim: false,
        claimBy: null,
        claim: toCustomerClaim(claim, { garageName: booking.vendorName, redo, now }),
      }
    }

    // Cheap answers first: only a completed, paid, redoable job in its window
    // reads the customer's history.
    const quick = claimRefusal(booking, { hasClaim: false, limitReached: false, now })
    const refusal =
      quick ??
      claimRefusal(booking, {
        hasClaim: false,
        limitReached: limitReached(await guaranteeRepository.history(userId, booking.completedAt, now)),
        now,
      })
    return {
      canClaim: refusal === null,
      claimBy: refusal === null && booking.completedAt ? claimDeadline(booking.completedAt).toISOString() : null,
      claim: null,
    }
  },

  /** Why a booking cannot take a claim now, as a 409 the app shows. */
  async assertClaimable(userId: string, bookingId: string, now: Date) {
    const booking = await guaranteeRepository.findClaimableBooking(bookingId)
    if (!booking || booking.userId !== userId) throw bookingNotFound()
    const existing = await guaranteeRepository.findClaimByBooking(booking.id)
    const history = await guaranteeRepository.history(userId, booking.completedAt, now)
    const refusal = claimRefusal(booking, { hasClaim: Boolean(existing), limitReached: limitReached(history), now })
    if (refusal) {
      log.info({ bookingId, userId, refusal }, 'guarantee:not_eligible')
      throw new AppError(409, claimRefusalMessage(refusal), 'GUARANTEE_NOT_ELIGIBLE')
    }
    return booking
  },

  /**
   * A presigned upload for one photo of the problem, into the job's
   * guarantee folder. Only while the booking can take a claim, so the
   * folder only ever holds photos uploaded inside the window: the upload
   * time is what counts. The browser re-encodes the photo first
   * (stripImageMetadata), as every image upload does.
   */
  async createUploadUrl(userId: string, bookingId: string, input: ClaimPhotoUploadInput, now = new Date()) {
    const booking = await guaranteeService.assertClaimable(userId, bookingId, now)
    const { uploadUrl, key, publicUrl } = await createPresignedUpload(
      booking.vendorId,
      input.contentType,
      claimPhotoFolder(booking.id)
    )
    return { uploadUrl, key, publicUrl }
  },

  /**
   * Makes the claim: checks the booking, the photos and the choices, decides
   * where it goes from the garage's photos and the customer's history, and
   * writes it once (under the customer's lock, the limit checked again).
   */
  async submit(userId: string, input: CreateClaimInput, now = new Date()) {
    const booking = await guaranteeService.assertClaimable(userId, input.bookingId, now)

    const issues = input.issues as GuaranteeIssue[]
    const otherText = issues.includes('other') ? (input.otherText?.trim() || null) : null
    const problem = claimInputProblem({ issues, otherText, photoKeys: input.photoKeys })
    if (problem) {
      const message = {
        too_few_photos: `Add at least ${GUARANTEE_RULES.minPhotos} photos of the problem.`,
        too_many_photos: `Add at most ${GUARANTEE_RULES.maxPhotos} photos.`,
        no_issue: "Pick what's wrong.",
        other_needs_text: "Say what's wrong in a few words.",
        duplicate_photos: 'The same photo was added twice.',
      }[problem]
      throw new AppError(400, message, 'GUARANTEE_CLAIM_INVALID')
    }
    for (const key of input.photoKeys) {
      if (!isClaimPhotoKey(key, booking.vendorId, booking.id)) {
        throw new AppError(400, 'One of those photos is not from this claim. Take it again in the app.', 'INVALID_CLAIM_PHOTO')
      }
    }

    // The garage's calendar for its 12 hours, read before the write (plain reads).
    const calendar = await guaranteeRepository.readCalendar(
      booking.vendorId,
      now,
      new Date(now.getTime() + (GUARANTEE_RULES.garageReviewCapHours + 1) * HOUR_MS)
    )

    const result = await guaranteeRepository.insertClaim({
      booking,
      issues,
      otherText,
      photos: input.photoKeys.map((key) => ({ key, url: publicUrlForKey(key) })),
      now,
      route: (history) => {
        const routed = routeClaim({
          garagePhotos: booking.garagePhotos,
          photosWaived: booking.photosWaivedAt !== null,
          history,
        })
        return {
          ...routed,
          garageRespondBy: routed.route === 'garage' ? garageReviewBy(now, calendar) : null,
          detlioDecideBy: routed.route === 'detlio' ? detlioDecideBy(now) : null,
          approvedAt: routed.route === 'auto' ? now : null,
          redoBookBy: routed.route === 'auto' ? redoBookBy(now) : null,
        }
      },
    })
    if (result.kind === 'already_claimed') {
      throw new AppError(409, claimRefusalMessage('already_claimed'), 'GUARANTEE_NOT_ELIGIBLE')
    }
    if (result.kind === 'limit_reached') {
      throw new AppError(409, claimRefusalMessage('limit_reached'), 'GUARANTEE_NOT_ELIGIBLE')
    }

    const claim = result.claim
    log.info(
      { claimId: claim.id, bookingId: claim.bookingId, vendorId: claim.vendorId, route: claim.route, reasons: claim.routeReasons, photos: claim.photos.length },
      'guarantee:claim_made'
    )

    alertOps({
      kind: 'guarantee_claim',
      claimId: claim.id,
      bookingId: claim.bookingId,
      garageName: booking.vendorName,
      route: claim.route,
      reasons: claim.routeReasons.map((reason) => ROUTE_REASON_LABELS[reason]),
      issues: claim.issues.map((issue) => ISSUE_LABELS[issue]),
      respondBy: claim.garageRespondBy,
      decideBy: claim.detlioDecideBy,
    })
    if (claim.route === 'garage' && claim.garageRespondBy) {
      const respondBy = claim.garageRespondBy
      tellGarage(claim, (b) => pushMessages.garageClaimToAnswer(b, claim.id, respondBy))
    } else if (claim.route === 'auto') {
      tellGarage(claim, (b) => pushMessages.garageClaimApproved(b, claim.id, 'no_photos'))
    }

    return toCustomerClaim(claim, { garageName: booking.vendorName, redo: null, now })
  },

  /** The customer's own claim, or a 404. */
  async ownClaim(userId: string, claimId: string) {
    const claim = await guaranteeRepository.findClaimById(claimId)
    if (!claim || claim.userId !== userId) throw claimNotFound()
    return claim
  },

  /**
   * The free times for the redo on one IST day: the slot list's own rule for
   * the original job (its length and booking type, the notice, bays and the
   * day's cap), only up to the end of the redo window.
   */
  async redoSlots(userId: string, claimId: string, date: string, now = new Date()) {
    const claim = await guaranteeService.ownClaim(userId, claimId)
    if (claim.status !== 'redo_approved' || !claim.redoBookBy || now > claim.redoBookBy) throw claimChanged()
    if (!redoDates(now, claim.redoBookBy).includes(date)) {
      throw new AppError(400, `Pick a day within the next ${GUARANTEE_RULES.redoWithinDays} days.`, 'GUARANTEE_REDO_DAY')
    }
    const { vendor, original } = await guaranteeService.redoContext(claim)
    const day = await jobSlots(vendor, {
      date,
      bookingType: original.bookingType as 'doorstep' | 'dropin' | 'pickup',
      durationMins: original.durationMins,
      serviceIds: original.items.map((item) => item.serviceId),
    })
    const bookBy = claim.redoBookBy
    return {
      ...day,
      slots: day.slots.filter((slot) => new Date(slot).getTime() <= bookBy.getTime()),
      bookBy: bookBy.toISOString(),
      days: redoDates(now, bookBy),
    }
  },

  /** The garage (open to customers) and the original job a redo repeats. */
  async redoContext(claim: ClaimRecord) {
    const vendor = await vendorsRepository.findPublicVendorById(claim.vendorId)
    if (!vendor) throw garageUnavailable()
    const original = await guaranteeRepository.findClaimableBooking(claim.bookingId)
    if (!original) throw claimNotFound()
    return { vendor, original }
  },

  /**
   * Books the free redo at the time picked: the slot rule offers it, inside
   * the window, then the write (claim row, vehicle, garage-day locks;
   * capacity checked again under them).
   */
  async bookRedo(userId: string, claimId: string, input: BookRedoInput, now = new Date()) {
    const claim = await guaranteeService.ownClaim(userId, claimId)
    const scheduledAt = new Date(input.scheduledAt)
    const { vendor, original } = await guaranteeService.redoContext(claim)
    const date = getDateKeyFromScheduledAt(scheduledAt)
    const day = await jobSlots(vendor, {
      date,
      bookingType: original.bookingType as 'doorstep' | 'dropin' | 'pickup',
      durationMins: original.durationMins,
      serviceIds: original.items.map((item) => item.serviceId),
    })
    const refusal = redoTimeRefusal({
      status: claim.status,
      redoBookBy: claim.redoBookBy,
      scheduledAt,
      offered: isScheduledAtAvailable(scheduledAt, day.slots),
      now,
    })
    if (refusal === 'not_approved' || refusal === 'too_late') throw claimChanged()
    if (refusal === 'past_window') {
      throw new AppError(400, `Pick a time within the next ${GUARANTEE_RULES.redoWithinDays} days.`, 'GUARANTEE_REDO_DAY')
    }
    if (refusal === 'not_offered') {
      throw new AppError(409, 'That time is no longer free. Pick another one.', 'SLOT_FULL')
    }

    const result = await guaranteeRepository.bookRedo({
      claimId: claim.id,
      userId,
      scheduledAt,
      handoverCodes: newHandoverCodes(),
      now,
    })
    switch (result.kind) {
      case 'claim_changed':
        throw claimChanged()
      case 'vehicle_clash':
        throw new AppError(409, 'Your car already has a booking at that time. Pick another one.', 'VEHICLE_BUSY')
      case 'garage':
        if (result.refusal === 'slot_full') throw new AppError(409, 'That time is no longer free. Pick another one.', 'SLOT_FULL')
        if (result.refusal === 'closed') throw new AppError(400, 'The garage is closed that day. Pick another one.', 'GARAGE_CLOSED_THAT_DAY')
        throw garageUnavailable()
      case 'booked':
        break
    }

    log.info({ claimId: claim.id, redoBookingId: result.bookingId, vendorId: claim.vendorId }, 'guarantee:redo_booked')
    pushService.notifyGarage(claim.vendorId, async () => {
      const redo = await bookingsRepository.findBookingById(result.bookingId)
      return redo ? pushMessages.garageRedoBooked(redo, new Date()) : null
    })

    const updated = await guaranteeRepository.findClaimById(claim.id)
    return {
      bookingId: result.bookingId,
      claim: toCustomerClaim(updated!, {
        garageName: vendor.businessName,
        redo: { scheduledAt, status: 'confirmed' },
        now,
      }),
    }
  },

  // ─── The garage ─────────────────────────────────────────────────────────

  /** The garage's claims (the tenant's only), open or closed, with both sides' photos. */
  async listForGarage(vendorId: string, scope: 'open' | 'closed', now = new Date()) {
    const claims = await guaranteeRepository.listGarageClaims(vendorId, scope)
    const bookingsById = new Map(
      (await guaranteeRepository.bookingsForClaims(claims.map((claim) => claim.bookingId))).map((b) => [b.id, b])
    )
    const redos = await guaranteeRepository.redoTimes(
      claims.flatMap((claim) => (claim.redoBookingId ? [claim.redoBookingId] : []))
    )
    return {
      items: claims.map((claim) =>
        toGarageClaim(claim, bookingsById.get(claim.bookingId), claim.redoBookingId ? redos.get(claim.redoBookingId) ?? null : null, now)
      ),
      reviewHours: GUARANTEE_RULES.garageReviewHours,
    }
  },

  async ownGarageClaim(vendorId: string, claimId: string) {
    const claim = await guaranteeRepository.findClaimById(claimId)
    if (!claim || claim.vendorId !== vendorId) throw claimNotFound()
    return claim
  },

  /** Accept: the customer picks a free redo time within 7 days. Late is the same as no answer. */
  async accept(vendorId: string, actorId: string, claimId: string, now = new Date()) {
    const claim = await guaranteeService.ownGarageClaim(vendorId, claimId)
    if (garageAnswerRefusal(claim, 'accept', now)) throw claimChanged()
    const answered = await guaranteeRepository.answerAsGarage({
      claimId,
      vendorId,
      actorId,
      response: 'accepted',
      note: null,
      set: approvedForRedo(now),
      now,
    })
    if (!answered) throw claimChanged()
    log.info({ claimId, vendorId, actorId }, 'guarantee:garage_accepted')
    tellCustomer(answered, 'redo')
    return guaranteeService.garageClaim(vendorId, claimId, now)
  },

  /** Dispute, saying why: Detlio decides within 24 hours. Only inside the garage's time. */
  async dispute(vendorId: string, actorId: string, claimId: string, note: string, now = new Date()) {
    const claim = await guaranteeService.ownGarageClaim(vendorId, claimId)
    const refusal = garageAnswerRefusal(claim, 'dispute', now)
    if (refusal === 'time_passed') {
      throw new AppError(
        409,
        'The time to answer has passed, so the free redo is approved.',
        'GUARANTEE_RESPONSE_TIME_PASSED'
      )
    }
    if (refusal) throw claimChanged()
    const decideBy = detlioDecideBy(now)
    const answered = await guaranteeRepository.answerAsGarage({
      claimId,
      vendorId,
      actorId,
      response: 'disputed',
      note,
      set: { status: 'needs_detlio', detlioDecideBy: decideBy },
      now,
      respondByAfter: now,
    })
    if (!answered) throw claimChanged()
    log.info({ claimId, vendorId, actorId }, 'guarantee:garage_disputed')
    const booking = await guaranteeRepository.findClaimableBooking(answered.bookingId)
    alertOps({
      kind: 'guarantee_needs_detlio',
      claimId,
      bookingId: answered.bookingId,
      garageName: booking?.vendorName ?? 'The garage',
      why: 'disputed',
      note,
      decideBy,
    })
    return guaranteeService.garageClaim(vendorId, claimId, now)
  },

  /** One of the garage's claims, as its list shows it. */
  async garageClaim(vendorId: string, claimId: string, now = new Date()) {
    const claim = await guaranteeService.ownGarageClaim(vendorId, claimId)
    const [booking] = await guaranteeRepository.bookingsForClaims([claim.bookingId])
    const redos = await guaranteeRepository.redoTimes(claim.redoBookingId ? [claim.redoBookingId] : [])
    return toGarageClaim(claim, booking, claim.redoBookingId ? redos.get(claim.redoBookingId) ?? null : null, now)
  },

  // ─── Admin ──────────────────────────────────────────────────────────────

  /**
   * One tab of the admin list: needs a decision, open, closed. Overdue ones
   * first, then oldest first in the open tabs and newest first when closed.
   * Each row carries the customer's figures (approved in 6 months, waiting,
   * claims left, claim rate): admin only.
   */
  async adminList(query: AdminClaimsQuery, now = new Date()) {
    const tab = query.tab as AdminClaimTab
    const rows = await guaranteeRepository.listAdminClaims(ADMIN_TAB_STATUSES[tab])
    const histories = await guaranteeRepository.historiesFor(rows.map((row) => row.claim.userId), now)
    const counts = await guaranteeRepository.countByStatus()
    const items = rows
      .map((row) => adminRow(row.claim, row, histories.get(row.claim.userId), now))
      .sort((a, b) =>
        tab === 'closed'
          ? b.createdAt.localeCompare(a.createdAt)
          : Number(b.overdue) - Number(a.overdue) || a.createdAt.localeCompare(b.createdAt)
      )
    const sum = (statuses: readonly string[]) => statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
    return {
      items,
      counts: {
        needs_decision: sum(ADMIN_TAB_STATUSES.needs_decision),
        open: sum(ADMIN_TAB_STATUSES.open),
        closed: sum(ADMIN_TAB_STATUSES.closed),
      },
    }
  },

  /** One claim in full: both sides' photos, the booking, the customer's other claims. */
  async adminGet(id: string, now = new Date()) {
    const claim = await guaranteeRepository.findClaimById(id)
    if (!claim) throw claimNotFound()
    const [booking] = await guaranteeRepository.bookingsForClaims([claim.bookingId])
    const histories = await guaranteeRepository.historiesFor([claim.userId], now)
    const others = await guaranteeRepository.listClaimsOfCustomer(claim.userId)
    const redos = await guaranteeRepository.redoTimes(claim.redoBookingId ? [claim.redoBookingId] : [])
    const redo = claim.redoBookingId ? redos.get(claim.redoBookingId) ?? null : null
    const row = adminRow(
      claim,
      {
        garageName: booking?.vendor?.businessName ?? 'Garage',
        customerName: booking?.user?.name ?? 'Customer',
        customerPhone: booking?.user?.phone ?? '',
      },
      histories.get(claim.userId),
      now
    )
    const paid = booking?.payment
    return {
      ...row,
      customerPhotos: claim.photos.map(photoView),
      garagePhotos: garagePhotosOf(booking),
      booking: booking
        ? {
            id: booking.id,
            service: serviceLabel(booking),
            bookingType: booking.bookingType,
            scheduledAt: booking.scheduledAt.toISOString(),
            completedAt: iso(booking.completedAt ?? booking.deliveredAt),
            car: booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : null,
            paid: paid ? (Number(paid.amount) + Number(paid.creditAmount ?? 0)).toFixed(2) : null,
            photosWaived: booking.photosWaivedAt !== null,
            refundApprovedAt: iso(booking.guaranteeRefundAt),
          }
        : null,
      redoBooking: claim.redoBookingId && redo
        ? { id: claim.redoBookingId, scheduledAt: redo.scheduledAt.toISOString(), status: redo.status }
        : null,
      otherClaims: others
        .filter((other) => other.id !== claim.id)
        .map((other) => ({
          id: other.id,
          bookingId: other.bookingId,
          status: other.status,
          garageName: other.garageName,
          createdAt: other.createdAt.toISOString(),
          approved: other.approvedAt !== null,
        })),
      allowed: {
        redo: decisionRefusal(claim.status, 'redo') === null,
        refund: decisionRefusal(claim.status, 'refund') === null,
        reject: decisionRefusal(claim.status, 'reject') === null,
      },
    }
  },

  /**
   * Detlio's decision, with the typed name: a redo (the customer picks a
   * time within 7 days), a refund instead (lib/refunds.ts owes the booking's
   * payment from now; the garage earns nothing on the job), or not approved
   * with a reason the customer reads. Written once (the claim row locked,
   * conditional on its state); the audit row in the same transaction.
   */
  async decide(actorSub: string, id: string, input: DecideClaimInput, now = new Date()) {
    const claim = await guaranteeRepository.findClaimById(id)
    if (!claim) throw claimNotFound()
    const decision = input.decision as ClaimDecision
    const refusal = decisionRefusal(claim.status, decision)
    if (refusal) {
      const message = {
        closed: 'This claim is closed.',
        redo_booked: 'A redo is already booked on this claim. Cancel it first if it cannot happen.',
        not_for_approved: 'A redo is already approved. Only a refund instead can be decided now.',
      }[refusal]
      throw new AppError(409, message, 'GUARANTEE_CLAIM_CHANGED')
    }

    const reason = input.reason?.trim() || null
    const base = {
      decision,
      decidedBy: input.actorName,
      decidedAt: now,
      decisionReason: reason,
      ...(input.note?.trim() ? { adminNote: input.note.trim() } : {}),
    }
    const set =
      decision === 'redo'
        ? { ...base, ...approvedForRedo(now), approvedAt: claim.approvedAt ?? now }
        : decision === 'refund'
          ? { ...base, status: 'refund_approved' as const, approvedAt: claim.approvedAt ?? now, closedAt: now, closeReason: 'refund' as const }
          : { ...base, status: 'rejected' as const, closedAt: now, closeReason: 'rejected' as const }
    const note = {
      redo: `Detlio approved a free redo (${input.actorName}).`,
      refund: `Detlio approved a refund instead of a redo (${input.actorName}). The booking's payment is owed back; the garage is paid nothing on it.`,
      reject: `Detlio did not approve the free redo claim (${input.actorName}): ${reason ?? ''}`.trim(),
    }[decision]

    let decided
    try {
      decided = await guaranteeRepository.decide({
        claimId: id,
        decision,
        from: decidableFrom(decision),
        set,
        actorSub,
        actorName: input.actorName,
        note,
        now,
      })
    } catch (error) {
      if ((error as { code?: string })?.code === 'GUARANTEE_REFUND_STATE') {
        throw new AppError(409, 'This booking cannot be refunded this way (it is not a completed job, or a refund was already approved).', 'GUARANTEE_REFUND_STATE')
      }
      throw error
    }
    if (decided.kind === 'changed') throw claimChanged()
    const updated = decided.claim

    log.info({ claimId: id, decision, actorName: input.actorName }, 'guarantee:decided')
    tellCustomer(updated, decision)
    if (decision === 'redo') {
      tellGarage(updated, (b) => pushMessages.garageClaimApproved(b, updated.id, 'detlio'))
    } else {
      tellGarage(updated, (b) => pushMessages.garageClaimDecided(b, updated.id, decision))
    }
    // A refund instead: the credit part goes back as credit at once, and
    // the automatic mode (AUTO_REFUNDS) sends the rest; otherwise it waits on
    // the Refunds page like any refund owed.
    if (decision === 'refund') {
      refundsService.queueAutoRefund({ kind: 'booking', id: updated.bookingId })
      // Detlio Rewards (0050): a refunded booking loses its stamp if still
      // on the card, like any other refund.
      rewardsService.scheduleAfterRefund(updated.bookingId)
    }

    return guaranteeService.adminGet(id, now)
  },

  // ─── Moving on its own ──────────────────────────────────────────────────

  /**
   * After any change to a free redo booking (completed, cancelled, no-show),
   * its claim moves on: run after the response, never failing the write.
   * The cron's sweep is the safety net.
   */
  redoChanged(bookingId: string): void {
    runInBackground('guarantee_redo_changed', async () => {
      const claimId = await guaranteeRepository.findClaimIdByRedo(bookingId)
      if (!claimId) return
      const claim = await guaranteeRepository.findClaimById(claimId)
      if (claim) await guaranteeService.reconcile(claim, new Date())
    })
  },

  /** Moves one claim on if its state says so (lib/guarantee.ts nextClaimMove), and tells people. */
  async reconcile(claim: ClaimRecord, now: Date) {
    const redo = claim.redoBookingId ? await guaranteeRepository.findRedoState(claim.redoBookingId) : null
    const move = nextClaimMove(claim, redo, now)
    if (!move) return null
    const updated = await guaranteeRepository.applyMove(claim, move, now)
    if (!updated) return null
    log.info({ claimId: claim.id, from: claim.status, to: updated.status, closeReason: updated.closeReason }, 'guarantee:moved')

    if (move.garageResponse === 'timed_out') {
      tellCustomer(updated, 'redo')
      tellGarage(updated, (b) => pushMessages.garageClaimApproved(b, updated.id, 'timed_out'))
    }
    if (updated.status === 'needs_detlio' && move.detlioDecideBy) {
      const booking = await guaranteeRepository.findClaimableBooking(updated.bookingId)
      alertOps({
        kind: 'guarantee_needs_detlio',
        claimId: updated.id,
        bookingId: updated.bookingId,
        garageName: booking?.vendorName ?? 'The garage',
        why: 'redo_failed',
        note: null,
        decideBy: move.detlioDecideBy,
      })
    }
    return updated
  },

  /**
   * The pending-digest cron's part: garages' time run out (accepted), redo
   * windows run out (closed), redo bookings finished one way or another.
   * Oldest first, a bounded batch within a time budget. Nothing at all while
   * GUARANTEE_ENABLED is off.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    if (!env.guaranteeEnabled) return { enabled: false as const }
    const candidates = await guaranteeRepository.listToSweep(now, GUARANTEE_RULES.sweepLimit)
    const summary = { enabled: true as const, candidates: candidates.length, moved: 0, failed: 0 }
    if (options.dryRun) return summary
    const started = Date.now()
    for (const claim of candidates) {
      if (Date.now() - started > SWEEP_BUDGET_MS) break
      try {
        if (await guaranteeService.reconcile(claim, now)) summary.moved += 1
      } catch (err) {
        summary.failed += 1
        log.error({ err, claimId: claim.id }, 'guarantee:sweep_failed')
      }
    }
    return summary
  },

  /** Approved claims per garage in the last 90 days, for admin's garage cards. Null while off. */
  async approvedByGarage(now = new Date()): Promise<Map<string, number> | null> {
    if (!env.guaranteeEnabled) return null
    return guaranteeRepository.approvedCountsByVendor(
      new Date(now.getTime() - GUARANTEE_RULES.garageCardDays * 24 * HOUR_MS)
    )
  },
}

/** An admin list row: the claim, who, where, the clock and the customer's figures. */
function adminRow(
  claim: ClaimRecord,
  who: { garageName: string; customerName: string; customerPhone: string },
  figures: { completedBookings: number; claims: number; approvedRecently: number; undecided: number } | undefined,
  now: Date
) {
  const history = figures ?? { completedBookings: 0, claims: 1, approvedRecently: 0, undecided: 0 }
  return {
    id: claim.id,
    bookingId: claim.bookingId,
    bookingRef: bookingReference(claim.bookingId),
    vendorId: claim.vendorId,
    garageName: who.garageName,
    customer: { name: who.customerName, phone: who.customerPhone },
    status: claim.status as ClaimStatus,
    closed: isClosedStatus(claim.status),
    route: claim.route,
    routeReasons: claim.routeReasons.map((reason) => ({ key: reason, label: ROUTE_REASON_LABELS[reason] })),
    issues: claim.issues.map((issue) => ({ key: issue, label: ISSUE_LABELS[issue] })),
    otherText: claim.otherText,
    createdAt: claim.createdAt.toISOString(),
    garageRespondBy: iso(claim.garageRespondBy),
    detlioDecideBy: iso(claim.detlioDecideBy),
    overdue: claimOverdue(claim, now),
    garageResponse: claim.garageResponse,
    garageNote: claim.garageNote,
    garageRespondedAt: iso(claim.garageRespondedAt),
    decision: claim.decision,
    decidedBy: claim.decidedBy,
    decidedAt: iso(claim.decidedAt),
    decisionReason: claim.decisionReason,
    adminNote: claim.adminNote,
    approvedAt: iso(claim.approvedAt),
    redoBookBy: iso(claim.redoBookBy),
    redoBookingId: claim.redoBookingId,
    closedAt: iso(claim.closedAt),
    closeReason: claim.closeReason,
    // The customer's figures: admin only, never the customer.
    customerFigures: {
      completedBookings: history.completedBookings,
      claims: history.claims,
      approvedLast6Months: history.approvedRecently,
      waiting: history.undecided,
      claimsLeft: claimsLeft(history),
      claimRate: history.completedBookings > 0 ? Math.round((history.claims / history.completedBookings) * 100) / 100 : null,
      firstBooking: claim.routeReasons.includes('first_booking'),
      claimsOften: claim.routeReasons.includes('high_claim_rate'),
    },
  }
}
