/**
 * The Updates feed: what has happened on the customer's bookings, newest
 * first. Derived on every read from the timestamps the bookings already
 * carry; there is no event table to keep in step. Pure, with the clock passed
 * in, so every rule and every line of wording is unit-tested.
 *
 * Rules worth knowing:
 *
 *   - Only the last 30 days, at most 100 rows. That bound is what keeps the
 *     read cheap, more than any index.
 *   - A step with no recorded time is skipped, never guessed: bookings from
 *     before 0028 have no accepted/started/completed times.
 *   - The reminder ("Your booking is tomorrow") is dated 18:00 IST the day
 *     before the slot. It is left out for a booking made after that moment,
 *     and never dated before the booking was made or accepted. A booking
 *     accepted on the day itself gets none: by then it is not tomorrow.
 *   - "Refund due" is said only when lib/refunds.ts says money is owed back.
 *   - A notice about the customer's own booking is the first row (owner
 *     decision); everything else is newest first. It is live by definition,
 *     so the 30-day cut does not apply to it, and it is dated no earlier than
 *     the booking it is about, so a booking made after the customer last
 *     looked lights the bell.
 *   - Unread is anything after the moment the customer last opened Updates
 *     (users.updates_seen_at, or the account's creation when never opened).
 *   - A complaint of theirs (raised in the app, or logged by the team for
 *     their phone number) adds a row when the team acknowledges it, resolves
 *     it or closes it, each opening My complaints, where the answer is.
 *     Resolving or closing an open one stamps the acknowledgement at the same
 *     moment; that is the answer, not a second step, so it is one row.
 *
 * No row promises a message: only devices that turned browser notifications
 * on get one (0044, lib/push-messages.ts, which reuses these words), and
 * there is no SMS or WhatsApp, so nothing here says "we'll notify you"
 * (lib/copy-rules.ts).
 */
import { noticeMatchesBooking, type NoticeRow } from './notices.js'
import { customerSeesPhotos } from './job-records.js'
import { receiptAvailability, REFUND_METHODS } from './receipts.js'
import { bookingRefundTotals, isRazorpayRefundId } from './refunds.js'
import { addDays, istDateKey, istMidnight, istSlotShortLabel, istTimeLabel, istWeekdayLabel } from './ist.js'
import type { BookingType } from './booking-types.js'
import { formatComplaintNumber, type ComplaintStatus } from './complaints.js'
import { extraWorkPayable } from './extra-work.js'
import { isProposalLive, liveOptions } from './time-proposals.js'

export const UPDATES_WINDOW_DAYS = 30
export const MAX_UPDATES = 100

/**
 * How long a bank takes to show a refund, word for word as BANK_DAYS in
 * packages/core/src/refunds.ts (which the booking page and the Refund Policy
 * use; home-updates.test.ts fails if the two drift). Said, not promised.
 */
