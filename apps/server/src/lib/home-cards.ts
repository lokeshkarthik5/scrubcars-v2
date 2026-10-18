/**
 * The cards on the customer's Home, decided from what the Home read loaded.
 * Pure, with the clock passed in.
 *
 * Owner decisions on order (top to bottom):
 *
 *   1. A must-act card, only when one applies, one at most, in this order
 *      (0041): the garage suggested other times for a booking (it runs out
 *      within hours and then the booking is cancelled), extra work waiting
 *      for approval (the garage has the car and is waiting), a bill to pay,
 *      then the garage shut on the day of a booking.
 *   2. The offers (lib/offers.ts).
 *   3. "Rate your wash", a soft card, only when there is no must-act card;
 *      or, when there is neither, a complaint the team just resolved ("see
 *      our answer", complaintAnswerCard); or, when none of those, a coating
 *      or detailing follow-up coming due (0046, serviceReminderCard). So at
 *      most two cards ever sit above the car.
 *   4. The car, with its wash bar and one tile: the next booking (carrying a
 *      team notice about it as one short line), before & after photos, Book
 *      again, or nothing booked.
 *
 * A notice about the customer's own booking is never a card above the car:
 * it rides on the Next booking tile and leads the Updates feed.
 */
import { computeServiceAmount, sumAmounts, type PricingColumns, type VehicleTier } from './pricing.js'
import { dayStatus, getDayOfWeekFromDate } from './slots.js'
import { istDateKey } from './ist.js'
import { isPaid, type HubBooking, type HubComplaint } from './home-updates.js'
import { formatComplaintNumber } from './complaints.js'
import { noticeMatchesBooking, type NoticeRow } from './notices.js'
import { washStatus, type WashStatus } from './wash-status.js'
import type { BookingType } from './booking-types.js'
import { customerPickupStage, type CustomerPickupStage } from './pickup.js'
import { extraWorkPayable } from './extra-work.js'
import { isProposalLive, liveOptions } from './time-proposals.js'
import {
  nearestFirst,
  REMINDER_BOOK_CATEGORY,
  REMINDER_TITLES,
  reminderReason,
  showsOnHome,
  type HubServiceReminder,
  type ServiceReminderKind,
} from './service-reminders.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * "Rate your wash" ("How was your wash at <garage>?") shows for this long
 * after the job is finished: two weeks (owner decision, 17 Oct 2026; it was
 * 72 hours). Inside the Home read's 30-day window, so no booking it needs is
 * left unread.
 */
export const RATE_PROMPT_DAYS = 14
/** Before & after photos stay on the tile for a week after the job. */
export const PHOTOS_TILE_DAYS = 7
/**
 * Same rules as rescheduleBooking (bookings.service.ts): an accepted booking
 * can be moved only this far ahead, and a chain only so many times.
 */
export const CHANGE_CUTOFF_MS = 2 * HOUR_MS
export const MAX_RESCHEDULES = 2

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'in_progress'])

// ─── Must-act and soft cards ─────────────────────────────────────────────────

export type ActionCard =
  | {
      /**
       * The garage can't do the booked time and suggested others (0041):
       * "<Garage> can't do 10:00 — pick another time". Answer by
       * `expiresAt`, or the booking is cancelled with a full refund.
       */
      kind: 'time_proposal'
      bookingId: string
      proposalId: string
      vendorName: string
      /** The time the customer booked, which the garage can't do. */
      scheduledAt: string
      /** The times on offer, soonest first. */
      options: string[]
      expiresAt: string
    }
  | {
      /** Extra work the garage asks for, waiting for "Approve & pay" (0041). */
      kind: 'extra_work_due'
      bookingId: string
      chargeId: string
      vendorName: string
      description: string
      amount: string
      raisedAt: string
      /** Further requests waiting beyond this one. */
      moreDue: number
    }
  | {
      kind: 'bill_due'
      bookingId: string
      chargeId: string
      vendorName: string
      serviceName: string
      amountDue: string
      raisedAt: string
      /** Further bills due beyond this one: "+1 more" links to Updates. */
      moreDue: number
    }
  | {
      kind: 'garage_closed'
      bookingId: string
      vendorId: string
      vendorName: string
      scheduledAt: string
      reason: 'holiday' | 'weekly_off'
      canChangeTime: boolean
    }
  | {
      kind: 'rate'
      bookingId: string
      vehicleName: string
      vendorName: string
      completedAt: string
    }
  | {
      /**
       * The team resolved one of the customer's complaints: "see our
       * answer". A soft card, after Rate your wash (complaintAnswerCard).
       */
      kind: 'complaint_resolved'
      complaintId: string
      /** "C-000123". */
      number: string
      resolvedAt: string
    }
  | {
      /**
       * A coating or detailing follow-up for one of the customer's cars,
       * due within a week or overdue (0046, lib/service-reminders.ts). The
       * softest card: only in a place nothing else wants.
       */
      kind: 'service_reminder'
      reminderId: string
      vehicleId: string
      vehicleName: string
      reminderKind: ServiceReminderKind
      /** "Maintenance wash for your coating". */
      title: string
      /** "3 months since your coating at Shine Studio". */
      reason: string
      /** The due date in force, "YYYY-MM-DD" (after a snooze). */
      dueOn: string
      state: 'due_soon' | 'due' | 'overdue'
      /** Days until due (0 = today), negative once overdue. */
      daysLeft: number
      /** What "Book" searches for (the search page's category). */
      bookCategory: string
    }

