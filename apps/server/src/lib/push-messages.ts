/**
 * The words of every browser notification (0044), for garages and for
 * customers. Pure, with the clock passed in, so each one is unit-tested,
 * including that none carries personal data.
 *
 * What a notification may say: the garage's business name, the service,
 * the booking type, the time, an amount, a complaint number. Never the
 * customer's name, phone, address or car, a pickup or delivery code, or
 * anything a person typed (a note, a reason, an extra-work description):
 * a notification shows on a lock screen and passes through the push
 * service. Built only from `PushBooking`, which has no field for any of it.
 *
 * Where a line exists in the customer's Updates feed (lib/home-updates.ts),
 * the notification says the same thing, so the app and the phone agree.
 */
import { bookingTypeLabel, isBookingType } from './booking-types.js'
import { formatComplaintNumber } from './complaints.js'
import { BANK_DAYS, CREDIT_PATH, MY_COMPLAINTS_PATH, REPORT_REWARD_BODY, reportRewardTitle, rupees } from './home-updates.js'
import { serviceLabelOf } from './home-cards.js'
import { istDateKey, istSlotShortLabel, istTimeLabel } from './ist.js'
import { DEFAULT_TTL_SECONDS, type PushMessage } from './push.js'
import { carPagePath, REMINDER_TITLES, reminderReason, type ServiceReminderKind } from './service-reminders.js'
import { slotAlertPath, slotOpenedWords } from './slot-alerts.js'
import { voucherIssuedWords, type NudgeKind, type NudgeWords, type VoucherKind } from './rewards.js'

const MINUTE_MS = 60 * 1000

/**
 * What a notification reads from a booking, and nothing else. The booking
 * rows the services already load (findBookingById) fit it as they are; the
 * customer's details on them are never read here.
 */
export interface PushBooking {
  id: string
  scheduledAt: Date
  bookingType: string
  status?: string
  respondBy?: Date | null
  vendor?: { businessName: string } | null
  items?: Array<{ name: string }> | null
  service?: { name: string } | null
}

function garageName(booking: PushBooking): string {
  return booking.vendor?.businessName ?? 'Your garage'
}

/** "Exterior Wash", "Exterior Wash + 1 more": as Home and Updates say it. */
export function pushServiceLabel(booking: PushBooking): string {
  const names = booking.items?.length ? booking.items.map((item) => item.name) : booking.service ? [booking.service.name] : []
  return serviceLabelOf(names)
}

// ─── Where a tap goes ────────────────────────────────────────────────────────

/** The customer's booking page (detlio.com). */
export function customerBookingPath(bookingId: string): string {
  return `/bookings/${bookingId}`
}

export type GarageJobsTab = 'incoming' | 'upcoming' | 'completed' | 'cancelled'

/** The job on the garage portal's Bookings page (vendor.detlio.com). */
export function garageJobPath(bookingId: string, tab: GarageJobsTab): string {
  return `/bookings?tab=${tab}#job-${bookingId}`
}

function message(
  partial: Pick<PushMessage, 'title' | 'body' | 'url' | 'tag'> & Partial<PushMessage>
): PushMessage {
  return {
    category: 'booking_update',
    ttlSeconds: DEFAULT_TTL_SECONDS,
    urgency: 'normal',
    ...partial,
  }
}

const bookingTag = (bookingId: string) => `booking:${bookingId}`

// ─── Garage ──────────────────────────────────────────────────────────────────

/**
 * "accept within 30 min", or "accept by 9:30 AM" when the clock is further
 * off than the window (the garage is shut, or the window spans a closing),
 * like the job card's countdown (packages/core/src/response-deadline.ts).
 * Null without a deadline, or once it has passed.
 */
export function acceptWithin(respondBy: Date | null | undefined, windowMins: number, now: Date): string | null {
  if (!respondBy) return null
  const left = respondBy.getTime() - now.getTime()
  if (left <= 0) return null
  if (left > windowMins * MINUTE_MS) {
    const sameDay = istDateKey(respondBy) === istDateKey(now)
    return `accept by ${sameDay ? istTimeLabel(respondBy) : istSlotShortLabel(respondBy)}`
  }
  return `accept within ${Math.max(1, Math.ceil(left / MINUTE_MS))} min`
}