export const BANK_DAYS = '5–7 working days'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** One of the customer's bookings, with what the feed and Home read off it. */
export interface HubBooking {
  id: string
  status: string
  bookingType: BookingType
  scheduledAt: Date
  createdAt: Date
  acceptedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancelledOnBehalfOf: 'customer' | 'garage' | 'detlio' | null
  noShow: 'customer' | 'garage' | null
  /**
   * When the cron cancelled it because the garage did not accept in time
   * (0042). Optional so a hand-built booking (tests) needs no change.
   */
  responseMissedAt?: Date | null
  rescheduledFromId: string | null
  rescheduleCount: number
  /** Another booking was rescheduled from this one: its payment went with it. */
  moved: boolean
  reviewPromptDismissedAt: Date | null
  hasReview: boolean
  vehicleId: string
  /** "Hyundai i20" */
  vehicleName: string
  vendorId: string
  vendorName: string
  vendorPausedAt: Date | null
  /** "Express Wash", or "Express Wash + 1 more". */
  serviceLabel: string
  payment: {
    status: string
    amount: string
    paidAt: Date | null
    refundedAmount: string | null
    refundedAt: Date | null
    /** Gift a wash (0049): the part paid with Detlio credit, and when it went back. */
    creditAmount?: string | null
    creditReturnedAt?: Date | null
  } | null
  charges: Array<{
    id: string
    /** 'final_bill' or 'extra_work' (0041). */
    kind: string
    status: string
    amountDue: string
    createdAt: Date
    paidAt: Date | null
    gatewayPaymentId: string | null
    refundedAmount: string | null
    refundedAt: Date | null
    /** Extra work's "what" (its one line); null on a final bill. */
    description?: string | null
    cancelledAt?: Date | null
    cancelReason?: string | null
  }>
  /**
   * The newest time suggestion the garage made on this booking (0041), if
   * any. Only its times and outcome, never who made it.
   */
  proposal?: HubProposal | null
  /** `count` is before + after. */
  photos: { count: number; before: number; after: number; lastAt: Date | null }
  /** `refundRef` is the Razorpay refund id (rfnd_…), or null for a refund done outside Razorpay. */
  refunds: Array<{ id: string; amount: string; recordedAt: Date; refundRef: string | null }>
  /**
   * Pickup & drop's handover steps (0037), null or absent on other types.
   * Never the codes: Home and Updates have no use for them.
   */
  pickup?: HubPickupSteps | null
}

/** A garage's suggested times on a booking, as Home and Updates read them. */
export interface HubProposal {
  id: string
  status: string
  slots: string[]
  expiresAt: Date
  createdAt: Date
  resolvedAt: Date | null
}

/** When each handover step of a pickup & drop job happened. */
export interface HubPickupSteps {
  pickedUpAt: Date | null
  atGarageAt: Date | null
  outForDeliveryAt: Date | null
  deliveredAt: Date | null
}

export type UpdateKind =
  | 'notice'
  | 'accepted'
  | 'reminder'
  | 'started'
  | 'completed'
  | 'photos'
  | 'bill_due'
  | 'bill_not_needed'
  | 'bill_paid'
  | 'receipt_ready'
  | 'declined'
  | 'cancelled'
  | 'refunded'
  | 'moved'
  | 'garage_paused'
  | 'complaint_acknowledged'
  | 'complaint_resolved'
  | 'complaint_closed'
  | 'picked_up'
  | 'at_garage'
  | 'out_for_delivery'
  | 'time_proposal'
  | 'extra_work_due'
  | 'extra_work_paid'
  | 'extra_work_declined'
  | 'extra_work_withdrawn'

export interface UpdateItem {
  /** Stable across reads: kind plus what it is about. */
  id: string
  kind: UpdateKind
  at: string
  unread: boolean
  title: string
  body: string | null
  bookingId: string | null
  vendorId: string | null
  vendorName: string | null
  /** The money the row is about, as a decimal string, when it is about money. */
  amount: string | null
  noticeId: string | null
  linkUrl: string | null
  linkLabel: string | null
  /** A row the customer can still act on is not repeated as the action card. */
  chargeId: string | null
}

/** "₹1,234", or "₹1,234.50" when there are paise: money is shown exactly. */
export function rupees(amount: string | number): string {
  const paise = Math.round(Number(amount) * 100)
  const whole = Math.floor(paise / 100).toLocaleString('en-IN')
  const rest = paise % 100
  return rest === 0 ? `₹${whole}` : `₹${whole}.${String(rest).padStart(2, '0')}`
}

/** 18:00 IST on the day before the slot: when a booking's reminder is dated. */
export function reminderTimeFor(scheduledAt: Date): Date {
  const dayBefore = addDays(istDateKey(scheduledAt), -1)
  return new Date(istMidnight(dayBefore).getTime() + 18 * HOUR_MS)
}

const PAID_STATUSES = new Set(['paid', 'collected'])
const REMINDED_STATUSES = new Set(['confirmed', 'in_progress', 'completed'])
const UPCOMING_STATUSES = new Set(['pending', 'confirmed'])

type Draft = Omit<UpdateItem, 'unread' | 'at'> & { at: Date }