/** The garages' closed days, as the Home read loads them for upcoming bookings. */
export interface GarageDays {
  /** IST dates ("YYYY-MM-DD") in vendor_closures, by garage. */
  closures: Map<string, Set<string>>
  /** Weekly hours rows, by garage then day of week (0 = Sunday). */
  hours: Map<string, Map<number, { isClosed: boolean }>>
}

/**
 * Whether the customer can still move a booking themselves, by the same
 * rules rescheduleBooking enforces: pending or accepted, an accepted one at
 * least 2 hours ahead, and moves left in its chain.
 */
export function canChangeTime(
  booking: Pick<HubBooking, 'status' | 'scheduledAt' | 'rescheduleCount'>,
  now: Date
): boolean {
  if (booking.status !== 'pending' && booking.status !== 'confirmed') return false
  if (booking.rescheduleCount >= MAX_RESCHEDULES) return false
  if (booking.status === 'confirmed') {
    return booking.scheduledAt.getTime() - now.getTime() >= CHANGE_CUTOFF_MS
  }
  return true
}

/** Every final bill waiting to be paid, oldest first. Extra work has its own card. */
export function billDueCards(bookings: HubBooking[]): Array<Extract<ActionCard, { kind: 'bill_due' }>> {
  const due = bookings
    .flatMap((booking) =>
      booking.charges
        .filter((c) => c.status === 'due' && c.kind !== 'extra_work')
        .map((charge) => ({ booking, charge }))
    )
    .sort((a, b) => a.charge.createdAt.getTime() - b.charge.createdAt.getTime())

  return due.map(({ booking, charge }) => ({
    kind: 'bill_due',
    bookingId: booking.id,
    chargeId: charge.id,
    vendorName: booking.vendorName,
    serviceName: booking.serviceLabel,
    amountDue: charge.amountDue,
    raisedAt: charge.createdAt.toISOString(),
    moreDue: due.length - 1,
  }))
}

/**
 * Bookings whose garage suggested other times that the customer can still
 * answer, the one that runs out soonest first (lib/time-proposals.ts).
 */
export function timeProposalCards(
  bookings: HubBooking[],
  now: Date
): Array<Extract<ActionCard, { kind: 'time_proposal' }>> {
  return bookings
    .flatMap((booking) => {
      const proposal = booking.proposal
      if (!proposal || !isProposalLive(proposal, booking.status, now.getTime())) return []
      const options = liveOptions(proposal.slots, booking.bookingType, now.getTime())
      if (options.length === 0) return []
      return [{
        kind: 'time_proposal' as const,
        bookingId: booking.id,
        proposalId: proposal.id,
        vendorName: booking.vendorName,
        scheduledAt: booking.scheduledAt.toISOString(),
        options,
        expiresAt: proposal.expiresAt.toISOString(),
      }]
    })
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
}

/**
 * Extra work waiting for the customer's approval, oldest first: only on a
 * booking that is still on (accepted or under way), where it can be paid.
 */