/**
 * A new paid booking: "New booking · Exterior Wash", "Sat 17 Oct, 10 AM ·
 * At garage — accept within 30 min". Urgent: the clock is running.
 */
export function garageNewBooking(booking: PushBooking, now: Date, windowMins: number): PushMessage {
  const when = `${istSlotShortLabel(booking.scheduledAt)} · ${bookingTypeLabel(booking.bookingType)}`
  const within = acceptWithin(booking.respondBy, windowMins, now)
  return message({
    title: `New booking · ${pushServiceLabel(booking)}`,
    body: within ? `${when} — ${within}` : `${when} — open Detlio to accept`,
    url: garageJobPath(booking.id, 'incoming'),
    tag: bookingTag(booking.id),
    urgency: 'high',
    // Not worth delivering once the slot has started.
    ttlSeconds: ttlUntil(booking.scheduledAt, now),
  })
}

/**
 * The cron's nudge, 10 minutes before the garage's time to answer runs out
 * (only while AUTO_CANCEL_UNANSWERED is on, when running out cancels it).
 */
export function garageRespondSoon(booking: PushBooking, now: Date): PushMessage {
  const left = booking.respondBy ? Math.max(1, Math.ceil((booking.respondBy.getTime() - now.getTime()) / MINUTE_MS)) : 10
  return message({
    title: `Accept within ${left} min or it's cancelled`,
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}`,
    url: garageJobPath(booking.id, 'incoming'),
    tag: bookingTag(booking.id),
    urgency: 'high',
    ttlSeconds: Math.max(60, Math.ceil(left * 60)),
  })
}

/** The customer took one of the garage's suggested times: the booking moved there, accepted. */
export function garageProposalChosen(movedBooking: PushBooking): PushMessage {
  return message({
    title: `Customer picked ${istSlotShortLabel(movedBooking.scheduledAt)}`,
    body: `${pushServiceLabel(movedBooking)} · booked and accepted`,
    url: garageJobPath(movedBooking.id, 'upcoming'),
    tag: bookingTag(movedBooking.id),
  })
}

/** "None of these work": the booking is cancelled, refunded in full. */
export function garageProposalDeclined(booking: PushBooking): PushMessage {
  return message({
    title: "None of your times worked — booking cancelled",
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}`,
    url: garageJobPath(booking.id, 'cancelled'),
    tag: bookingTag(booking.id),
  })
}

/** The customer approved extra work by paying it. */
export function garageExtraWorkPaid(booking: PushBooking, amount: string): PushMessage {
  return message({
    title: `Extra work approved and paid: ${rupees(amount)}`,
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}`,
    url: garageJobPath(booking.id, 'upcoming'),
    tag: `extra_work:${booking.id}`,
  })
}

export function garageExtraWorkDeclined(booking: PushBooking, amount: string): PushMessage {
  return message({
    title: `Customer declined extra work (${rupees(amount)})`,
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}`,
    url: garageJobPath(booking.id, 'upcoming'),
    tag: `extra_work:${booking.id}`,
  })
}

export function garageCustomerCancelled(booking: PushBooking): PushMessage {
  return message({
    title: 'Booking cancelled by the customer',
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}`,
    url: garageJobPath(booking.id, 'cancelled'),
    tag: bookingTag(booking.id),
  })
}

/**
 * The customer moved their booking. Back to pending (a fresh time to
 * answer), it says so; already accepted, it just says the new time.
 */
export function garageRescheduled(
  movedBooking: PushBooking,
  previousScheduledAt: Date,
  now: Date,
  windowMins: number
): PushMessage {
  const pending = movedBooking.status === 'pending'
  const within = pending ? acceptWithin(movedBooking.respondBy, windowMins, now) : null
  return message({
    title: `Booking moved to ${istSlotShortLabel(movedBooking.scheduledAt)}`,
    body:
      `${pushServiceLabel(movedBooking)} · was ${istSlotShortLabel(previousScheduledAt)}` +
      (within ? ` — ${within}` : ''),
    url: garageJobPath(movedBooking.id, pending ? 'incoming' : 'upcoming'),
    tag: bookingTag(movedBooking.id),
    urgency: pending ? 'high' : 'normal',
  })
}

/** The cron cancelled it because nobody accepted in time (0042). */
export function garageNotAcceptedInTime(booking: PushBooking): PushMessage {
  return message({
    title: 'Booking cancelled — not accepted in time',
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}. The customer is refunded in full.`,
    url: garageJobPath(booking.id, 'cancelled'),
    tag: bookingTag(booking.id),
  })
}

