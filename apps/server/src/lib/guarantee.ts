/**
 * Detlio Guarantee (0051): a free redo within 48 hours when a job was not
 * done properly, decided on photos, with limits against misuse. Pure rules,
 * with the clock passed in, so every one is unit-tested.
 *
 * The owner's decision (18 Oct 2026): "Free redo within 48 hours if it has a
 * before/after picture and if it is reasonable, because a lot of people might
 * start misusing it." Behind GUARANTEE_ENABLED (default off). Every number is
 * in GUARANTEE_RULES; never restate one. The words and the same numbers the
 * apps show are twinned in packages/core/src/guarantee.ts
 * (guarantee.parity.test.ts).
 *
 * The rules, each one here and tested:
 *
 *   1. Eligible jobs: completed bookings paid through Detlio (online, money
 *      landed and not refunded), whose services can be redone — a car wash or
 *      a detailing, or a package of only those — and none priced on
 *      inspection. Coating, scratch removal, inspection and "others" go
 *      through complaints. Not a Test-marked booking, not a redo itself. One
 *      claim per booking (unique index).
 *   2. The window: the claim is made within 48 hours of completion.
 *   3. Evidence: at least 2 photos of the problem, taken in the app (the
 *      upload folder only opens inside the window, so the upload time is what
 *      counts, never a photo's own metadata, which the browser strips), and
 *      what is wrong from a fixed list ("Something else" needs words).
 *   4. Photos decide the route: the garage's before and after photos for the
 *      job (lib/photo-compliance.ts' own test, 2 + 2) send the claim to the
 *      garage first; no photos is no defence, so the claim is approved at
 *      once. A job whose photos Detlio waived goes to Detlio.
 *   5. The garage answers within 12 hours of its opening hours (0042's clock,
 *      capped at 48 hours; a garage that does not open in that time gets a
 *      plain 12 hours): Accept, or Dispute with a note. No answer is Accept.
 *   6. Detlio decides a dispute within 24 hours: a redo, a refund instead
 *      (lib/refunds.ts then owes the booking's payment; the garage earns
 *      nothing on it, so a payout already made comes back as a negative
 *      line), or not approved with a reason the customer reads.
 *   7. Misuse limits: at most 2 approved claims per customer in 6 months
 *      (open ones count, so two waiting can never both be approved past it);
 *      a customer whose claims are over 30% of their completed bookings
 *      (with 3 or more) and a customer's first-ever booking always go to
 *      Detlio, never approved on their own; a redo booking cannot be claimed
 *      on; a customer who does not turn up for the redo closes the claim
 *      with nothing more owed. How many claims are left is shown to admin,
 *      never to the customer.
 *   8. The redo: a ₹0 booking at the same garage within 7 days of approval,
 *      written through the ordinary slot rule and capacity check
 *      (lib/slots.ts, checkGarageCanTake), marked `guarantee_redo`. It earns
 *      the garage nothing and Detlio no commission (payouts and Statistics
 *      leave it out), takes no receipt number, and is never a reward.
 *
 * Words for notifications and Updates live here too and pass the copy rules
 * (lib/copy-rules.ts bans "guarantee"), so they say "free redo".
 */
import type { ServiceCategory } from './categories.js'
import { addDays, istDateKey, istSlotShortLabel } from './ist.js'
import { jobMetPhotoStandard } from './photo-compliance.js'
import { garageRespondBy, SLOT_MARGIN_MS, type GarageCalendar } from './response-deadline.js'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Every number of the guarantee, in one place (owner decision, 18 Oct 2026). */
export const GUARANTEE_RULES = {
  /** A claim is made within this many hours of the job's completion. */
  claimWindowHours: 48,
  /** Photos of the problem a claim needs, and the most it takes. */
  minPhotos: 2,
  maxPhotos: 6,
  /** The garage's time to answer: hours of its opening hours. */
  garageReviewHours: 12,
  /** ...never more than this many hours of wall-clock time. */
  garageReviewCapHours: 48,
  /** Detlio's own target for deciding a claim that needs it. */
  detlioDecideHours: 24,
  /** The redo is booked for a time within this many days of approval. */
  redoWithinDays: 7,
  /** Approved claims (and open ones) a customer may have in the window below. */
  maxApprovedClaims: 2,
  /** "6 months". */
  approvedClaimsWindowDays: 183,
  /** Claims over this share of completed bookings need Detlio every time... */
  reviewRateThreshold: 0.3,
  /** ...once the customer has at least this many completed bookings. */
  reviewRateMinBookings: 3,
  /** The categories a redo can repeat; a package qualifies when all its members do. */
  redoCategories: ['car_wash', 'detailing'] as const satisfies readonly ServiceCategory[],
  /** Text limits. */
  otherTextMax: 300,
  garageNoteMax: 500,
  reasonMax: 500,
  /** The cron's batch: claims looked at per run. */
  sweepLimit: 20,
  /** The admin garage card's look-back for approved claims. */
  garageCardDays: 90,
} as const