export function extraWorkDueCards(bookings: HubBooking[]): Array<Extract<ActionCard, { kind: 'extra_work_due' }>> {
  const due = bookings
    .filter((booking) => extraWorkPayable(booking.status))
    .flatMap((booking) =>
      booking.charges
        .filter((c) => c.kind === 'extra_work' && c.status === 'due')
        .map((charge) => ({ booking, charge }))
    )
    .sort((a, b) => a.charge.createdAt.getTime() - b.charge.createdAt.getTime())

  return due.map(({ booking, charge }) => ({
    kind: 'extra_work_due',
    bookingId: booking.id,
    chargeId: charge.id,
    vendorName: booking.vendorName,
    description: charge.description ?? 'Extra work',
    amount: charge.amountDue,
    raisedAt: charge.createdAt.toISOString(),
    moreDue: due.length - 1,
  }))
}

/**
 * Upcoming bookings on a day their garage is shut, soonest first: a holiday,
 * or a weekly day off — only where an hours row exists and says closed. A
 * missing row is a gap in the garage's data, not a closure, so it never
 * raises this card. A pause is ignored here: it never touches existing
 * bookings. Changed hours on the day are not checked.
 */
export function garageClosedCards(
  bookings: HubBooking[],
  days: GarageDays,
  now: Date
): Array<Extract<ActionCard, { kind: 'garage_closed' }>> {
  return bookings
    .filter((b) => (b.status === 'pending' || b.status === 'confirmed') && b.scheduledAt > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .flatMap((booking) => {
      const date = istDateKey(booking.scheduledAt)
      const isHoliday = days.closures.get(booking.vendorId)?.has(date) ?? false
      const hours = days.hours.get(booking.vendorId)?.get(getDayOfWeekFromDate(date))
      if (!isHoliday && !hours) return []
      const status = dayStatus({ pausedAt: null, isHoliday, hours })
      if (status.open || status.reason === 'paused') return []
      return [{
        kind: 'garage_closed' as const,
        bookingId: booking.id,
        vendorId: booking.vendorId,
        vendorName: booking.vendorName,
        scheduledAt: booking.scheduledAt.toISOString(),
        reason: status.reason,
        // A paused garage refuses every reschedule (409 GARAGE_PAUSED), so
        // the card must not offer one: Get help is the way out instead.
        canChangeTime: !booking.vendorPausedAt && canChangeTime(booking, now),
      }]
    })
}

/**
 * Finished jobs to ask a rating for, newest first: done within the last 14
 * days, not reviewed, and not closed with ×. Only a job that was done: a
 * cancelled booking, a no-show (either side) and a moved booking never ask.
 */
export function rateCards(bookings: HubBooking[], now: Date): Array<Extract<ActionCard, { kind: 'rate' }>> {
  return bookings
    .filter(
      (b) =>
        b.status === 'completed' &&
        !b.noShow &&
        !b.moved &&
        b.completedAt !== null &&
        !b.hasReview &&
        !b.reviewPromptDismissedAt &&
        now.getTime() - b.completedAt.getTime() <= RATE_PROMPT_DAYS * DAY_MS &&
        b.completedAt <= now
    )
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())
    .map((b) => ({
      kind: 'rate' as const,
      bookingId: b.id,
      vehicleName: b.vehicleName,
      vendorName: b.vendorName,
      completedAt: b.completedAt!.toISOString(),
    }))
}

/** A resolved complaint stays a Home card for this long, while unread. */
export const COMPLAINT_CARD_DAYS = 7

/**
 * "Complaint C-000123 resolved — see our answer", as a soft card: the newest
 * complaint the team resolved in the last 7 days that the customer has not
 * yet seen in Updates (resolved after `seenAt`). Opening Updates is reading
 * it, so the card goes with the bell; My complaints keeps the answer.
 *
 * It takes the soft card's place only when that place is free: no must-act
 * card and no Rate your wash (the caller checks), so Home keeps at most two
 * cards above the car. Otherwise the answer is in Updates alone.
 */
export function complaintAnswerCard(
  complaints: HubComplaint[],
  seenAt: Date,
  now: Date
): Extract<ActionCard, { kind: 'complaint_resolved' }> | null {
  const since = now.getTime() - COMPLAINT_CARD_DAYS * 24 * HOUR_MS
  const newest = complaints
    .filter(
      (c) =>
        c.status === 'resolved' &&
        c.resolvedAt !== null &&
        c.resolvedAt.getTime() >= since &&
        c.resolvedAt <= now &&
        c.resolvedAt > seenAt
    )
    .sort((a, b) => b.resolvedAt!.getTime() - a.resolvedAt!.getTime())[0]
  if (!newest) return null
  return {
    kind: 'complaint_resolved',
    complaintId: newest.id,
    number: formatComplaintNumber(newest.number),
    resolvedAt: newest.resolvedAt!.toISOString(),
  }
}