// ─── Customer ────────────────────────────────────────────────────────────────

/** Same words as Updates' "accepted" row. */
export function customerAccepted(booking: PushBooking): PushMessage {
  return message({
    title: `${garageName(booking)} accepted your booking`,
    body: `${pushServiceLabel(booking)} · ${istSlotShortLabel(booking.scheduledAt)}`,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
  })
}

/** Same title as Updates' "declined" row; `refundDue` when the payment is owed back. */
export function customerDeclined(booking: PushBooking, refundDue: string | null): PushMessage {
  const slot = istSlotShortLabel(booking.scheduledAt)
  return message({
    title: `${garageName(booking)} couldn't take your booking`,
    body: refundDue ? `${slot}. Refund due: ${rupees(refundDue)}` : slot,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
  })
}

/**
 * The garage cancelled a booking it had accepted (0066). Never the reason it
 * typed: that is read in the app, if anywhere.
 */
export function customerGarageCancelled(booking: PushBooking, refundDue: string | null): PushMessage {
  const slot = istSlotShortLabel(booking.scheduledAt)
  return message({
    title: `${garageName(booking)} cancelled your booking`,
    body: refundDue ? `${slot}. Refund due: ${rupees(refundDue)}` : slot,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
  })
}

/** The garage suggested other times (0041): Updates' live "pick another time" row. */
export function customerTimesSuggested(booking: PushBooking, options: Date[]): PushMessage {
  return message({
    title: `${garageName(booking)} can't do ${istTimeLabel(booking.scheduledAt)} — pick another time`,
    body: options.map((option) => istSlotShortLabel(option)).join(' · ') || 'Open Detlio to see the times',
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
  })
}

/**
 * The garage asks for extra work (0041). The amount, never the garage's
 * description of the work: that is typed text, read in the app.
 */
export function customerExtraWorkRequested(booking: PushBooking, amount: string): PushMessage {
  return message({
    title: `${garageName(booking)} asks for extra work: ${rupees(amount)}`,
    body: `${pushServiceLabel(booking)} · approve or decline in Detlio`,
    url: customerBookingPath(booking.id),
    tag: `extra_work:${booking.id}`,
  })
}

export type PickupStepPush = 'picked_up' | 'out_for_delivery'

/** Pickup & drop's handover steps, as Updates words them. Never the codes. */
export function customerPickupStep(booking: PushBooking, step: PickupStepPush): PushMessage {
  return step === 'picked_up'
    ? message({
        title: `${garageName(booking)} collected your car`,
        body: pushServiceLabel(booking),
        url: customerBookingPath(booking.id),
        tag: bookingTag(booking.id),
      })
    : message({
        title: 'Your car is on its way back',
        body: garageName(booking),
        url: customerBookingPath(booking.id),
        tag: bookingTag(booking.id),
      })
}

/**
 * The work started and the garage's before photos of the car are on the
 * booking page (0045): sent with Mark in progress when the garage took any,
 * since that is when the customer can see them (customerSeesPhotos).
 */
export function customerBeforePhotos(booking: PushBooking): PushMessage {
  return message({
    title: "Your car's before photos are in",
    body: `${garageName(booking)} has started work. See them on your booking.`,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
  })
}

/**
 * The job is done (Mark completed, or Delivered for pickup & drop): Updates'
 * "completed" row, and the ask Home makes ("Rate your wash"). With the
 * garage's after photos on the booking (0045) the title points at them: one
 * notification, not two at the same moment.
 */
export function customerCompleted(
  booking: PushBooking,
  options: { afterPhotos?: boolean } = {}
): PushMessage {
  const done = booking.bookingType === 'pickup' ? 'Your car is back' : 'Your car is done'
  return message({
    title: options.afterPhotos ? `${done} — see the after photos` : done,
    body: `How was it? Rate your wash at ${garageName(booking)}`,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
    ttlSeconds: 24 * 60 * 60,
  })
}