function draft(
  partial: Partial<Draft> & Pick<Draft, 'id' | 'kind' | 'at' | 'title'>
): Draft {
  return {
    body: null,
    bookingId: null,
    vendorId: null,
    vendorName: null,
    amount: null,
    noticeId: null,
    linkUrl: null,
    linkLabel: null,
    chargeId: null,
    ...partial,
  }
}

/** The rows one booking contributes, undated ones left out. */
function bookingRows(booking: HubBooking, now: Date): Draft[] {
  const rows: Draft[] = []
  const about = {
    bookingId: booking.id,
    vendorId: booking.vendorId,
    vendorName: booking.vendorName,
  }
  const slot = istSlotShortLabel(booking.scheduledAt)

  if (booking.acceptedAt) {
    rows.push(draft({
      ...about,
      id: `accepted:${booking.id}`,
      kind: 'accepted',
      at: booking.acceptedAt,
      title: `${booking.vendorName} accepted your booking`,
      body: `${booking.serviceLabel} · ${slot}`,
    }))
  }

  if (REMINDED_STATUSES.has(booking.status)) {
    const reminder = reminderTimeFor(booking.scheduledAt)
    const since = booking.acceptedAt ?? booking.createdAt
    // A booking made after 18:00 the day before never had a reminder, and
    // one accepted on the morning of its slot would be told "tomorrow" on
    // the day itself. Garages often accept on the morning.
    if (
      booking.createdAt <= reminder &&
      reminder <= now &&
      istDateKey(since) !== istDateKey(booking.scheduledAt)
    ) {
      rows.push(draft({
        ...about,
        id: `reminder:${booking.id}`,
        kind: 'reminder',
        at: since > reminder ? since : reminder,
        title: 'Your booking is tomorrow',
        body: `${booking.vendorName} · ${istTimeLabel(booking.scheduledAt)}`,
      }))
    }
  }

  // Pickup & drop's handover steps, each dated when the garage marked it.
  // Delivered is the job's completion, said once by the completed row below.
  const pickup = booking.bookingType === 'pickup' ? booking.pickup : null
  if (pickup?.pickedUpAt) {
    rows.push(draft({
      ...about,
      id: `picked_up:${booking.id}`,
      kind: 'picked_up',
      at: pickup.pickedUpAt,
      title: `${booking.vendorName} collected your car`,
      body: booking.serviceLabel,
    }))
  }
  if (pickup?.atGarageAt) {
    rows.push(draft({
      ...about,
      id: `at_garage:${booking.id}`,
      kind: 'at_garage',
      at: pickup.atGarageAt,
      title: `Your car is at ${booking.vendorName}`,
      body: booking.serviceLabel,
    }))
  }
  if (pickup?.outForDeliveryAt) {
    rows.push(draft({
      ...about,
      id: `out_for_delivery:${booking.id}`,
      kind: 'out_for_delivery',
      at: pickup.outForDeliveryAt,
      title: 'Your car is on its way back',
      body: booking.vendorName,
    }))
  }

  if (booking.startedAt) {
    rows.push(draft({
      ...about,
      id: `started:${booking.id}`,
      kind: 'started',
      at: booking.startedAt,
      title: `${booking.vendorName} started work on your car`,
      body: booking.serviceLabel,
    }))
  }

  if (booking.status === 'completed' && booking.completedAt) {
    rows.push(draft({
      ...about,
      id: `completed:${booking.id}`,
      kind: 'completed',
      at: booking.completedAt,
      // A pickup & drop job completes when the car is handed back.
      title: booking.bookingType === 'pickup' ? 'Your car is back' : 'Your car is done',
      body: `${booking.vendorName} · ${booking.serviceLabel}`,
    }))
  }

  if (booking.photos.count > 0 && booking.photos.lastAt && customerSeesPhotos(booking.status)) {
    const count = booking.photos.count
    rows.push(draft({
      ...about,
      id: `photos:${booking.id}`,
      kind: 'photos',
      at: booking.photos.lastAt,
      title: `Photos of your car from ${booking.vendorName}`,
      body: count === 1 ? '1 photo' : `${count} photos`,
    }))
  }

  // The garage's suggested times (0041). Dated when it suggested them; an
  // answered one stays as history, the outcome said by the rows below (the
  // moved booking's own rows, or the cancellation).
  const proposal = booking.proposal
  if (proposal) {
    const live = isProposalLive(proposal, booking.status, now.getTime())
    const options = live ? liveOptions(proposal.slots, booking.bookingType, now.getTime()) : proposal.slots
    rows.push(draft({
      ...about,
      id: `proposal:${proposal.id}`,
      kind: 'time_proposal',
      at: proposal.createdAt,
      title: live
        ? `${booking.vendorName} can't do ${istTimeLabel(booking.scheduledAt)} — pick another time`
        : `${booking.vendorName} suggested other times`,
      body: options.map((option) => istSlotShortLabel(new Date(option))).join(' · ') || null,
    }))
  }

  for (const charge of booking.charges) {
    if (charge.kind === 'extra_work') {
      rows.push(...extraWorkRows(booking, charge, about))
      continue
    }
    if (charge.status === 'due') {
      rows.push(draft({
        ...about,
        id: `bill:${charge.id}`,
        kind: 'bill_due',
        at: charge.createdAt,
        title: `Bill from ${booking.vendorName}: ${rupees(charge.amountDue)} to pay`,
        body: booking.serviceLabel,
        amount: charge.amountDue,
        chargeId: charge.id,
      }))
    } else if (charge.status === 'not_needed') {
      rows.push(draft({
        ...about,
        id: `bill:${charge.id}`,
        kind: 'bill_not_needed',
        at: charge.createdAt,
        title: `Final bill from ${booking.vendorName}`,
        body: 'Nothing more to pay',
        chargeId: charge.id,
      }))
    } else if (charge.status === 'paid' && charge.paidAt) {
      rows.push(draft({
        ...about,
        id: `bill_paid:${charge.id}`,
        kind: 'bill_paid',
        at: charge.paidAt,
        title: `Bill paid: ${rupees(charge.amountDue)}`,
        body: booking.vendorName,
        amount: charge.amountDue,
        chargeId: charge.id,
      }))
    }
  }

  if (
    booking.payment?.paidAt &&
    receiptAvailability({ status: booking.status, moved: booking.moved, payment: booking.payment }) ===
      'available'
  ) {
    rows.push(draft({
      ...about,
      id: `receipt:${booking.id}`,
      kind: 'receipt_ready',
      at: booking.payment.paidAt,
      title: 'Receipt ready',
      body: `${booking.vendorName} · ${booking.serviceLabel}`,
    }))
  }

  const cancelledForCustomer =
    booking.status === 'cancelled' &&
    booking.cancelledAt &&
    !booking.moved &&
    (booking.cancelledBy === 'vendor' ||
      (booking.cancelledBy === 'admin' && booking.cancelledOnBehalfOf !== 'customer' && booking.noShow !== 'customer'))
  if (cancelledForCustomer) {
    // Said only when lib/refunds.ts says money is owed back, and not yet
    // given back in full.
    const { owed } = bookingRefundTotals({
      status: booking.status,
      noShow: booking.noShow,
      moved: booking.moved,
      payment: booking.payment,
      charges: booking.charges,
    })
    const refundLine = Number(owed) > 0 ? `Refund due: ${rupees(owed)}` : null
    const declined = booking.cancelledBy === 'vendor' && !booking.acceptedAt
    // Cancelled because none of the garage's suggested times was picked
    // (0041): said as what happened, not as a plain decline.
    const proposalOutcome =
      booking.cancelledBy === 'vendor' && booking.proposal
        ? booking.proposal.status === 'declined'
          ? `None of ${booking.vendorName}'s times worked, so your booking was cancelled`
          : booking.proposal.status === 'expired'
            ? `No time was picked, so your booking at ${booking.vendorName} was cancelled`
            : null
        : null
    // The garage let its time to answer run out and the booking was
    // cancelled for it (0042): said as what happened, with the refund.
    const notAccepted =
      booking.cancelledBy === 'vendor' && booking.responseMissedAt
        ? `${booking.vendorName} didn't accept in time`
        : null
    rows.push(draft({
      ...about,
      id: `cancelled:${booking.id}`,
      kind: declined ? 'declined' : 'cancelled',
      at: booking.cancelledAt!,
      title:
        notAccepted ??
        proposalOutcome ??
        (declined
          ? `${booking.vendorName} couldn't take your booking`
          : `Your booking at ${booking.vendorName} was cancelled`),
      body: refundLine ?? slot,
      amount: refundLine ? owed : null,
    }))
  }

  for (const refund of booking.refunds) {
    // Only a Razorpay refund goes back through the bank to the card or UPI
    // it came from; one ops paid outside Razorpay has no bank delay to speak
    // of, so it says what the receipt says.
    const viaRazorpay = refund.refundRef !== null && isRazorpayRefundId(refund.refundRef)
    rows.push(draft({
      ...about,
      id: `refunded:${refund.id}`,
      kind: 'refunded',
      at: refund.recordedAt,
      title: `${rupees(refund.amount)} refunded`,
      body: viaRazorpay
        ? `${booking.vendorName}. It can take ${BANK_DAYS} to show in your account.`
        : `${booking.vendorName}. ${REFUND_METHODS.direct}.`,
      amount: refund.amount,
    }))
  }

  // The part paid with Detlio credit, back in the customer's credit (0049):
  // no bank in between, so no bank days to mention.
  const creditBack = booking.payment?.creditReturnedAt ? Number(booking.payment.creditAmount ?? 0) : 0
  if (creditBack > 0) {
    rows.push(draft({
      ...about,
      id: `credit-returned:${booking.id}`,
      kind: 'refunded',
      at: booking.payment!.creditReturnedAt!,
      title: `${rupees(booking.payment!.creditAmount!)} back in your Detlio credit`,
      body: `${booking.vendorName}. Ready to use on your next booking.`,
      amount: (Math.round(creditBack * 100) / 100).toFixed(2),
    }))
  }

  if (booking.rescheduledFromId) {
    rows.push(draft({
      ...about,
      id: `moved:${booking.id}`,
      kind: 'moved',
      at: booking.createdAt,
      title: `Booking moved to ${slot}`,
      body: booking.vendorName,
    }))
  }

  return rows
}