/**
 * Home's soft card, with a resolved complaint in the place only when it is
 * free: a must-act card or Rate your wash keeps it, so there are never more
 * than two cards above the car.
 */
export function softCardWithComplaint(
  picked: { mustAct: ActionCard | null; softCard: ActionCard | null },
  complaints: HubComplaint[],
  seenAt: Date,
  now: Date
): ActionCard | null {
  if (picked.mustAct || picked.softCard) return picked.softCard
  return complaintAnswerCard(complaints, seenAt, now)
}

/**
 * The service reminder for Home's soft card: the nearest one due within a
 * week or overdue (lib/service-reminders.ts showsOnHome), on any of the
 * customer's cars. Booked or answered ones never show.
 */
export function serviceReminderCard(
  reminders: HubServiceReminder[]
): Extract<ActionCard, { kind: 'service_reminder' }> | null {
  const nearest = reminders.filter((r) => showsOnHome(r.standing)).sort(nearestFirst)[0]
  if (!nearest || nearest.standing.kind !== 'open' || nearest.standing.state === 'upcoming') return null
  return {
    kind: 'service_reminder',
    reminderId: nearest.id,
    vehicleId: nearest.vehicleId,
    vehicleName: nearest.vehicleName,
    reminderKind: nearest.kind,
    title: REMINDER_TITLES[nearest.kind],
    reason: reminderReason(nearest.kind, nearest.vendorName),
    dueOn: nearest.standing.dueOn,
    state: nearest.standing.state,
    daysLeft: nearest.standing.daysLeft,
    bookCategory: REMINDER_BOOK_CATEGORY[nearest.kind],
  }
}

/**
 * Home's soft card, with a service reminder in the place only when it is
 * free: a must-act card, Rate your wash or a resolved complaint keeps it, so
 * there are never more than two cards above the car. Otherwise the reminder
 * is in Updates (and on the car's page) alone.
 */
export function softCardWithReminder(
  picked: { mustAct: ActionCard | null; softCard: ActionCard | null },
  reminders: HubServiceReminder[]
): ActionCard | null {
  if (picked.mustAct || picked.softCard) return picked.softCard
  return serviceReminderCard(reminders)
}

/**
 * The cards above the car: one must-act card (suggested times, then extra
 * work, then a bill, then a closed day), and a soft "Rate your wash" card
 * only when there is none. `todo` is all of them, for the To do list on
 * /updates.
 */
export function pickActionCards(bookings: HubBooking[], days: GarageDays, now: Date): {
  mustAct: ActionCard | null
  softCard: ActionCard | null
  todo: ActionCard[]
} {
  const proposals = timeProposalCards(bookings, now)
  const extraWork = extraWorkDueCards(bookings)
  const bills = billDueCards(bookings)
  // A booking the garage suggested other times for is answered on that card;
  // its closed-day card would only say the same thing less usefully.
  const proposed = new Set(proposals.map((card) => card.bookingId))
  const closed = garageClosedCards(bookings, days, now).filter((card) => !proposed.has(card.bookingId))
  const rate = rateCards(bookings, now)
  const mustAct = proposals[0] ?? extraWork[0] ?? bills[0] ?? closed[0] ?? null
  return {
    mustAct,
    softCard: mustAct ? null : (rate[0] ?? null),
    todo: [...proposals, ...extraWork, ...bills, ...closed, ...rate],
  }
}

// ─── The car and its tile ────────────────────────────────────────────────────

export interface HubCar {
  id: string
  make: string
  model: string
  color: string | null
  licensePlate: string | null
  vehicleType: VehicleTier
  isDefault: boolean
  washIntervalDays: number | null
}

/** A car's most recent finished job of any kind and age, for Book again. */
export interface LastJob {
  bookingId: string
  vehicleId: string
  vendorId: string
  vendorName: string
  /** The garage's state now, to judge whether it can take this job again. */
  garage: {
    active: boolean
    verified: boolean
    /** Has a map pin (vendors.geo). */
    pinned: boolean
    dropinEnabled: boolean
    doorstepEnabled: boolean
    /** Offers pickup & drop now (lib/pickup.ts isPickupOffered). */
    pickupOffered: boolean
  }
  /** Set while the garage has stopped taking new bookings. */
  vendorPausedAt: Date | null
  bookingType: BookingType
  /** The services as sold, in order, with their live state and prices. */
  services: Array<PricingColumns & { id: string; name: string; isActive: boolean }>
}

