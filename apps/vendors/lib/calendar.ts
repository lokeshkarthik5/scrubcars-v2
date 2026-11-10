import { BOOKING_DAYS_AHEAD } from '@repo/core/booking-types'
import type { OpeningDay } from '@repo/core/opening-hours'
import {
  DEFAULT_SERVICE_DURATION_MINS,
  effectiveDurationMins,
} from '@repo/core/service-duration'
import type { Booking } from '@repo/core/types'
import { istDay, needsAnswer } from './jobs'

/**
 * The Bookings calendar (owner, 10 Nov 2026; mockups garage-calendar A · Month
 * and B · Day): which day each job falls on, what colour its day shows, which
 * days the garage is shut, and how a day's jobs sit on its hours. Pure, like
 * jobs.ts beside it: the clock is passed in, and every day is India's calendar
 * whatever the device says. The phone app imports this file rather than a
 * copy (apps/vendors-app/lib/jobs.ts), so the two can't drift.
 *
 * A day is a "YYYY-MM-DD" key, the shape the holidays already come in.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MINS = 24 * 60

const at = (iso: string | undefined | null): number =>
  iso ? new Date(iso).getTime() : NaN

// ─── Days, weeks and months ─────────────────────────────────────────────────

/** A day-since-epoch number (istDay) as its "YYYY-MM-DD" key. */
function keyOf(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

/** The day number of a key: UTC date arithmetic, so no DST edges. */
function numberOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, date) / DAY_MS)
}

/** The IST calendar day a moment falls on. */
export function istDateKey(time: number): string {
  return keyOf(istDay(time))
}

export function addDays(day: string, days: number): string {
  return keyOf(numberOf(day) + days)
}

/** 0 = Sunday … 6 = Saturday, as the working hours number them. */
export function weekdayOf(day: string): number {
  return new Date(numberOf(day) * DAY_MS).getUTCDay()
}

/** "2026-11" for any day in November 2026. */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, m - 1 + by, 1))
  return date.toISOString().slice(0, 7)
}

/** The month's first day. */
export function firstOfMonth(month: string): string {
  return `${month}-01`
}

/**
 * Monday to Sunday of the week a day is in: the Day view's strip, and the
 * Monday-first rows of the month grid.
 */