/**
 * The rows one extra-work request makes (0041): asked (while it waits for
 * the customer on a booking still on), paid, declined or withdrawn. Each
 * dated when it happened; a request closed with its booking says nothing of
 * its own, the cancellation row says it.
 */
function extraWorkRows(
  booking: HubBooking,
  charge: HubBooking['charges'][number],
  about: { bookingId: string; vendorId: string; vendorName: string }
): Draft[] {
  const what = charge.description ?? 'Extra work'
  if (charge.status === 'due') {
    if (!extraWorkPayable(booking.status)) return []
    return [draft({
      ...about,
      id: `extra_work:${charge.id}`,
      kind: 'extra_work_due',
      at: charge.createdAt,
      title: `${booking.vendorName} asks for extra work: ${rupees(charge.amountDue)}`,
      body: what,
      amount: charge.amountDue,
      chargeId: charge.id,
    })]
  }
  if (charge.status === 'paid' && charge.paidAt) {
    return [draft({
      ...about,
      id: `extra_work_paid:${charge.id}`,
      kind: 'extra_work_paid',
      at: charge.paidAt,
      title: `Extra work approved and paid: ${rupees(charge.amountDue)}`,
      body: what,
      amount: charge.amountDue,
      chargeId: charge.id,
    })]
  }
  if (charge.status === 'cancelled' && charge.cancelledAt) {
    if (charge.cancelReason === 'declined') {
      return [draft({
        ...about,
        id: `extra_work_declined:${charge.id}`,
        kind: 'extra_work_declined',
        at: charge.cancelledAt,
        title: `You declined extra work from ${booking.vendorName}`,
        body: what,
        chargeId: charge.id,
      })]
    }
    if (charge.cancelReason === 'withdrawn') {
      return [draft({
        ...about,
        id: `extra_work_withdrawn:${charge.id}`,
        kind: 'extra_work_withdrawn',
        at: charge.cancelledAt,
        title: `${booking.vendorName} withdrew its extra-work request`,
        body: what,
        chargeId: charge.id,
      })]
    }
  }
  return []
}