/**
 * A refund went out. `started`: sent through Razorpay from the app, on its
 * way (the booking page's "Refund of ₹X started"); otherwise ops recorded
 * one done another way (Updates' "₹X refunded").
 */
export function customerRefund(booking: PushBooking, amount: string, started: boolean): PushMessage {
  return message({
    title: started ? `Refund of ${rupees(amount)} started` : `${rupees(amount)} refunded`,
    body: started
      ? `${garageName(booking)}. It reaches your account in ${BANK_DAYS}.`
      : `${garageName(booking)}. It can take ${BANK_DAYS} to show in your account.`,
    url: customerBookingPath(booking.id),
    tag: `refund:${booking.id}`,
    ttlSeconds: 24 * 60 * 60,
  })
}

/** The team acknowledged or resolved a complaint: Updates' complaint rows. */
export function customerComplaint(complaint: { id: string; number: number }, step: 'acknowledged' | 'resolved'): PushMessage {
  const number = formatComplaintNumber(complaint.number)
  return message({
    title:
      step === 'acknowledged'
        ? `We're looking into complaint ${number}`
        : `Complaint ${number} resolved — see our answer`,
    body: step === 'acknowledged' ? 'Open My complaints to see where it stands.' : 'Open My complaints to read it.',
    url: MY_COMPLAINTS_PATH,
    tag: `complaint:${complaint.id}`,
    ttlSeconds: 24 * 60 * 60,
  })
}

/**
 * A bypass report Detlio confirmed earned the customer Detlio credit (0052):
 * the amount only, never the garage (a lock screen is not the place to name
 * whom they reported). Updates' row says the same.
 */
export function customerReportReward(report: { id: string }, amount: string | number): PushMessage {
  return message({
    title: reportRewardTitle(amount),
    body: REPORT_REWARD_BODY,
    url: CREDIT_PATH,
    tag: `report-reward:${report.id}`,
    ttlSeconds: 24 * 60 * 60,
  })
}

/** The garage let its time to answer run out (0042); the refund is on its way. */
export function customerNotAcceptedInTime(
  booking: PushBooking,
  options: { paidWithCreditOnly?: boolean; nothingPaid?: boolean } = {}
): PushMessage {
  return message({
    title: `${garageName(booking)} didn't accept in time`,
    // Paid wholly with Detlio credit (0049): it goes back as credit, with
    // no bank in between. A free wash that covered it all (0062): nothing
    // was paid, and the free wash can be used again.
    body: options.nothingPaid
      ? 'Nothing was charged, and your free wash is back while it lasts. Book another garage in Detlio.'
      : options.paidWithCreditOnly
        ? 'Your Detlio credit is going back to your account. Book another garage in Detlio.'
        : `Your full refund is on its way (${BANK_DAYS}). Book another garage in Detlio.`,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
    ttlSeconds: 24 * 60 * 60,
  })
}

/**
 * "Notify me if a slot opens" (0047): a time freed up at a garage on the day
 * the customer was waiting for. Updates' row, word for word; opens checkout
 * with that day picked. A booking update (the Booking updates switch), not
 * held for them, and no use once the time has started.
 */
export function customerSlotOpened(
  alert: { id: string; vendorId: string; date: string; bookingType: string; serviceIds: string[] },
  garageName: string,
  slotAt: Date,
  now: Date
): PushMessage {
  const words = slotOpenedWords(garageName, slotAt)
  return message({
    ...words,
    url: slotAlertPath({ ...alert, bookingType: isBookingType(alert.bookingType) ? alert.bookingType : 'dropin' }),
    tag: `slot_alert:${alert.id}`,
    urgency: 'high',
    ttlSeconds: ttlUntil(slotAt, now),
  })
}

// ─── Customer reminders ──────────────────────────────────────────────────────

/** The evening before: Updates' reminder row, word for word. */
export function customerDayBefore(booking: PushBooking, now: Date): PushMessage {
  return message({
    title: 'Your booking is tomorrow',
    body: `${garageName(booking)} · ${istTimeLabel(booking.scheduledAt)}`,
    url: customerBookingPath(booking.id),
    tag: `reminder:${booking.id}`,
    category: 'reminder',
    ttlSeconds: ttlUntil(booking.scheduledAt, now),
  })
}