export function weekOf(day: string): string[] {
  const back = (weekdayOf(day) + 6) % 7
  const monday = addDays(day, -back)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/**
 * The month as six Monday-first rows (42 days), with the days before and
 * after it that fill the first and last rows. Always six rows, so the grid
 * doesn't jump in height from one month to the next.
 */
export function monthGrid(month: string): string[] {
  const monday = weekOf(firstOfMonth(month))[0]
  return Array.from({ length: 42 }, (_, i) => addDays(monday, i))
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** The grid's header row, Monday first. */
export const GRID_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function dayOfMonth(day: string): number {
  return Number(day.slice(8, 10))
}

export function weekdayShort(day: string): string {
  return WEEKDAYS_SHORT[weekdayOf(day)]
}

/** "November 2026": the Month view's title. */
export function monthTitle(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${year}`
}

/** "Today · Tue 10 Nov", or "Thu 12 Nov" on any other day. */
export function dayHeading(day: string, today: string): string {
  const month = MONTHS_LONG[Number(day.slice(5, 7)) - 1].slice(0, 3)
  const date = `${weekdayShort(day)} ${dayOfMonth(day)} ${month}`
  return day === today ? `Today · ${date}` : date
}

/**
 * How far the Month view's ‹ › go: back to the month of the oldest job on
 * the list (its history), forward to the last day a customer can book (the
 * slot picker's week) or the month of the furthest job already booked,
 * whichever is later. Today's month is always inside.
 */
export function monthBounds(
  days: Iterable<string>,
  today: string
): { first: string; last: string } {
  let first = monthOf(today)
  let last = monthOf(addDays(today, BOOKING_DAYS_AHEAD - 1))
  for (const day of days) {
    const month = monthOf(day)
    if (month < first) first = month
    if (month > last) last = month
  }
  return { first, last }
}

// ─── Jobs on the calendar ───────────────────────────────────────────────────

/**
 * What colour a job is on the calendar: red, waiting for the garage's
 * answer; blue, accepted (light) or under way (strong, in the Day view);
 * green, done.
 */
export type CalendarKind = 'answer' | 'accepted' | 'working' | 'done'

/**
 * A job's colour, or null for one the calendar leaves out. A booking still
 * waiting for an answer shows while it can be answered (needsAnswer: not one
 * whose time ran out, nor one waiting on the customer to pick a time the
 * garage suggested, whose slot is about to move). Cancelled, declined and
 * moved bookings never show. A customer who didn't turn up is the one
 * cancellation that stays, as done: the garage held the slot and was ready,
 * and the Done list keeps it the same way.
 */
export function calendarKind(b: Booking, now: number): CalendarKind | null {
  switch (b.status) {
    case 'pending':
      return needsAnswer(b, now) ? 'answer' : null
    case 'confirmed':
      return 'accepted'
    case 'in_progress':
      return 'working'
    case 'completed':
      return 'done'
    case 'cancelled':
      return b.noShow === 'customer' ? 'done' : null
    default:
      return null
  }
}

/**
 * How long a job takes, in minutes: the length the booking holds in the
 * garage's capacity (`durationMins`, the services' total snapshotted when it
 * was booked), so a block is exactly the room the slot list keeps for it.
 * The spec's fallback for a service with no duration was 45 minutes; the
 * slot calendar holds 60 for one (DEFAULT_SERVICE_DURATION_MINS, 0064), and
 * the calendar uses the same so a "Free" gap here is never one the slot list
 * says is taken. Only a booking with no snapshot at all falls back to its
 * services one by one.
 */
export function jobDurationMins(b: Booking): number {
  if (Number.isFinite(b.durationMins) && b.durationMins > 0) {
    return Math.round(b.durationMins)
  }
  const total = b.items.reduce(
    (sum, item) => sum + effectiveDurationMins(item),
    0
  )
  return total > 0 ? total : DEFAULT_SERVICE_DURATION_MINS
}

export interface CalendarJob {
  booking: Booking
  kind: CalendarKind
  /** The IST day it starts on. */
  day: string
  /** Minutes from that day's midnight to the booked start. */
  startMin: number
  /** And to its end, never past midnight: the next day isn't drawn. */
  endMin: number
  /** Doorstep and pickup & drop: the "On the road" lane, not a bay. */
  onTheRoad: boolean
}

function minutesIntoDay(time: number): number {
  return Math.floor(((time + IST_OFFSET_MS) % DAY_MS) / 60_000)
}

/** The calendar's jobs, grouped by IST day, each day in start order. */
export function calendarJobs(
  bookings: readonly Booking[],
  now: number
): Map<string, CalendarJob[]> {
  const days = new Map<string, CalendarJob[]>()
  for (const booking of bookings) {
    const kind = calendarKind(booking, now)
    const start = at(booking.scheduledAtIso)
    if (!kind || Number.isNaN(start)) continue
    const startMin = minutesIntoDay(start)
    const job: CalendarJob = {
      booking,
      kind,
      day: istDateKey(start),
      startMin,
      endMin: Math.min(DAY_MINS, startMin + jobDurationMins(booking)),
      onTheRoad:
        booking.bookingType === 'doorstep' || booking.bookingType === 'pickup',
    }
    const list = days.get(job.day)
    if (list) list.push(job)
    else days.set(job.day, [job])
  }
  for (const list of days.values()) {
    list.sort(
      (a, b) =>
        a.startMin - b.startMin ||
        a.endMin - b.endMin ||
        a.booking.id.localeCompare(b.booking.id)
    )
  }
  return days
}

export interface DaySummary {
  total: number
  answer: number
  /** Accepted and under way together: one blue dot. */
  accepted: number
  done: number
}

export function daySummary(jobs: readonly CalendarJob[] = []): DaySummary {
  const summary = { total: jobs.length, answer: 0, accepted: 0, done: 0 }
  for (const job of jobs) {
    if (job.kind === 'answer') summary.answer++
    else if (job.kind === 'done') summary.done++
    else summary.accepted++
  }
  return summary
}

/** The day's dots, in the legend's order: to answer, accepted, done. */
export function dayDots(summary: DaySummary): CalendarKind[] {
  const dots: CalendarKind[] = []
  if (summary.answer) dots.push('answer')
  if (summary.accepted) dots.push('accepted')
  if (summary.done) dots.push('done')
  return dots
}

export function jobsCount(count: number): string {
  return count === 1 ? '1 job' : `${count} jobs`
}

// ─── Opening hours and closed days ──────────────────────────────────────────

/** A day the garage marked as time off (Settings → Time off). */
export interface CalendarClosure {
  date: string
  reason: string | null
}

export type ClosedDay =
  { kind: 'weekly' } | { kind: 'timeoff'; reason: string | null }

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

/** The day's row of weekly hours when it is open and runs forwards. */
function openRow(day: string, hours: readonly OpeningDay[]) {
  const row = hours.find((h) => h.dayOfWeek === weekdayOf(day))
  if (!row || row.isClosed) return null
  return toMinutes(row.openTime) < toMinutes(row.closeTime) ? row : null
}

/**
 * Whether customers can't book a day, and why. Time off first (a holiday
 * shuts a day its weekly hours call open, as the slot list reads it), then
 * the weekly hours: a day marked closed, a day with no row, or hours that
 * don't run forwards are all shut to the slot list. With no hours at all
 * (still loading, or a seat that can't read them) nothing is called closed.
 */
export function closedDay(
  day: string,
  hours: readonly OpeningDay[],
  closures: readonly CalendarClosure[]
): ClosedDay | null {
  const closure = closures.find((c) => c.date === day)
  if (closure)
    return { kind: 'timeoff', reason: closure.reason?.trim() || null }
  if (hours.length > 0 && !openRow(day, hours)) return { kind: 'weekly' }
  return null
}

/** "Closed · Weekly holiday", "Time off · Family function". */
export function closedTitle(closed: ClosedDay): string {
  if (closed.kind === 'weekly') return 'Closed · Weekly holiday'
  return closed.reason ? `Time off · ${closed.reason}` : 'Time off'
}

/** Where the day off is changed: weekly hours, or the time off list. */
export function closedNote(closed: ClosedDay): string {
  const where = closed.kind === 'weekly' ? 'Hours' : 'Time off'
  return `Customers can’t book this day. Change it in Settings → ${where}.`
}

export interface DayHours {
  openMin: number
  closeMin: number
  /** False when these are the 9 to 6 stand-in, not the garage's own. */
  known: boolean
}

/** What the timeline draws on a day with no hours of its own to read. */
export const FALLBACK_HOURS = { openMin: 9 * 60, closeMin: 18 * 60 }

export function dayHours(day: string, hours: readonly OpeningDay[]): DayHours {
  const row = openRow(day, hours)
  if (!row) return { ...FALLBACK_HOURS, known: false }
  return {
    openMin: toMinutes(row.openTime),
    closeMin: toMinutes(row.closeTime),
    known: true,
  }
}

/** "9:00 am", "6:30 pm", "12:00 pm" from minutes since midnight. */
export function minuteClock(minutes: number): string {
  const total = ((minutes % DAY_MINS) + DAY_MINS) % DAY_MINS
  const hours = Math.floor(total / 60)
  const mins = String(total % 60).padStart(2, '0')
  return `${hours % 12 || 12}:${mins} ${hours < 12 ? 'am' : 'pm'}`
}

/** "1:00", "3:30": the short times inside a block or a free gap. */
export function shortClock(minutes: number): string {
  return minuteClock(minutes).split(' ')[0]
}

/** The Day view's second line: "6 jobs · open 9:00 am – 6:30 pm". */
export function daySubtitle(
  count: number,
  hours: DayHours,
  closed: ClosedDay | null
): string {
  const jobs = count === 0 ? 'No jobs' : jobsCount(count)
  if (closed) return `${jobs} · ${closedTitle(closed)}`
  if (!hours.known) return jobs
  return `${jobs} · open ${minuteClock(hours.openMin)} – ${minuteClock(hours.closeMin)}`
}

// ─── The Day view's timeline ────────────────────────────────────────────────

/** How tall an hour is drawn, in points. */
export const HOUR_PX = 56

/** A gap at least this long inside opening hours shows as "Free". */
export const FREE_GAP_MINS = 45

export interface Timeline {
  /** Whole hours: where the drawing starts and ends, in minutes. */
  startMin: number
  endMin: number
  /** Every hour line from the start, for the labels down the left. */
  hours: number[]
}

/**
 * The hours a day's timeline covers: from the hour the garage opens to the
 * hour after it closes (so "Closes 6:30 pm" has a band to sit in, and a
 * close on the hour gets a half hour of it), stretched to take in any job
 * booked outside them.
 */
export function timelineFor(
  hours: DayHours,
  jobs: readonly CalendarJob[]
): Timeline {
  let first = hours.openMin
  let last = hours.closeMin + 30
  for (const job of jobs) {
    first = Math.min(first, job.startMin)
    last = Math.max(last, job.endMin)
  }
  const startMin = Math.max(0, Math.floor(first / 60) * 60)
  const endMin = Math.min(DAY_MINS, Math.ceil(last / 60) * 60)
  const marks: number[] = []
  for (let m = startMin; m < endMin; m += 60) marks.push(m)
  return { startMin, endMin, hours: marks }
}

/** "9 am", "10", "11", "12 pm", "1": am or pm on the first label and at noon. */
export function hourLabel(minutes: number, first: boolean): string {
  const hours = Math.floor(minutes / 60) % 24
  const hour12 = hours % 12 || 12
  if (first || hours === 12 || hours === 0) {
    return `${hour12} ${hours < 12 ? 'am' : 'pm'}`
  }
  return String(hour12)
}

/**
 * The at-garage jobs side by side, a column (lane) each, first free lane by
 * start time. Detlio doesn't put bookings in bays, so a lane is not a bay
 * and nothing says which bay a car is in: there are as many lanes as the
 * garage has bays (one when unset), and more when more jobs overlap than
 * that, so a job is never hidden behind another.
 */
export function packLanes(
  jobs: readonly CalendarJob[],
  bays: number | null | undefined
): CalendarJob[][] {
  const count = bays && bays > 0 ? Math.floor(bays) : 1
  const lanes: CalendarJob[][] = Array.from({ length: count }, () => [])
  const sorted = [...jobs].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin
  )
  for (const job of sorted) {
    const lane = lanes.find(
      (l) => l.length === 0 || l[l.length - 1].endMin <= job.startMin
    )
    if (lane) lane.push(job)
    else lanes.push([job])
  }
  return lanes
}

export interface Gap {
  startMin: number
  endMin: number
}

/**
 * What the slot list reads about the whole garage besides its hours: how
 * many cars at once, the most jobs in a day (null is no cap), and whether
 * new bookings are paused. All three come from /vendors/me.
 */
export interface GarageRoom {
  bays: number | null
  jobsPerDay: number | null
  paused: boolean
}

/**
 * The bookings that take a share of the garage, as the slot list counts them
 * (bookings.repository's holdsCapacity): every one still on, whatever its
 * mode. Doorstep and pickup jobs count, since the server keeps no separate
 * room for them, and so does a booking the calendar leaves out: one waiting
 * on the customer to pick a suggested time still holds its old slot, and one
 * whose time to answer ran out holds it until it is cancelled. The list the
 * garage sees is already only paid bookings, the server's other condition.
 */
const HOLDS_ROOM: ReadonlySet<Booking['status']> = new Set([
  'pending',
  'confirmed',
  'in_progress',
])

const toBays = (bays: number | null | undefined) =>
  bays && bays > 0 ? Math.floor(bays) : 1

/**
 * How many more cars the garage has room for at each minute of a day (index
 * = minutes from the day's IST midnight): its bays less every job holding a
 * share of it then, a job from the day before that runs past midnight
 * included. Null when the day takes no new booking at all: bookings paused,
 * or as many jobs starting that day as the daily cap allows. The same rule
 * as the server's hasCapacity (lib/slots.ts), read from the garage's list.
 */
export function roomByMinute(
  bookings: readonly Booking[],
  day: string,
  room: GarageRoom
): Int16Array | null {
  if (room.paused) return null
  const cap =
    room.jobsPerDay && room.jobsPerDay > 0 ? Math.floor(room.jobsPerDay) : null
  const dayStart = numberOf(day) * DAY_MS - IST_OFFSET_MS
  const left = new Int16Array(DAY_MINS).fill(toBays(room.bays))
  let startingThatDay = 0
  for (const booking of bookings) {
    if (!HOLDS_ROOM.has(booking.status)) continue
    const start = at(booking.scheduledAtIso)
    if (Number.isNaN(start)) continue
    if (istDateKey(start) === day) startingThatDay++
    const from = (start - dayStart) / 60_000
    const to = from + jobDurationMins(booking)
    for (
      let m = Math.max(0, Math.floor(from));
      m < Math.min(DAY_MINS, Math.ceil(to));
      m++
    ) {
      left[m]--
    }
  }
  if (cap !== null && startingThatDay >= cap) return null
  return left
}

/**
 * The "Free" boxes for each at-garage lane: stretches inside opening hours,
 * FREE_GAP_MINS or longer, from `fromMin` on (the caller passes now rounded
 * up to the next quarter hour on today, so a gap that has gone by isn't
 * offered), where the lane has nothing drawn AND the whole garage has a bay
 * to spare.
 *
 * Free time is the garage's, not a lane's: a lane is only where the job
 * cards happen to sit. So a box needs room by roomByMinute, which counts the
 * doorstep run and the booking waiting on the customer the timeline doesn't
 * draw in these lanes, and every box taken uses up one car's worth of that
 * room, so two lanes never offer the same spare bay twice. Only the first
 * `bays` lanes get boxes; a lane beyond them is there only because jobs
 * overlap more than the garage has bays, and can't have spare room. None at
 * all on a day that takes no new booking (paused, or the day's cap is
 * reached). The caller also offers none on a closed day or one gone by.
 *
 * Returns one list per lane, in the lanes' order.
 */
export function freeGaps(input: {
  /** The at-garage lanes, from packLanes. */
  lanes: readonly (readonly CalendarJob[])[]
  /** The garage's whole booking list, for what holds its room. */
  bookings: readonly Booking[]
  day: string
  hours: DayHours
  fromMin: number
  room: GarageRoom
}): Gap[][] {
  const { lanes, hours } = input
  const gaps: Gap[][] = lanes.map(() => [])
  const left = roomByMinute(input.bookings, input.day, input.room)
  if (!left) return gaps
  const open = Math.max(0, hours.openMin, input.fromMin)
  const close = Math.min(DAY_MINS, hours.closeMin)
  const usable = Math.min(toBays(input.room.bays), lanes.length)
  for (let i = 0; i < usable; i++) {
    const drawn = new Uint8Array(DAY_MINS)
    for (const job of lanes[i]) drawn.fill(1, job.startMin, job.endMin)
    let runStart = -1
    for (let m = open; m <= close; m++) {
      const free = m < close && !drawn[m] && left[m] > 0
      if (free) {
        if (runStart < 0) runStart = m
        continue
      }
      if (runStart >= 0 && m - runStart >= FREE_GAP_MINS) {
        gaps[i].push({ startMin: runStart, endMin: m })
        for (let k = runStart; k < m; k++) left[k]--
      }
      runStart = -1
    }
  }
  return gaps
}

/** Now as minutes into today, rounded up to the next quarter hour. */
export function nextQuarter(now: number): number {
  return Math.ceil(minutesIntoDay(now) / 15) * 15
}

/** Minutes into today, for the red "now" line. */
export function nowMinute(now: number): number {
  return minutesIntoDay(now)
}

// ─── Words ──────────────────────────────────────────────────────────────────

/** A job's state on the calendar, in the legend's words. */
export const KIND_LABELS: Record<CalendarKind, string> = {
  answer: 'To answer',
  accepted: 'Accepted',
  working: 'In progress',
  done: 'Done',
}

/**
 * A waiting block's line: "Answer · 9 min" while the garage's time to answer
 * is running (inside the answer window), else "To answer" (the clock hasn't
 * started, or the booking has no deadline).
 */
export function answerLine(b: Booking, now: number): string {
  const deadline = b.responseDeadline
  const by = at(deadline?.respondBy)
  if (deadline && !Number.isNaN(by)) {
    const left = by - now
    if (left > 0 && left <= deadline.windowMins * 60_000) {
      return `Answer · ${Math.max(1, Math.ceil(left / 60_000))} min`
    }
  }
  return KIND_LABELS.answer
}

function dateWords(day: string, long: boolean): string {
  const month = MONTHS_LONG[Number(day.slice(5, 7)) - 1]
  const date = `${dayOfMonth(day)} ${month}`
  return long ? `${WEEKDAYS_LONG[weekdayOf(day)]} ${date}` : date
}

/**
 * A day button's name: "12 November, 4 jobs, 1 to answer"; "Tuesday 10
 * November, today, 6 jobs" on the week strip; a closed day says so.
 */
export function dayButtonLabel(
  day: string,
  opts: {
    today: string
    summary: DaySummary
    closed: boolean
    /** The week strip names the weekday too. */
    long?: boolean
  }
): string {
  const parts = [dateWords(day, opts.long ?? false)]
  if (day === opts.today) parts.push('today')
  if (opts.closed) parts.push('closed')
  if (opts.summary.total > 0) parts.push(jobsCount(opts.summary.total))
  if (opts.summary.answer > 0) parts.push(`${opts.summary.answer} to answer`)
  return parts.join(', ')
}

/** A timeline block's name: who, when, and its state. */
export function blockLabel(job: CalendarJob, now: number): string {
  const who = job.booking.customerName || 'Customer'
  const when = `${minuteClock(job.startMin)} to ${minuteClock(job.endMin)}`
  const state =
    job.kind === 'answer' ? answerLine(job.booking, now) : KIND_LABELS[job.kind]
  return `${who}, ${when}, ${state}`
}

/**
 * The small line under a day on the week strip: "Closed"; "3 done" (green)
 * on a day gone by; "6 jobs" today; a dot in the day's most pressing colour
 * and the count on a day to come. Null when there is nothing to say.
 */
export type StripNote =
  | { kind: 'closed' }
  | { kind: 'done'; count: number }
  | { kind: 'today'; count: number }
  | { kind: 'count'; count: number; tone: CalendarKind }

export function stripNote(
  day: string,
  today: string,
  summary: DaySummary,
  closed: boolean
): StripNote | null {
  if (closed && summary.total === 0) return { kind: 'closed' }
  if (day < today)
    return summary.done > 0 ? { kind: 'done', count: summary.done } : null
  if (summary.total === 0) return closed ? { kind: 'closed' } : null
  if (day === today) return { kind: 'today', count: summary.total }
  const tone: CalendarKind = summary.answer
    ? 'answer'
    : summary.accepted
      ? 'accepted'
      : 'done'
  return { kind: 'count', count: summary.total, tone }
}

// ─── Remembered view ────────────────────────────────────────────────────────

export type CalendarView = 'month' | 'day'

/** Where this device keeps the last Month / Day choice. */
export const CALENDAR_VIEW_KEY = 'detlio.bookingsCalendarView'

export function calendarViewFrom(
  value: string | null | undefined
): CalendarView {
  return value === 'day' ? 'day' : 'month'
}