/**
 * "Next Level isn't taking new bookings", once per paused garage the customer
 * has booked. With a booking still to come there, it says that booking
 * stands: a pause never touches existing bookings.
 */
function pausedRows(bookings: HubBooking[], pausedGarages: PausedGarage[], now: Date): Draft[] {
  const garages = new Map<string, PausedGarage>()
  for (const booking of bookings) {
    if (!booking.vendorPausedAt) continue
    garages.set(booking.vendorId, {
      vendorId: booking.vendorId,
      vendorName: booking.vendorName,
      pausedAt: booking.vendorPausedAt,
    })
  }
  for (const garage of pausedGarages) {
    if (!garages.has(garage.vendorId)) garages.set(garage.vendorId, garage)
  }

  return [...garages.values()].map((garage) => {
    const upcoming = bookings
      .filter((b) => b.vendorId === garage.vendorId && UPCOMING_STATUSES.has(b.status) && b.scheduledAt > now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0]
    return draft({
      id: `paused:${garage.vendorId}`,
      kind: 'garage_paused',
      at: garage.pausedAt,
      title: `${garage.vendorName} isn't taking new bookings`,
      body: upcoming ? `Your ${istWeekdayLabel(upcoming.scheduledAt)} booking stands.` : null,
      bookingId: upcoming?.id ?? null,
      vendorId: garage.vendorId,
      vendorName: garage.vendorName,
    })
  })
}