/**
 * Whether the garage can take this job again now: the rule its own page
 * books by (findPublicVendorById: active and verified), not paused, and still
 * offering this kind of booking. A map pin is needed only for doorstep and
 * pickup & drop, which measure the customer's distance from it. Most garages predate the map
 * picker and lost their pins in 0019; they still take drop-ins, so a missing
 * pin must not tell their customers they "aren't taking bookings". (Offers
 * and Nearby keep the pin rule: they are about where a garage is.)
 */
export function garageTakesJobAgain(job: Pick<LastJob, 'garage' | 'vendorPausedAt' | 'bookingType'>): boolean {
  const { garage } = job
  if (!garage.active || !garage.verified || job.vendorPausedAt) return false
  switch (job.bookingType) {
    case 'doorstep':
      return garage.doorstepEnabled && garage.pinned
    // Measured from the pin too: the pickup radius is.
    case 'pickup':
      return garage.pickupOffered && garage.pinned
    case 'dropin':
      return garage.dropinEnabled
  }
}

export type RightTile =
  | {
      kind: 'next_booking'
      bookingId: string
      status: string
      /** 'unpaid' is a pay-later booking: it holds no slot until paid. */
      paymentStatus: 'paid' | 'collected' | 'unpaid'
      scheduledAt: string
      bookingType: BookingType
      vendorId: string
      vendorName: string
      /** May be an archived car's: Home never hides a booking. */
      vehicleId: string
      /** A team notice about this booking, as one short line. */
      notice: { noticeId: string; title: string; linkUrl: string | null; linkLabel: string | null } | null
      /**
       * Pickup & drop only: the latest handover step reached, so the tile can
       * say "Car collected" or "On its way back". Null on other types.
       */
      pickupStage: CustomerPickupStage | null
    }
  /**
   * Raised only when the garage took at least one after photo, so the tile
   * never promises an "after" that does not exist; `before` may be 0.
   */
  | { kind: 'photos'; bookingId: string; before: number; after: number; vendorName: string; at: string }
  | {
      kind: 'book_again'
      bookingId: string
      vendorId: string
      vendorName: string
      bookingType: BookingType
      /** Still on sale, in the order first booked. The client builds the link. */
      serviceIds: string[]
      /** "Exterior Wash", or "Exterior Wash + 1 more". */
      serviceLabel: string
      /** For this car's type; null when any line has no price for it. */
      price: string | null
      /**
       * Some line is priced on inspection: `price` then includes only its
       * inspection fee, not the job. The tile must say so ("Inspection fee
       * ₹299"), never show it as the price of the work.
       */
      pricedOnInspection: boolean
      available: boolean
    }
  /** The garage it last used isn't taking bookings: "See other garages". */
  | { kind: 'garage_unavailable'; vendorId: string; vendorName: string }
  | { kind: 'nothing_booked' }

export interface HomeCar extends HubCar {
  wash: WashStatus
  rightTile: RightTile
}

