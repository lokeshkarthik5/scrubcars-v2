// How a slot list is built, in order:
//
//   1. The day itself. A paused garage offers nothing at all, a holiday
//      (vendor_closures) or a weekly off day offers nothing that day — see
//      dayStatus.
//   2. The working hours and the job's length: every interval start whose
//      whole job finishes by closing (computeAvailableSlots). An empty list
//      here means the job does not fit the day, which the picker says.
//   3. Minimum notice: times too soon to accept (filterByMinNotice).
//   4. Capacity: times the garage is already full at (filterByCapacity).
//
// Capacity is per garage. `vendors.bays` is how many cars it can work on at
// once (null or 0 counts as 1), and `vendors.jobs_per_day` an optional cap on
// how many jobs it takes in one IST day (null is no cap). A booking holds
// capacity from `scheduled_at` for its own `duration_mins` snapshot while it is
// pending, confirmed or in progress and paid for — the same bookings the garage
// sees in its portal. Cancelled and completed ones hold nothing.
//
// The same rule runs twice: here, to decide what the picker offers, and again
// inside the transaction that writes the booking (bookings.repository.ts,
// checkGarageCanTake), under a per-garage-per-day lock. Both read these
// functions, so the picker never offers a time the write then refuses for a
// different reason than "someone just took it".

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1] ?? 0)
  return hours * 60 + minutes
}

function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

export function generateSlotStartTimes(
  openTime: string,
  closeTime: string,
  intervalMins: number
): string[] {
  const slots: string[] = []
  const endMinutes = parseTimeToMinutes(closeTime)
  let current = parseTimeToMinutes(openTime)

  while (current + intervalMins <= endMinutes) {
    slots.push(minutesToTimeString(current))
    current += intervalMins
  }

  return slots
}

function combineDateAndTime(date: string, time: string): Date {
  return new Date(`${date}T${time}+05:30`)
}

export function computeAvailableSlots(input: {
  date: string
  openTime: string
  closeTime: string
  intervalMins: number
  isClosed: boolean
  serviceDurationMins: number
}): string[] {
  if (input.isClosed) {
    return []
  }

  const slotStarts = generateSlotStartTimes(
    input.openTime,
    input.closeTime,
    input.intervalMins
  )
  const closeAt = combineDateAndTime(input.date, input.closeTime)
  const available: string[] = []

  for (const startTime of slotStarts) {
    const blockStart = combineDateAndTime(input.date, startTime)
    const blockEnd = new Date(
      blockStart.getTime() + input.serviceDurationMins * 60 * 1000
    )

    if (blockEnd > closeAt) {
      continue
    }

    available.push(blockStart.toISOString())
  }

  return available
}

export function isScheduledAtAvailable(
  scheduledAt: Date,
  availableSlots: string[]
): boolean {
  const target = scheduledAt.getTime()
  return availableSlots.some((slot) => new Date(slot).getTime() === target)
}

// The timezone all slots are anchored to. Must match the offset used in
// combineDateAndTime (+05:30) so a slot's date key matches the day the
// customer selected in the slots endpoint.
const APP_TIMEZONE = 'Asia/Kolkata'