/** A paused garage the customer has used, known from outside the booking window. */
export interface PausedGarage {
  vendorId: string
  vendorName: string
  pausedAt: Date
}

/**
 * One of the customer's complaints, as Updates and Home read it: only the
 * times the team moved it, never the team's note or who handled it.
 */
export interface HubComplaint {
  id: string
  /** The sequence number; printed C-000123 (formatComplaintNumber). */
  number: number
  status: ComplaintStatus
  acknowledgedAt: Date | null
  resolvedAt: Date | null
  closedAt: Date | null
  /** Whether the team wrote the customer an answer (resolution_note). */
  hasAnswer: boolean
}

/** Where a complaint row goes: Profile's My complaints, which shows the answer. */
export const MY_COMPLAINTS_PATH = '/profile#my-complaints'

/** The rows the team's answers to the customer's complaints make. */
function complaintRows(complaints: HubComplaint[]): Draft[] {
  const rows: Draft[] = []
  for (const complaint of complaints) {
    const number = formatComplaintNumber(complaint.number)
    const about = { linkUrl: MY_COMPLAINTS_PATH }
    const answeredAt = complaint.resolvedAt ?? complaint.closedAt
    // Resolving or closing an open complaint stamps its acknowledgement at
    // that same moment: one step, so one row.
    const separateAck =
      complaint.acknowledgedAt !== null &&
      (answeredAt === null || complaint.acknowledgedAt.getTime() < answeredAt.getTime())
    if (separateAck) {
      rows.push(draft({
        ...about,
        id: `complaint_ack:${complaint.id}`,
        kind: 'complaint_acknowledged',
        at: complaint.acknowledgedAt!,
        title: `We're looking into complaint ${number}`,
      }))
    }
    if (complaint.resolvedAt) {
      rows.push(draft({
        ...about,
        id: `complaint_resolved:${complaint.id}`,
        kind: 'complaint_resolved',
        at: complaint.resolvedAt,
        title: `Complaint ${number} resolved — see our answer`,
      }))
    }
    if (complaint.status === 'closed' && complaint.closedAt) {
      // After a resolution its answer has a row already; closing one without
      // resolving it may still carry a note ("A duplicate of C-000122").
      const newNote = complaint.hasAnswer && !complaint.resolvedAt
      rows.push(draft({
        ...about,
        id: `complaint_closed:${complaint.id}`,
        kind: 'complaint_closed',
        at: complaint.closedAt,
        title: newNote ? `Complaint ${number} closed — see our note` : `Complaint ${number} closed`,
      }))
    }
  }
  return rows
}