/** About an hour before, in the booking type's terms. Push only (not in Updates). */
export function customerHourBefore(booking: PushBooking, now: Date): PushMessage {
  const time = istTimeLabel(booking.scheduledAt)
  const garage = garageName(booking)
  const body =
    booking.bookingType === 'pickup'
      ? `${garage} collects your car at ${time}`
      : booking.bookingType === 'doorstep'
        ? `${garage} comes to you at ${time}`
        : `${pushServiceLabel(booking)} at ${garage}, ${time}`
  return message({
    title: 'Your booking is in about an hour',
    body,
    url: customerBookingPath(booking.id),
    tag: `reminder:${booking.id}`,
    category: 'reminder',
    urgency: 'high',
    ttlSeconds: ttlUntil(booking.scheduledAt, now),
  })
}

/**
 * A coating or detailing follow-up is due today (0046,
 * lib/service-reminders.ts): the reminder's name, and how long since the job
 * at which garage. Never the car: its make or plate is the customer's own.
 */
export function customerServiceReminder(reminder: {
  id: string
  vehicleId: string
  kind: ServiceReminderKind
  vendorName: string | null
}): PushMessage {
  return message({
    title: REMINDER_TITLES[reminder.kind],
    body: `${reminderReason(reminder.kind, reminder.vendorName)}. Book it in Detlio.`,
    url: carPagePath(reminder.vehicleId),
    tag: `service_reminder:${reminder.id}`,
    category: 'reminder',
    ttlSeconds: 12 * 60 * 60,
  })
}

// ─── Free redo claims (Detlio Guarantee, 0051) ──────────────────────────────
//
// "Free redo", never the word the copy rules ban (lib/copy-rules.ts). Only
// the garage, the service and times: never what the customer wrote, the
// garage's note or Detlio's reason, all typed text.

/** The garage portal's claims page, at one claim. */
export function garageClaimPath(claimId: string): string {
  return `/guarantee#claim-${claimId}`
}

/** A claim for the garage to answer, with its deadline. */
export function garageClaimToAnswer(booking: PushBooking, claimId: string, respondBy: Date): PushMessage {
  return message({
    title: `Redo claim to answer · ${pushServiceLabel(booking)}`,
    body: `Answer by ${istSlotShortLabel(respondBy)}. No answer means a free redo.`,
    url: garageClaimPath(claimId),
    tag: `redo_claim:${claimId}`,
    urgency: 'high',
    ttlSeconds: 12 * 60 * 60,
  })
}

/** Approved without the garage answering: no photos on the job, its silence, or Detlio. */
export function garageClaimApproved(
  booking: PushBooking,
  claimId: string,
  why: 'no_photos' | 'timed_out' | 'detlio'
): PushMessage {
  const body = {
    no_photos: 'The job had no before and after photos. The customer picks a time for the redo.',
    timed_out: 'There was no answer in time. The customer picks a time for the redo.',
    detlio: 'Detlio approved it. The customer picks a time for the redo.',
  }[why]
  return message({
    title: `Free redo approved · ${pushServiceLabel(booking)}`,
    body,
    url: garageClaimPath(claimId),
    tag: `redo_claim:${claimId}`,
    ttlSeconds: 24 * 60 * 60,
  })
}

/** Detlio's other decisions, as the garage hears them. */
export function garageClaimDecided(booking: PushBooking, claimId: string, decision: 'refund' | 'reject'): PushMessage {
  return message({
    title:
      decision === 'refund'
        ? `Refund approved instead of a redo · ${pushServiceLabel(booking)}`
        : `Redo claim not approved · ${pushServiceLabel(booking)}`,
    body:
      decision === 'refund'
        ? 'Nothing is paid out on this job. Open Detlio to see the claim.'
        : 'Detlio looked at both sides. Nothing changes for this job.',
    url: garageClaimPath(claimId),
    tag: `redo_claim:${claimId}`,
    ttlSeconds: 24 * 60 * 60,
  })
}