// ─── What is wrong ───────────────────────────────────────────────────────────

export const GUARANTEE_ISSUES = [
  'missed_spots',
  'water_marks',
  'interior_not_cleaned',
  'wrong_service',
  'other',
] as const
export type GuaranteeIssue = (typeof GUARANTEE_ISSUES)[number]

export const ISSUE_LABELS: Record<GuaranteeIssue, string> = {
  missed_spots: 'Missed spots or dirt left',
  water_marks: 'Water marks or streaks',
  interior_not_cleaned: 'Interior not cleaned',
  wrong_service: 'Wrong service done',
  other: 'Something else',
}

export function isGuaranteeIssue(value: unknown): value is GuaranteeIssue {
  return typeof value === 'string' && (GUARANTEE_ISSUES as readonly string[]).includes(value)
}

// ─── Where a claim stands ────────────────────────────────────────────────────

export const CLAIM_STATUSES = [
  'waiting_garage',
  'needs_detlio',
  'redo_approved',
  'redo_booked',
  'redo_done',
  'refund_approved',
  'rejected',
  'lapsed',
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

/** Waiting for an answer: these count toward the limit until decided. */
export const UNDECIDED_STATUSES = ['waiting_garage', 'needs_detlio'] as const satisfies readonly ClaimStatus[]
/** Nothing more happens to these. */
export const CLOSED_STATUSES = ['redo_done', 'refund_approved', 'rejected', 'lapsed'] as const satisfies readonly ClaimStatus[]

export function isClosedStatus(status: ClaimStatus): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status)
}

/** Who looks at it first. */
export type ClaimRoute = 'garage' | 'detlio' | 'auto'

/** Why it went where it went; admin reads these. */
export type RouteReason =
  | 'garage_photos'
  | 'no_garage_photos'
  | 'photos_waived'
  | 'first_booking'
  | 'high_claim_rate'

export const ROUTE_REASON_LABELS: Record<RouteReason, string> = {
  garage_photos: 'Garage has before and after photos',
  no_garage_photos: 'Garage skipped its photos',
  photos_waived: 'Photos were waived on this job',
  first_booking: "Customer's first booking",
  high_claim_rate: 'Customer claims often',
}

export type GarageResponse = 'accepted' | 'disputed' | 'timed_out'
export type ClaimDecision = 'redo' | 'refund' | 'reject'
export type CloseReason = 'redo_done' | 'redo_no_show' | 'redo_not_booked' | 'refund' | 'rejected'

// ─── Rule 1 and 2: which bookings can be claimed on ──────────────────────────

/** A booking's service, with a package's members' categories. */
export interface ClaimableItem {
  category: ServiceCategory
  pricingType: string | null
  /** A package's members' categories (empty for a plain service). */
  memberCategories?: ServiceCategory[]
}

export interface ClaimableBooking {
  status: string
  completedAt: Date | null
  markedTestAt: Date | null
  guaranteeRedo: boolean
  paymentMethod: string
  payment: { status: string; amount: string; creditAmount?: string | null; refundedAmount?: string | null } | null
  items: ClaimableItem[]
}

/**
 * Why a booking cannot be claimed on, or null when it can. The order is the
 * order a person would ask in; the customer is only ever told a plain line
 * (claimRefusalMessage), never which limit they reached.
 */
