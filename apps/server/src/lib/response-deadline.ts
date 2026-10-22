/**
 * How long a garage has to answer a paid booking, as pure rules (0042).
 * Clock-free: the caller passes the moment the clock is measured from.
 *
 * Owner decision (17 Oct 2026): a garage has 30 minutes *during its opening
 * hours* to accept a paid booking (or reject it, or suggest other times);
 * otherwise it is cancelled with a full refund and the customer is pointed
 * to other garages. Read as:
 *
 *   - Paid while the garage is open: by payment time + 30 minutes. The 30
 *     are opening-hours minutes, so a booking paid 10 minutes before closing
 *     gets those 10 tonight and 20 more after the garage next opens: the
 *     clock stops at closing and starts again at opening.
 *   - Paid while it is shut (outside that IST day's working hours, a weekly
 *     off day, a holiday in vendor_closures, or paused): 30 minutes after it
 *     next opens. A paused garage has no next opening, so only the cap below
 *     applies.
 *   - Never later than 1 hour before the slot (SLOT_MARGIN_MS). If that cap
 *     would leave the garage less than 15 minutes from payment, it gets 15
 *     minutes from payment instead (RESPONSE_FLOOR_MS) — the floor — but
 *     never past the slot's start. The floor only lifts the cap; it never
 *     lengthens a window that the opening hours already set.
 *   - Only paid pending bookings have a deadline. A customer's reschedule
 *     that goes back to pending gets a fresh one, measured from the move. A
 *     garage-suggested time (0041) is accepted already and has none.
 *   - An open "Suggest another time" counts as an answer: no auto-cancel
 *     while it is open (its own expiry takes over). Withdrawing it leaves at
 *     least RESPONSE_FLOOR_MS to accept or decline (afterWithdraw).
 *
 * The 30 is GARAGE_RESPONSE_MINUTES (default 30); cancelling is
 * AUTO_CANCEL_UNANSWERED=on (default off). While off the deadline is still
 * worked out, stored and shown as guidance, and nothing is refused or
 * cancelled because of it.
 */
import { addDaysToDateKey, getDateKeyFromScheduledAt, getDayOfWeekFromDate } from './slots.js'

const MINUTE_MS = 60 * 1000

/** The garage's answer window when GARAGE_RESPONSE_MINUTES is unset or junk. */
export const DEFAULT_RESPONSE_MINUTES = 30
/** The narrowest and widest window GARAGE_RESPONSE_MINUTES may set. */
export const MIN_RESPONSE_MINUTES = 5
export const MAX_RESPONSE_MINUTES = 240

/** The deadline is never later than this before the slot. */
export const SLOT_MARGIN_MS = 60 * MINUTE_MS

/**
 * The least a garage gets from payment when the slot margin would leave it
 * less (a booking paid 1h10 before its slot), and the least it has left to
 * answer after withdrawing its suggested times. Never past the slot's start.
 */
export const RESPONSE_FLOOR_MS = 15 * MINUTE_MS

/** How many overdue bookings one cron run cancels, oldest deadline first. */
export const RESPONSE_SWEEP_LIMIT = 20

/** How far ahead the opening-hours walk looks before giving up (a slot is never further). */
const MAX_DAYS_AHEAD = 400

/** The reason an auto-cancelled booking carries, as admin, the garage and the customer read it. */
export const NOT_ACCEPTED_REASON = 'Not accepted in time'

/** GARAGE_RESPONSE_MINUTES as a whole number of minutes in range, else the default. */
export function parseResponseMinutes(raw: string | undefined): number {
  const value = Number((raw ?? '').trim())
  if (!(raw ?? '').trim() || !Number.isInteger(value)) return DEFAULT_RESPONSE_MINUTES
  if (value < MIN_RESPONSE_MINUTES || value > MAX_RESPONSE_MINUTES) return DEFAULT_RESPONSE_MINUTES
  return value
}

/** AUTO_CANCEL_UNANSWERED: on only when set to exactly `on` (any case, trimmed). */
export function isAutoCancelOn(raw: string | undefined): boolean {
  return (raw ?? '').trim().toLowerCase() === 'on'
}

/** One row of vendor_working_hours, as the calendar reads it. */
export interface WorkingHoursRow {
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number
  /** "09:00:00" (Postgres `time`), or "09:00". */
  openTime: string
  closeTime: string
  isClosed: boolean
}