/** The customer booked the free redo: a job like any other, at ₹0. */
export function garageRedoBooked(redo: PushBooking, now: Date): PushMessage {
  return message({
    title: `Free redo booked · ${pushServiceLabel(redo)}`,
    body: `${istSlotShortLabel(redo.scheduledAt)} · ${bookingTypeLabel(redo.bookingType)} · ₹0, already accepted`,
    url: garageJobPath(redo.id, 'upcoming'),
    tag: bookingTag(redo.id),
    ttlSeconds: ttlUntil(redo.scheduledAt, now),
  })
}

/** The customer's claim moved: approved for a redo, a refund instead, or not approved. */
export function customerClaimDecided(
  booking: PushBooking,
  outcome: 'redo' | 'refund' | 'reject'
): PushMessage {
  const words = {
    redo: { title: 'Free redo approved', body: `Pick a time at ${garageName(booking)}.` },
    refund: { title: 'Refund approved instead of a redo', body: `${garageName(booking)} · ${pushServiceLabel(booking)}` },
    reject: { title: 'Redo claim not approved', body: 'See why on your booking.' },
  }[outcome]
  return message({
    ...words,
    url: customerBookingPath(booking.id),
    tag: `redo_claim:${booking.id}`,
    ttlSeconds: 24 * 60 * 60,
  })
}

// ─── Detlio Rewards (0050) ───────────────────────────────────────────────────

/**
 * A reward voucher is ready (a full Shine Card, an invite that paid off, or
 * one from the team): the amount only. Category 'reminder', so it follows
 * the Reminders switch like the habit nudges.
 */
export function customerRewardVoucher(voucher: { id: string; kind: VoucherKind; amount: string }): PushMessage {
  const words = voucherIssuedWords(voucher.kind, Math.round(Number(voucher.amount)))
  return message({
    ...words,
    url: '/profile/rewards',
    tag: `reward_voucher:${voucher.id}`,
    category: 'reminder',
    ttlSeconds: 24 * 60 * 60,
  })
}

/**
 * A habit nudge (a wash due, one stamp from a reward, something about to
 * lapse): the words Updates shows. Never the car or the customer.
 */
export function customerRewardNudge(nudge: { kind: NudgeKind; subjectKey: string; words: NudgeWords }): PushMessage {
  return message({
    title: nudge.words.title,
    body: nudge.words.body,
    url: nudge.words.url,
    tag: `reward_nudge:${nudge.kind}`,
    category: 'reminder',
    ttlSeconds: 12 * 60 * 60,
  })
}

// ─── Requests and the free wash (customer reach, part 2, 0062) ───────────────

/**
 * What a request's notification reads: the services, the window, the
 * garage's name and how far out the customer is. Never the address, the
 * car or the customer: the garage sees those only once it is a booking.
 */
export interface PushRequest {
  id: string
  rootRequestId: string | null
  bookingType: string
  items: Array<{ name: string }>
  windowLabel: string
}

/** The customer's requests page (detlio.com). */
export const CUSTOMER_REQUESTS_PATH = '/requests'
/** The garage's Requests inbox (vendor.detlio.com). */
export const GARAGE_REQUESTS_PATH = '/requests'

const requestTag = (request: PushRequest) => `request:${request.rootRequestId ?? request.id}`

/** A new request for the garage: urgent, the clock is running. */
export function garageNewRequest(request: PushRequest, beyond: string, respondBy: Date, now: Date): PushMessage {
  return message({
    title: `New request · ${serviceLabelOf(request.items.map((item) => item.name))}`,
    body: `${request.windowLabel} · ${beyond} — answer by ${istTimeLabel(respondBy)}`,
    url: GARAGE_REQUESTS_PATH,
    tag: `request:${request.id}`,
    urgency: 'high',
    ttlSeconds: ttlUntil(respondBy, now),
  })
}

/** The customer confirmed and paid a request the garage said yes to: it is on its job list, accepted. */
export function garageRequestBooked(booking: PushBooking): PushMessage {
  return message({
    title: `Request booked · ${pushServiceLabel(booking)}`,
    body: `${istSlotShortLabel(booking.scheduledAt)} · ${bookingTypeLabel(booking.bookingType)} — paid and accepted`,
    url: garageJobPath(booking.id, 'upcoming'),
    tag: bookingTag(booking.id),
  })
}