export type ClaimRefusal =
  | 'not_completed'
  | 'test_booking'
  | 'is_redo'
  | 'not_paid'
  | 'refunded'
  | 'not_redoable'
  | 'window_closed'
  | 'already_claimed'
  | 'limit_reached'

const REDO_CATEGORIES: readonly string[] = GUARANTEE_RULES.redoCategories

/** Whether every service on the booking is one a garage can simply do again. */
export function canBeRedone(items: readonly ClaimableItem[]): boolean {
  if (items.length === 0) return false
  return items.every((item) => {
    if (item.pricingType === 'on_inspection') return false
    if (REDO_CATEGORIES.includes(item.category)) return true
    if (item.category !== 'package') return false
    const members = item.memberCategories ?? []
    return members.length > 0 && members.every((category) => REDO_CATEGORIES.includes(category))
  })
}

function paise(amount: string | null | undefined): number {
  const value = Number(amount ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/** Paid through Detlio: online, money landed, and something was paid. */
export function paidThroughDetlio(booking: Pick<ClaimableBooking, 'paymentMethod' | 'payment'>): boolean {
  const payment = booking.payment
  if (!payment || booking.paymentMethod !== 'online') return false
  if (payment.status !== 'paid' && payment.status !== 'refunded') return false
  return paise(payment.amount) + paise(payment.creditAmount) > 0
}

/** When the window to claim closes: 48 hours after completion. */
export function claimDeadline(completedAt: Date): Date {
  return new Date(completedAt.getTime() + GUARANTEE_RULES.claimWindowHours * HOUR_MS)
}

export function claimRefusal(
  booking: ClaimableBooking,
  context: { hasClaim: boolean; limitReached: boolean; now: Date }
): ClaimRefusal | null {
  if (booking.status !== 'completed' || !booking.completedAt) return 'not_completed'
  if (booking.markedTestAt) return 'test_booking'
  if (booking.guaranteeRedo) return 'is_redo'
  if (!paidThroughDetlio(booking)) return 'not_paid'
  if (booking.payment!.status === 'refunded' || paise(booking.payment!.refundedAmount) > 0) return 'refunded'
  if (!canBeRedone(booking.items)) return 'not_redoable'
  if (context.hasClaim) return 'already_claimed'
  if (context.now.getTime() > claimDeadline(booking.completedAt).getTime()) return 'window_closed'
  if (context.limitReached) return 'limit_reached'
  return null
}

/** What the customer is told when they try anyway. Never which limit it was. */
export function claimRefusalMessage(refusal: ClaimRefusal): string {
  switch (refusal) {
    case 'window_closed':
      return `A free redo can be asked for within ${GUARANTEE_RULES.claimWindowHours} hours of the job being completed. Use Help with this booking to raise a complaint instead.`
    case 'already_claimed':
      return 'A free redo has already been asked for on this booking.'
    case 'not_redoable':
      return 'This service is not covered by a free redo. Use Help with this booking to raise a complaint instead.'
    case 'not_completed':
      return 'A free redo can be asked for once the job is completed.'
    default:
      return "This booking can't take a free redo claim. Use Help with this booking to raise a complaint instead."
  }
}

// ─── Rule 3: what the claim carries ──────────────────────────────────────────

export type ClaimInputProblem = 'too_few_photos' | 'too_many_photos' | 'no_issue' | 'other_needs_text' | 'duplicate_photos'

export function claimInputProblem(input: {
  issues: readonly GuaranteeIssue[]
  otherText?: string | null
  photoKeys: readonly string[]
}): ClaimInputProblem | null {
  if (input.issues.length === 0) return 'no_issue'
  if (input.issues.includes('other') && !(input.otherText ?? '').trim()) return 'other_needs_text'
  if (new Set(input.photoKeys).size !== input.photoKeys.length) return 'duplicate_photos'
  if (input.photoKeys.length < GUARANTEE_RULES.minPhotos) return 'too_few_photos'
  if (input.photoKeys.length > GUARANTEE_RULES.maxPhotos) return 'too_many_photos'
  return null
}

/** The folder a claim's photos go in: the job's own, so the reset and Delete forever find them. */
export function claimPhotoFolder(bookingId: string): string {
  return `job-photos/${bookingId}/guarantee`
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UPLOADED_NAME = new RegExp(`^${UUID}\\.(jpg|png|webp)$`)

/**
 * A key createPresignedUpload minted for this booking's claim photos:
 * vendors/<vendorId>/job-photos/<bookingId>/guarantee/<uuid>.<ext>. Anything
 * else (another job, the garage's or the customer's condition photos) is
 * refused, so a claim can never be made with someone else's upload.
 */
export function isClaimPhotoKey(key: string, vendorId: string, bookingId: string): boolean {
  const prefix = `vendors/${vendorId}/${claimPhotoFolder(bookingId)}/`
  return key.startsWith(prefix) && UPLOADED_NAME.test(key.slice(prefix.length))
}

// ─── Rule 7: the customer's history ──────────────────────────────────────────

export interface CustomerClaimHistory {
  /** Completed bookings (not redos, not Test), this one included. */
  completedBookings: number
  /** Completed bookings before this one: 0 means this is their first. */
  completedBefore: number
  /** Every claim they made before this one, whatever became of it. */
  claimsBefore: number
  /** Claims approved in the last 6 months. */
  approvedRecently: number
  /** Claims still waiting for the garage or Detlio. */
  undecided: number
}

/** The start of the 6-month window approved claims are counted in. */
export function approvedWindowStart(now: Date): Date {
  return new Date(now.getTime() - GUARANTEE_RULES.approvedClaimsWindowDays * DAY_MS)
}

/** Approved in 6 months plus those waiting: at the limit, no new claim. */
export function limitReached(history: Pick<CustomerClaimHistory, 'approvedRecently' | 'undecided'>): boolean {
  return history.approvedRecently + history.undecided >= GUARANTEE_RULES.maxApprovedClaims
}

/** How many more claims could be approved for them now: admin only. */
export function claimsLeft(history: Pick<CustomerClaimHistory, 'approvedRecently' | 'undecided'>): number {
  return Math.max(0, GUARANTEE_RULES.maxApprovedClaims - history.approvedRecently - history.undecided)
}

/** Claims (this one included) as a share of completed bookings. */
export function claimRate(history: Pick<CustomerClaimHistory, 'completedBookings' | 'claimsBefore'>): number {
  return history.completedBookings > 0 ? (history.claimsBefore + 1) / history.completedBookings : 1
}

/** The reasons a claim must go to Detlio, whatever the photos say. */
export function reviewFlags(history: CustomerClaimHistory): RouteReason[] {
  const flags: RouteReason[] = []
  if (history.completedBefore === 0) flags.push('first_booking')
  if (
    history.completedBookings >= GUARANTEE_RULES.reviewRateMinBookings &&
    claimRate(history) > GUARANTEE_RULES.reviewRateThreshold
  ) {
    flags.push('high_claim_rate')
  }
  return flags
}

// ─── Rule 4: where the claim goes ────────────────────────────────────────────

export interface RouteInput {
  /** The garage's own photos of the job (uploaded_by_role = 'garage'). */
  garagePhotos: { before: number; after: number }
  photosWaived: boolean
  history: CustomerClaimHistory
}

export interface RoutedClaim {
  route: ClaimRoute
  reasons: RouteReason[]
  status: Extract<ClaimStatus, 'waiting_garage' | 'needs_detlio' | 'redo_approved'>
}

/**
 * Photos decide: the garage's before and after photos send it to the garage;
 * none is no defence, so it is approved now. A waived job goes to Detlio, and
 * so does any claim with a review flag (a first booking, or a customer who
 * claims often): those are never approved on their own.
 */
export function routeClaim(input: RouteInput): RoutedClaim {
  const flags = reviewFlags(input.history)
  const hasPhotos = jobMetPhotoStandard({
    garageBefore: input.garagePhotos.before,
    garageAfter: input.garagePhotos.after,
  })
  const photoReason: RouteReason = hasPhotos
    ? 'garage_photos'
    : input.photosWaived
      ? 'photos_waived'
      : 'no_garage_photos'

  if (flags.length > 0) return { route: 'detlio', reasons: [...flags, photoReason], status: 'needs_detlio' }
  if (hasPhotos) return { route: 'garage', reasons: [photoReason], status: 'waiting_garage' }
  if (input.photosWaived) return { route: 'detlio', reasons: [photoReason], status: 'needs_detlio' }
  return { route: 'auto', reasons: [photoReason], status: 'redo_approved' }
}

// ─── Rule 5: the garage's answer ─────────────────────────────────────────────

/**
 * The garage's deadline: 12 hours of its opening hours from `from` (0042's
 * walk over its weekly hours, holidays and pause), never more than 48 hours
 * away. A garage that does not open at all in that time (paused, or shut
 * every day) gets a plain 12 hours.
 */
export function garageReviewBy(from: Date, calendar: GarageCalendar): Date {
  const cap = from.getTime() + GUARANTEE_RULES.garageReviewCapHours * HOUR_MS
  const walked = garageRespondBy({
    from,
    // The slot margin is an hour, so this puts the margin exactly at the cap.
    scheduledAt: new Date(cap + SLOT_MARGIN_MS),
    windowMins: GUARANTEE_RULES.garageReviewHours * 60,
    calendar,
  })
  if (walked.rule === 'opening_hours') return walked.respondBy
  if (walked.clockStartsAt === null) return new Date(from.getTime() + GUARANTEE_RULES.garageReviewHours * HOUR_MS)
  return new Date(cap)
}

/** When the redo must be booked for, at the latest: 7 days from approval. */
export function redoBookBy(approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + GUARANTEE_RULES.redoWithinDays * DAY_MS)
}

/** Detlio's own target: 24 hours from when it came to Detlio. */
export function detlioDecideBy(from: Date): Date {
  return new Date(from.getTime() + GUARANTEE_RULES.detlioDecideHours * HOUR_MS)
}

export type GarageAnswer = 'accept' | 'dispute'

export type GarageAnswerRefusal = 'not_waiting' | 'time_passed'

/**
 * Whether the garage can still answer. Accepting late is the same outcome as
 * not answering, so it is allowed; a dispute after the deadline is not.
 */
export function garageAnswerRefusal(
  claim: { status: ClaimStatus; garageRespondBy: Date | null },
  answer: GarageAnswer,
  now: Date
): GarageAnswerRefusal | null {
  if (claim.status !== 'waiting_garage') return 'not_waiting'
  if (answer === 'dispute' && claim.garageRespondBy && now.getTime() > claim.garageRespondBy.getTime()) {
    return 'time_passed'
  }
  return null
}

/** Past the garage's deadline with no answer: treated as accepted. */
export function garageTimedOut(claim: { status: ClaimStatus; garageRespondBy: Date | null }, now: Date): boolean {
  return claim.status === 'waiting_garage' && claim.garageRespondBy !== null && now.getTime() > claim.garageRespondBy.getTime()
}

/** The write that approves a redo (by the garage, its silence, Detlio, or no photos). */
export function approvedForRedo(now: Date) {
  return {
    status: 'redo_approved' as const,
    approvedAt: now,
    redoBookBy: redoBookBy(now),
  }
}

// ─── Rule 6: Detlio's decision ───────────────────────────────────────────────

export type DecisionRefusal = 'closed' | 'redo_booked' | 'not_for_approved'

/**
 * What Detlio may decide from each state: anything while it waits for the
 * garage or for Detlio; on a redo already approved (not yet booked) only a
 * refund instead, when the redo turns out not to be practical. A redo that is
 * booked, or a closed claim, is not decided again.
 */
export function decisionRefusal(status: ClaimStatus, decision: ClaimDecision): DecisionRefusal | null {
  if (status === 'waiting_garage' || status === 'needs_detlio') return null
  if (status === 'redo_approved') return decision === 'refund' ? null : 'not_for_approved'
  if (status === 'redo_booked') return 'redo_booked'
  return 'closed'
}

/** Which statuses a decision may be made from (the write is conditional on them). */
export function decidableFrom(decision: ClaimDecision): ClaimStatus[] {
  return decision === 'refund'
    ? ['waiting_garage', 'needs_detlio', 'redo_approved']
    : ['waiting_garage', 'needs_detlio']
}

// ─── The redo booking, and what becomes of it ────────────────────────────────

/** The redo's money: nothing, on every figure. */
export const REDO_MONEY = {
  amount: '0.00',
  subtotalAmount: '0.00',
  discountAmount: '0.00',
  payment: { amount: '0.00', creditAmount: '0.00', status: 'paid' as const },
} as const

export type RedoTimeRefusal = 'not_approved' | 'too_late' | 'past_window' | 'not_offered'

/**
 * Whether the customer may book the redo at `scheduledAt`: the claim is
 * approved and not yet booked, the window is still open, the time is inside
 * it, and the slot rule offers it (`offered`, from jobSlots).
 */
export function redoTimeRefusal(input: {
  status: ClaimStatus
  redoBookBy: Date | null
  scheduledAt: Date
  offered: boolean
  now: Date
}): RedoTimeRefusal | null {
  if (input.status !== 'redo_approved' || !input.redoBookBy) return 'not_approved'
  if (input.now.getTime() > input.redoBookBy.getTime()) return 'too_late'
  if (input.scheduledAt.getTime() > input.redoBookBy.getTime()) return 'past_window'
  if (!input.offered) return 'not_offered'
  return null
}

/** The IST dates a redo can be on: today up to the last day of the window. */
export function redoDates(now: Date, bookBy: Date): string[] {
  const dates: string[] = []
  const last = istDateKey(bookBy)
  for (let day = istDateKey(now); day <= last && dates.length <= GUARANTEE_RULES.redoWithinDays; day = addDays(day, 1)) {
    dates.push(day)
  }
  return dates
}

/** The redo booking as the reconcile reads it. */
export interface RedoBookingState {
  status: string
  noShow: 'customer' | 'garage' | null
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancelledOnBehalfOf: 'customer' | 'garage' | 'detlio' | null
}

export interface ClaimMove {
  status: ClaimStatus
  closeReason?: CloseReason
  detlioDecideBy?: Date
  /** Unlink the redo booking (it was cancelled, or is gone); its notes keep the history. */
  clearRedo?: boolean
  /** The garage's silence, written as its answer. */
  garageResponse?: GarageResponse
  approvedAt?: Date
  redoBookBy?: Date
}

/**
 * What a claim moves to on its own, or null when nothing changes: the
 * garage's time running out (accepted), the 7 days running out with no redo
 * booked, and the redo booking finishing one way or another. Run by the cron
 * and after every change to a redo booking.
 */
export function nextClaimMove(
  claim: { status: ClaimStatus; garageRespondBy: Date | null; redoBookBy: Date | null; redoBookingId: string | null },
  redo: RedoBookingState | null,
  now: Date
): ClaimMove | null {
  const windowOpen = (bookBy: Date | null) => bookBy !== null && now.getTime() <= bookBy.getTime()

  if (garageTimedOut(claim, now)) {
    return { ...approvedForRedo(now), garageResponse: 'timed_out' }
  }

  if (claim.status === 'redo_approved') {
    return windowOpen(claim.redoBookBy) ? null : { status: 'lapsed', closeReason: 'redo_not_booked' }
  }

  if (claim.status !== 'redo_booked') return null

  // The redo booking is gone (deleted by the test-data reset): as if it was
  // never booked.
  if (!redo) {
    return windowOpen(claim.redoBookBy)
      ? { status: 'redo_approved', clearRedo: true }
      : { status: 'lapsed', closeReason: 'redo_not_booked', clearRedo: true }
  }
  if (redo.status === 'completed') return { status: 'redo_done', closeReason: 'redo_done' }
  if (redo.status !== 'cancelled') return null

  // The customer did not turn up: the claim is closed, nothing more owed.
  if (redo.noShow === 'customer') return { status: 'lapsed', closeReason: 'redo_no_show' }

  const customersCall =
    redo.cancelledBy === 'user' || (redo.cancelledBy === 'admin' && redo.cancelledOnBehalfOf === 'customer')
  if (customersCall && redo.noShow === null) {
    // They can pick another time while the window is open.
    return windowOpen(claim.redoBookBy)
      ? { status: 'redo_approved', clearRedo: true }
      : { status: 'lapsed', closeReason: 'redo_not_booked', clearRedo: true }
  }

  // The garage's side (a garage no-show, or cancelled by the garage or by
  // Detlio): the redo did not happen through no fault of the customer's, so
  // Detlio decides again (another redo, or a refund instead).
  return { status: 'needs_detlio', detlioDecideBy: detlioDecideBy(now), clearRedo: true }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type AdminClaimTab = 'needs_decision' | 'open' | 'closed'

export const ADMIN_TAB_STATUSES: Record<AdminClaimTab, readonly ClaimStatus[]> = {
  needs_decision: ['needs_detlio'],
  open: ['waiting_garage', 'redo_approved', 'redo_booked'],
  closed: CLOSED_STATUSES,
}

/** Past its clock: Detlio's 24 hours, or the garage's deadline the cron has not caught yet. */
export function claimOverdue(
  claim: { status: ClaimStatus; garageRespondBy: Date | null; detlioDecideBy: Date | null },
  now: Date
): boolean {
  if (claim.status === 'needs_detlio') return claim.detlioDecideBy !== null && now > claim.detlioDecideBy
  if (claim.status === 'waiting_garage') return claim.garageRespondBy !== null && now > claim.garageRespondBy
  return false
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** "Waiting for <garage>" and the rest, as the customer's booking page says it. */
export function customerStatusLine(input: {
  status: ClaimStatus
  garageName: string
  garageRespondBy: Date | null
  redoBookBy: Date | null
  redoScheduledAt: Date | null
  closeReason: CloseReason | null
  decisionReason: string | null
}): { title: string; body: string | null } {
  switch (input.status) {
    case 'waiting_garage':
      return {
        title: `Waiting for ${input.garageName}`,
        body: input.garageRespondBy
          ? `They answer by ${istSlotShortLabel(input.garageRespondBy)}. If they don't, your free redo is approved.`
          : null,
      }
    case 'needs_detlio':
      return {
        title: 'Detlio is reviewing your claim',
        body: `We compare your photos with the garage's and decide within ${GUARANTEE_RULES.detlioDecideHours} hours.`,
      }
    case 'redo_approved':
      return {
        title: 'Free redo approved',
        body: input.redoBookBy
          ? `Pick a time at ${input.garageName} by ${istSlotShortLabel(input.redoBookBy)}.`
          : `Pick a time at ${input.garageName}.`,
      }
    case 'redo_booked':
      return {
        title: input.redoScheduledAt ? `Redo booked for ${istSlotShortLabel(input.redoScheduledAt)}` : 'Redo booked',
        body: `At ${input.garageName}, free of charge.`,
      }
    case 'redo_done':
      return { title: 'Redo done', body: `${input.garageName} redid the job.` }
    case 'refund_approved':
      return { title: 'Refund approved', body: 'Detlio approved a refund instead of a redo.' }
    case 'rejected':
      return { title: 'Not approved', body: input.decisionReason }
    case 'lapsed':
      return {
        title: 'Claim closed',
        body:
          input.closeReason === 'redo_no_show'
            ? "The redo was missed, so the claim is closed."
            : 'No redo time was picked in time, so the claim is closed.',
      }
  }
}

/** Push and Updates words: "free redo", never the banned word (lib/copy-rules.ts). */
export const REDO_WORDS = {
  sentTitle: 'Redo claim sent',
  sentBodyGarage: (garage: string, by: Date | null) =>
    by ? `${garage} answers by ${istSlotShortLabel(by)}.` : `${garage} is looking at it.`,
  sentBodyDetlio: 'Detlio is reviewing it.',
  approvedTitle: 'Free redo approved',
  approvedBody: (garage: string) => `Pick a time at ${garage}.`,
  refundTitle: 'Refund approved instead of a redo',
  refundBody: (garage: string) => `${garage} · the refund is due.`,
  notApprovedTitle: 'Redo claim not approved',
  notApprovedBody: 'See why on your booking.',
  closedTitle: 'Redo claim closed',
  closedBody: (garage: string) => `${garage}.`,
} as const