/** "Express Wash", "Express Wash + 1 more". */
export function serviceLabelOf(names: string[]): string {
  if (names.length === 0) return 'Service'
  return names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} more`
}

function bookAgainTile(job: LastJob, car: HubCar): RightTile {
  if (!garageTakesJobAgain(job)) {
    return { kind: 'garage_unavailable', vendorId: job.vendorId, vendorName: job.vendorName }
  }
  const onSale = job.services.filter((service) => service.isActive)
  const prices = onSale.map((service) => computeServiceAmount(service, car.vehicleType))
  return {
    kind: 'book_again',
    bookingId: job.bookingId,
    vendorId: job.vendorId,
    vendorName: job.vendorName,
    bookingType: job.bookingType,
    serviceIds: onSale.map((service) => service.id),
    serviceLabel: serviceLabelOf(onSale.map((service) => service.name)),
    price: onSale.length > 0 && prices.every((p) => p !== null) ? sumAmounts(prices as string[]) : null,
    pricedOnInspection: onSale.some((service) => service.pricingType === 'on_inspection'),
    available: onSale.length > 0,
  }
}

/**
 * Each saved car with its wash bar and tile, default car first.
 *
 * A live booking for a car the customer has since removed is shown on the
 * default car's tile, so Home never hides a booking.
 */
export function buildCars(input: {
  cars: HubCar[]
  bookings: HubBooking[]
  /** When each car was last washed (lib/wash-status.ts washedAt). */
  lastWashAt: Map<string, Date>
  lastJobs: Map<string, LastJob>
  /** Live, undismissed booking-window notices. */
  notices: NoticeRow[]
  now: Date
}): HomeCar[] {
  const { now } = input
  const cars = [...input.cars].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`)
  )
  const carIds = new Set(cars.map((car) => car.id))
  const active = input.bookings
    .filter((b) => ACTIVE_STATUSES.has(b.status))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())

  return cars.map((car, index) => {
    const own = active.filter((b) => b.vehicleId === car.id)
    const shown = index === 0 ? active.filter((b) => b.vehicleId === car.id || !carIds.has(b.vehicleId)) : own
    // Being washed right now counts as booked, as does a paid slot ahead.
    const paidAhead = own.find(
      (b) => isPaid(b.payment) && (b.status === 'in_progress' || b.scheduledAt > now)
    )

    const wash = washStatus({
      intervalDays: car.washIntervalDays,
      lastWashAt: input.lastWashAt.get(car.id) ?? null,
      bookedFor: paidAhead ? { bookingId: paidAhead.id, scheduledAt: paidAhead.scheduledAt } : null,
      now,
    })

    return { ...car, wash, rightTile: rightTileFor(car, shown, input, now) }
  })
}

export type NextBookingTile = Extract<RightTile, { kind: 'next_booking' }>

function nextBookingTile(next: HubBooking, notices: NoticeRow[]): NextBookingTile {
  const notice = notices
    .filter((n) => noticeMatchesBooking(n, next))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0]
  return {
    kind: 'next_booking',
    bookingId: next.id,
    status: next.status,
    paymentStatus:
      next.payment?.status === 'paid' || next.payment?.status === 'collected'
        ? next.payment.status
        : 'unpaid',
    scheduledAt: next.scheduledAt.toISOString(),
    bookingType: next.bookingType,
    vendorId: next.vendorId,
    vendorName: next.vendorName,
    vehicleId: next.vehicleId,
    notice: notice
      ? { noticeId: notice.id, title: notice.title, linkUrl: notice.linkUrl, linkLabel: notice.linkLabel }
      : null,
    pickupStage:
      next.bookingType === 'pickup'
        ? customerPickupStage({ status: next.status, startedAt: next.startedAt, ...next.pickup })
        : null,
  }
}

/**
 * The next live booking when the customer has no saved car left: they
 * booked for their only car, then removed it (it is archived, since a
 * booking points at it). There is no car to hang the tile on, so Home shows
 * this on its own beside "Add your car". Null whenever a car exists, because
 * then buildCars puts the booking on the default car's tile.
 */
export function nextBookingWithoutCar(input: {
  cars: HubCar[]
  bookings: HubBooking[]
  notices: NoticeRow[]
}): NextBookingTile | null {
  if (input.cars.length > 0) return null
  const next = input.bookings
    .filter((b) => ACTIVE_STATUSES.has(b.status))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0]
  return next ? nextBookingTile(next, input.notices) : null
}

function rightTileFor(
  car: HubCar,
  active: HubBooking[],
  input: { bookings: HubBooking[]; lastJobs: Map<string, LastJob>; notices: NoticeRow[] },
  now: Date
): RightTile {
  const next = active[0]
  if (next) return nextBookingTile(next, input.notices)

  // "Before & after" needs an after photo: a garage that only photographed
  // the car at check-in has nothing to show as the result.
  const withPhotos = input.bookings
    .filter(
      (b) =>
        b.vehicleId === car.id &&
        b.status === 'completed' &&
        b.completedAt !== null &&
        b.photos.after > 0 &&
        now.getTime() - b.completedAt.getTime() <= PHOTOS_TILE_DAYS * DAY_MS
    )
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0]
  if (withPhotos) {
    return {
      kind: 'photos',
      bookingId: withPhotos.id,
      before: withPhotos.photos.before,
      after: withPhotos.photos.after,
      vendorName: withPhotos.vendorName,
      at: withPhotos.completedAt!.toISOString(),
    }
  }

  const job = input.lastJobs.get(car.id)
  if (job) return bookAgainTile(job, car)

  return { kind: 'nothing_booked' }
}