/** What decides when a garage is open: its weekly hours, its holidays and its pause. */
export interface GarageCalendar {
  pausedAt: Date | null
  hours: readonly WorkingHoursRow[]
  /** vendor_closures dates (IST, "YYYY-MM-DD") from the paid day to the slot's day. */
  closures: readonly string[]
}

function asClock(time: string): string {
  const [h = '0', m = '0', s = '0'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0').slice(0, 2)}`
}

/**
 * When the garage is open on one IST day, or null when it is not open at
 * all: a holiday, no hours row (a weekly off day, as the slot list reads
 * it), a closed day, or hours that do not run forwards (close at or before
 * open — the slot list offers nothing on such a day either).
 */
export function openHoursOn(
  date: string,
  calendar: Pick<GarageCalendar, 'hours' | 'closures'>
): { start: number; end: number } | null {
  if (calendar.closures.includes(date)) return null
  const hours = calendar.hours.find((row) => row.dayOfWeek === getDayOfWeekFromDate(date))
  if (!hours || hours.isClosed) return null
  const start = Date.parse(`${date}T${asClock(hours.openTime)}+05:30`)
  const end = Date.parse(`${date}T${asClock(hours.closeTime)}+05:30`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { start, end }
}

export interface ResponseDeadline {
  /** When the garage must have answered by. */
  respondBy: Date
  /**
   * When its clock started: the payment (or move) if the garage was open,
   * else its next opening. Null when it never opens before the slot (paused,
   * or shut every day until then) and only the slot margin set the deadline.
   */
  clockStartsAt: Date | null
  /** Which rule set the deadline, for tests and logs. */
  rule: 'opening_hours' | 'slot_margin' | 'floor' | 'slot_start'
}

/**
 * The deadline for a booking that became paid and pending at `from` (the
 * payment, or the customer's move back to pending), for a slot at
 * `scheduledAt`, with a window of `windowMins` opening-hours minutes.
 */
export function garageRespondBy(input: {
  from: Date
  scheduledAt: Date
  windowMins: number
  calendar: GarageCalendar
}): ResponseDeadline {
  const from = input.from.getTime()
  const slot = input.scheduledAt.getTime()

  // Walk the garage's open hours from `from`, spending the window. Past the
  // slot's own day the margin below always wins, so the walk stops there.
  let byHours = Number.POSITIVE_INFINITY
  let clockStartsAt: number | null = null
  if (!input.calendar.pausedAt) {
    let remaining = input.windowMins * MINUTE_MS
    const lastDay = getDateKeyFromScheduledAt(new Date(Math.max(slot, from)))
    let date = getDateKeyFromScheduledAt(new Date(from))
    for (let i = 0; i <= MAX_DAYS_AHEAD && date <= lastDay; i++, date = addDaysToDateKey(date, 1)) {
      const open = openHoursOn(date, input.calendar)
      if (!open) continue
      const start = Math.max(open.start, from)
      if (start >= open.end) continue
      clockStartsAt ??= start
      const available = open.end - start
      if (available >= remaining) {
        byHours = start + remaining
        break
      }
      remaining -= available
    }
  }

  let respondBy = byHours
  let rule: ResponseDeadline['rule'] = 'opening_hours'
  const margin = slot - SLOT_MARGIN_MS
  if (margin < respondBy) {
    const floor = from + RESPONSE_FLOOR_MS
    respondBy = Math.max(margin, floor)
    rule = margin >= floor ? 'slot_margin' : 'floor'
  }
  if (slot < respondBy) {
    respondBy = slot
    rule = 'slot_start'
  }

  return {
    respondBy: new Date(respondBy),
    clockStartsAt: clockStartsAt === null ? null : new Date(clockStartsAt),
    rule,
  }
}

/**
 * The IST dates whose holidays matter to a deadline measured from `from` for
 * a slot at `scheduledAt`: the repository reads vendor_closures between them.
 */
export function calendarRange(from: Date, scheduledAt: Date): { first: string; last: string } {
  const first = getDateKeyFromScheduledAt(from)
  const last = getDateKeyFromScheduledAt(new Date(Math.max(from.getTime(), scheduledAt.getTime())))
  return { first, last }
}

/**
 * After the garage withdraws its suggested times (0041) the booking is
 * pending again and waits for an answer: it keeps its deadline, or gets at
 * least RESPONSE_FLOOR_MS from now, never past the slot's start. Null stays
 * null (a booking from before 0042 has no deadline).
 */
export function afterWithdraw(respondBy: Date | null, scheduledAt: Date, now: Date): Date | null {
  if (!respondBy) return null
  const floor = Math.min(now.getTime() + RESPONSE_FLOOR_MS, scheduledAt.getTime())
  return new Date(Math.max(respondBy.getTime(), floor))
}

/** A booking's facts the answer rules read. */
export interface RespondingBooking {
  status: string
  respondBy: Date | null
  /** Set only by the auto-cancel: the booking was cancelled as not accepted in time. */
  responseMissedAt: Date | null
}

/**
 * Whether the garage's Accept (or Suggest times) is refused because its time
 * to answer has run out: the booking was already cancelled for it, or the
 * switch is on and the deadline has passed. While AUTO_CANCEL_UNANSWERED is
 * off the deadline is only guidance and nothing is refused for it.
 */
export function responseTimePassed(booking: RespondingBooking, enforced: boolean, now: number): boolean {
  if (booking.responseMissedAt) return true
  return enforced && booking.status === 'pending' && booking.respondBy !== null && booking.respondBy.getTime() <= now
}

/** What the sweep reads of a booking it might cancel. */
export interface SweepCandidate {
  status: string
  paymentStatus: string | null
  respondBy: Date | null
  hasOpenProposal: boolean
  pickedUpAt?: Date | null
}

/**
 * Whether the cron cancels this booking as not accepted in time: pending,
 * paid online (an unpaid booking holds nothing and the garage never sees
 * it), with a deadline that has passed, and no suggestion of other times
 * waiting for the customer. The repository's SQL reads the same conditions,
 * and the cancel's conditional write checks them again.
 */
export function isOverdueUnanswered(row: SweepCandidate, now: number): boolean {
  return (
    row.status === 'pending' &&
    row.paymentStatus === 'paid' &&
    row.respondBy !== null &&
    row.respondBy.getTime() <= now &&
    !row.hasOpenProposal &&
    !row.pickedUpAt
  )
}

/**
 * The deadline as the booking payloads carry it, for the garage's countdown
 * and the customer's "by 10:42 am". `enforced` is the switch, so the apps
 * only promise a cancellation the server will make; `windowMins` lets the
 * garage's card tell "Accept by 9:30 am" (the clock starts at opening) from
 * "Accept within 12 min". Null when the booking has no deadline.
 */
export function responseDeadlineView(
  booking: { respondBy?: Date | null },
  config: { enforced: boolean; windowMins: number }
): { respondBy: string; enforced: boolean; windowMins: number } | null {
  if (!booking.respondBy) return null
  return { respondBy: booking.respondBy.toISOString(), enforced: config.enforced, windowMins: config.windowMins }
}

/**
 * Where to look for other garages for a booking that was not accepted in
 * time: the customer's own address for doorstep and pickup (the garage
 * comes to them), the garage's pin for a drop-in (the customer meant to
 * drive there). Null when neither is known: nothing is suggested.
 */
export function otherGaragesOrigin(booking: {
  bookingType: string
  lat: number | null
  lng: number | null
  vendorLat: number | null
  vendorLng: number | null
}): { lat: number; lng: number } | null {
  const comesToCustomer = booking.bookingType === 'doorstep' || booking.bookingType === 'pickup'
  const lat = comesToCustomer ? booking.lat : booking.vendorLat
  const lng = comesToCustomer ? booking.lng : booking.vendorLng
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** How many other garages the customer is offered. */
export const OTHER_GARAGES_LIMIT = 3

/**
 * The service categories a booking's other garages must offer at least one
 * of: its services' own, with a package's member services standing in for
 * the package (another garage's packages are its own bundles, so "package"
 * matches nothing useful). Deduplicated, order kept.
 */
export function wantedCategories(items: Array<{ category: string; memberCategories?: string[] }>): string[] {
  const out: string[] = []
  for (const item of items) {
    const categories = item.category === 'package' ? (item.memberCategories ?? []) : [item.category]
    for (const category of categories) {
      if (category !== 'package' && !out.includes(category)) out.push(category)
    }
  }
  return out
}