/** The garage said yes: confirm and pay before the deadline. */
export function customerRequestAccepted(
  request: PushRequest,
  garage: string,
  startAt: Date,
  confirmBy: Date,
  now: Date
): PushMessage {
  return message({
    title: request.bookingType === 'pickup' ? `${garage} can collect your car!` : `${garage} can come!`,
    body: `${istSlotShortLabel(startAt)}. Confirm and pay by ${istTimeLabel(confirmBy)} to keep it.`,
    url: CUSTOMER_REQUESTS_PATH,
    tag: requestTag(request),
    urgency: 'high',
    ttlSeconds: ttlUntil(confirmBy, now),
  })
}

/** The first garage couldn't, so the request went to the next one. */
export function customerRequestForwarded(request: PushRequest, from: string, to: string): PushMessage {
  return message({
    title: `${from} can't make it this time`,
    body: `We've sent your request to ${to}. Same details; nothing to pay yet.`,
    url: CUSTOMER_REQUESTS_PATH,
    tag: requestTag(request),
  })
}

/** Nobody could take it: what to do instead. */
export function customerRequestNoGarage(request: PushRequest): PushMessage {
  return message({
    title: 'No garage could take your request this time',
    body: 'See garages you can visit, or put your name down for a free wash in your area.',
    url: CUSTOMER_REQUESTS_PATH,
    tag: requestTag(request),
    ttlSeconds: 24 * 60 * 60,
  })
}

/**
 * The team cancelled the request (admin Requests, 0064): sent the way an
 * expiry is told. The team's reason stays with the team.
 */
export function customerRequestCancelledByDetlio(request: PushRequest, garage: string): PushMessage {
  return message({
    title: 'Your request was cancelled',
    body: `Detlio cancelled your request to ${garage}. Nothing was paid; send a new request any time.`,
    url: CUSTOMER_REQUESTS_PATH,
    tag: requestTag(request),
    ttlSeconds: 24 * 60 * 60,
  })
}

/** The garage took back its yes before the customer paid (0066). */
export function customerRequestWithdrawn(request: PushRequest, garage: string): PushMessage {
  return message({
    title: `${garage} can no longer come`,
    body: 'They took back their yes before you paid. Nothing was paid; send a new request any time.',
    url: CUSTOMER_REQUESTS_PATH,
    tag: requestTag(request),
    ttlSeconds: 24 * 60 * 60,
  })
}

/** A yes the customer did not confirm in time. */
export function customerRequestLapsed(request: PushRequest, garage: string): PushMessage {
  return message({
    title: 'Your accepted request has expired',
    body: `${garage}'s yes ran out before it was confirmed. Send a new request any time.`,
    url: CUSTOMER_REQUESTS_PATH,
    tag: requestTag(request),
    ttlSeconds: 24 * 60 * 60,
  })
}

/**
 * The free-wash sign-up's news (launch, a garage that now comes to them, the
 * one 14-day reminder): the Reminders switch, never urgent. Words from
 * lib/area-signups.ts.
 */
export function customerAreaNews(
  kind: 'launch' | 'coverage' | 'reminder',
  signupId: string,
  words: { title: string; body: string }
): PushMessage {
  return message({
    ...words,
    url: kind === 'launch' ? '/home' : '/garages',
    tag: `area:${kind}:${signupId}`,
    category: 'reminder',
    ttlSeconds: 24 * 60 * 60,
  })
}

/** "Send me a test notification", from either app's Notifications screen. */
export function testMessage(audience: 'customer' | 'garage'): PushMessage {
  return message({
    title: 'Detlio notifications are on',
    body:
      audience === 'garage'
        ? 'New bookings will show here, even with the portal closed.'
        : 'Updates about your bookings will show here.',
    url: audience === 'garage' ? '/settings/notifications' : '/profile/notifications',
    tag: 'test',
    category: 'test',
    ttlSeconds: 10 * 60,
  })
}

/** Seconds until `at` (a slot's start), at least a minute: no use after it. */
function ttlUntil(at: Date, now: Date): number {
  return Math.max(60, Math.min(DEFAULT_TTL_SECONDS * 6, Math.floor((at.getTime() - now.getTime()) / 1000)))
}
