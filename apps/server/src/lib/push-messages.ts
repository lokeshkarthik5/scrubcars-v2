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
import { bookingTypeLabel } from './booking-types.js'
import { formatComplaintNumber } from './complaints.js'
import { BANK_DAYS, MY_COMPLAINTS_PATH, rupees } from './home-updates.js'
import { serviceLabelOf } from './home-cards.js'
import { istDateKey, istSlotShortLabel, istTimeLabel } from './ist.js'
import { DEFAULT_TTL_SECONDS, type PushMessage } from './push.js'
import { carPagePath, REMINDER_TITLES, reminderReason, type ServiceReminderKind } from './service-reminders.js'

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
 * The job is done (Mark completed, or Delivered for pickup & drop): Updates'
 * "completed" row, and the ask Home makes ("Rate your wash").
 */
export function customerCompleted(booking: PushBooking): PushMessage {
  return message({
    title: booking.bookingType === 'pickup' ? 'Your car is back' : 'Your car is done',
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

/** The garage let its time to answer run out (0042); the refund is on its way. */
export function customerNotAcceptedInTime(booking: PushBooking): PushMessage {
  return message({
    title: `${garageName(booking)} didn't accept in time`,
    body: `Your full refund is on its way (${BANK_DAYS}). Book another garage in Detlio.`,
    url: customerBookingPath(booking.id),
    tag: bookingTag(booking.id),
    ttlSeconds: 24 * 60 * 60,
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