export function getDateKeyFromScheduledAt(scheduledAt: Date): string {
  // en-CA renders as YYYY-MM-DD; timeZone pins it to IST rather than UTC so
  // early-morning IST slots don't roll back to the previous calendar day.
  return scheduledAt.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

export function getDayOfWeekFromDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// ─── Minimum notice ─────────────────────────────────────────────────────────
// How far ahead a booking must start: time for the garage to see and accept
// it, and for a doorstep crew to get there. Mirrored for the customer app in
// packages/core/src/booking-types.ts (MIN_NOTICE_MINS) — change both together.

const HOUR_MS = 60 * 60 * 1000

export type NoticeBookingType = 'dropin' | 'doorstep'

export const MIN_NOTICE_MS: Record<NoticeBookingType, number> = {
  dropin: 1 * HOUR_MS,
  doorstep: 3 * HOUR_MS,
}

/** The earliest a booking of this type may start, seen from `now`. */
export function earliestStartFor(type: NoticeBookingType, now: number = Date.now()): number {
  return now + MIN_NOTICE_MS[type]
}

/** Whether a start time gives enough notice. Exactly on the line counts. */
export function meetsMinNotice(
  scheduledAt: Date,
  type: NoticeBookingType,
  now: number = Date.now()
): boolean {
  return scheduledAt.getTime() >= earliestStartFor(type, now)
}

/**
 * Drops the slots that start too soon. Kept apart from computeAvailableSlots
 * on purpose: an empty list from that means "the job does not fit this day",
 * and a list emptied by notice must not be mistaken for it.
 */
export function filterByMinNotice(
  slots: string[],
  type: NoticeBookingType,
  now: number = Date.now()
): string[] {
  return slots.filter((slot) => meetsMinNotice(new Date(slot), type, now))
}

/** "Doorstep visits need at least 3 hours' notice." — for refusals. */
export function minNoticeMessage(type: NoticeBookingType): string {
  const hours = MIN_NOTICE_MS[type] / HOUR_MS
  const notice = hours === 1 ? "1 hour's notice" : `${hours} hours' notice`
  return type === 'doorstep'
    ? `Doorstep visits need at least ${notice}. Please pick a later time.`
    : `At-garage bookings need at least ${notice}. Please pick a later time.`
}

// ─── Days the garage is shut ────────────────────────────────────────────────

export type ClosedReason = 'paused' | 'holiday' | 'weekly_off'

export type DayStatus =
  | { open: true }
  | { open: false; reason: ClosedReason }

/**
 * Whether a garage takes bookings on a day at all, before any hours or slots
 * are looked at.
 *
 * Paused wins over everything: a garage that has stopped taking bookings is
 * not "closed on Tuesday", it is closed. A holiday wins over the weekly hours,
 * because it is the more specific thing the owner told us. A day with no hours
 * row is a weekly off day — the slot generator has always read it that way.
 */
export function dayStatus(input: {
  pausedAt: Date | null
  isHoliday: boolean
  hours: { isClosed: boolean } | null | undefined
}): DayStatus {
  if (input.pausedAt) return { open: false, reason: 'paused' }
  if (input.isHoliday) return { open: false, reason: 'holiday' }
  if (!input.hours || input.hours.isClosed) {
    return { open: false, reason: 'weekly_off' }
  }
  return { open: true }
}

const DAY_MS = 24 * HOUR_MS

/** "2026-10-05" plus a number of days, as a date key. No DST in IST. */
export function addDaysToDateKey(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

/** Today's date key in IST. */
export function todayDateKey(now: number = Date.now()): string {
  return getDateKeyFromScheduledAt(new Date(now))
}

/** The instant an IST day starts, and the instant the next one does. */
export function istDayBounds(date: string): { start: Date; end: Date } {
  const start = combineDateAndTime(date, '00:00:00')
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

/**
 * How far ahead a holiday can be set. A year covers every festival a garage
 * would plan for; past that, a typo in the year is likelier than a plan.
 */
export const MAX_CLOSURE_DAYS_AHEAD = 365

/** Why a holiday date cannot be added, or null when it can. */
export function closureDateProblem(
  date: string,
  now: number = Date.now()
): 'in_the_past' | 'too_far_ahead' | null {
  const today = todayDateKey(now)
  // Date keys compare correctly as strings: fixed width, most significant first.
  if (date < today) return 'in_the_past'
  if (date > addDaysToDateKey(today, MAX_CLOSURE_DAYS_AHEAD)) {
    return 'too_far_ahead'
  }
  return null
}

// ─── Capacity ───────────────────────────────────────────────────────────────

/** An existing booking that holds capacity: when it starts and how long. */
export interface BusyInterval {
  start: Date
  durationMins: number
}

/** How many cars at once. Unset, zero or junk means one: a garage has a bay. */
export function effectiveBays(bays: number | null | undefined): number {
  return bays && bays > 0 ? Math.floor(bays) : 1
}

/** The day's job cap, or null for no cap. Zero is "not set", not "closed". */
export function effectiveDailyCap(
  jobsPerDay: number | null | undefined
): number | null {
  return jobsPerDay && jobsPerDay > 0 ? Math.floor(jobsPerDay) : null
}

function endOf(interval: BusyInterval): number {
  return interval.start.getTime() + interval.durationMins * 60 * 1000
}

/**
 * The most existing jobs running at the same moment anywhere inside
 * [start, end).
 *
 * Not "how many jobs touch the window": two back-to-back jobs (9–10, then
 * 10–11) both touch a 9–11 window but only ever use one bay between them, so
 * a garage with two bays still has room for a 9–11 job. The peak can only
 * rise where something starts, so it is enough to count at the window's own
 * start and at every job start inside it. Intervals are half-open: a job that
 * ends at 10:00 is not running at 10:00.
 */
export function peakOverlap(
  start: number,
  end: number,
  busy: readonly BusyInterval[]
): number {
  const moments = [
    start,
    ...busy
      .map((interval) => interval.start.getTime())
      .filter((at) => at > start && at < end),
  ]

  let peak = 0
  for (const at of moments) {
    const running = busy.filter(
      (interval) => interval.start.getTime() <= at && endOf(interval) > at
    ).length
    peak = Math.max(peak, running)
  }
  return peak
}

export interface CapacityRule {
  /** The new job's whole length — every service in it, back to back. */
  durationMins: number
  /** Active bookings that hold capacity, from the day before through this one. */
  busy: readonly BusyInterval[]
  bays: number | null | undefined
  jobsPerDay: number | null | undefined
}

/**
 * Whether one more job starting at `start` fits: the day is under its cap
 * (counting only jobs that start on the same IST day), and at no moment
 * during the job would more cars be in than the garage has bays.
 *
 * Bays are interchangeable, so "never more than N at once" is all it takes for
 * every car to have a bay of its own for its whole job.
 */
export function hasCapacity(start: Date, rule: CapacityRule): boolean {
  const cap = effectiveDailyCap(rule.jobsPerDay)
  if (cap !== null) {
    const day = getDateKeyFromScheduledAt(start)
    const thatDay = rule.busy.filter(
      (interval) => getDateKeyFromScheduledAt(interval.start) === day
    ).length
    if (thatDay >= cap) return false
  }

  const startMs = start.getTime()
  const endMs = startMs + rule.durationMins * 60 * 1000
  return peakOverlap(startMs, endMs, rule.busy) < effectiveBays(rule.bays)
}

/**
 * The slots (ISO strings) that still have room. Kept apart from the notice
 * filter for the same reason that one is kept apart from the day's own list:
 * "all booked up" is a different message from "no time left today".
 */
export function filterByCapacity(
  slots: readonly string[],
  rule: CapacityRule
): string[] {
  return slots.filter((slot) => hasCapacity(new Date(slot), rule))
}