/** Booking-window notices about the customer's own bookings, one row each. */
function noticeRows(bookings: HubBooking[], notices: NoticeRow[]): Draft[] {
  const rows: Draft[] = []
  for (const notice of notices) {
    const booking = bookings
      .filter((b) => noticeMatchesBooking(notice, b))
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0]
    if (!booking) continue
    rows.push(draft({
      id: `notice:${notice.id}`,
      kind: 'notice',
      // Not before the booking existed: a notice posted Monday about a
      // booking made Tuesday is news on Tuesday, and unread if the customer
      // last looked in between.
      at: booking.createdAt > notice.startsAt ? booking.createdAt : notice.startsAt,
      title: notice.title,
      body: notice.body,
      bookingId: booking.id,
      vendorId: booking.vendorId,
      vendorName: booking.vendorName,
      noticeId: notice.id,
      linkUrl: notice.linkUrl,
      linkLabel: notice.linkLabel,
    }))
  }
  return rows
}

/**
 * The feed. `notices` are the live, undismissed booking-window notices; the
 * 'all' notice is not a row here, it is pinned above the feed.
 */
export function deriveUpdates(input: {
  bookings: HubBooking[]
  notices: NoticeRow[]
  /**
   * Paused garages from the customer's Book again tiles, whose last job may
   * be older than the window: "isn't taking new bookings", plainly.
   */
  pausedGarages?: PausedGarage[]
  /** The customer's complaints the team has moved on (acknowledged, resolved or closed). */
  complaints?: HubComplaint[]
  /** updates_seen_at, or the account's creation when never opened. */
  seenAt: Date
  now: Date
}): UpdateItem[] {
  const { now } = input
  const since = new Date(now.getTime() - UPDATES_WINDOW_DAYS * DAY_MS)
  const inWindow = (row: Draft) => row.at >= since && row.at <= now

  const finish = (row: Draft): UpdateItem => ({
    ...row,
    at: row.at.toISOString(),
    unread: row.at > input.seenAt,
  })
  const newestFirst = (a: Draft, b: Draft) =>
    b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id)

  // Live notices only (the caller passes nothing else), so no 30-day cut: a
  // season-long notice must not drop out of Updates while its line still
  // shows on the Next booking tile.
  const pinned = noticeRows(input.bookings, input.notices).filter((row) => row.at <= now).sort(newestFirst)
  const rest = [
    ...input.bookings.flatMap((booking) => bookingRows(booking, now)),
    ...pausedRows(input.bookings, input.pausedGarages ?? [], now),
    ...complaintRows(input.complaints ?? []),
  ]
    .filter(inWindow)
    .sort(newestFirst)

  return [...pinned, ...rest].slice(0, MAX_UPDATES).map(finish)
}

/** "Hey Karthik": the first word of the name that is a name, not an initial. */
export function firstNameOf(name: string): string {
  const full = name.trim()
  const word = full.split(/\s+/).find((part) => part.length > 1 && !part.endsWith('.'))
  return word ?? full
}

/** Whether any of it is new since the customer last looked. */
export function hasUnread(items: Array<Pick<UpdateItem, 'unread'>>, pinnedNotice: { startsAt: Date } | null, seenAt: Date): boolean {
  return items.some((item) => item.unread) || (pinnedNotice !== null && pinnedNotice.startsAt > seenAt)
}

/** True when a booking's payment went through (paid, or cash collected). */
export function isPaid(payment: { status: string } | null | undefined): boolean {
  return !!payment && PAID_STATUSES.has(payment.status)
}
