// "Next free" on the garage list's cards (customer UI round, Nov 2026): the
// first day, from today, that a garage has a time for the job checkout would
// book, and its first three times.
//
// No rule of its own. Each day runs the picker's own slotsForDay (the day,
// the hours, the notice, the bays and the day's cap, lib/slots.ts), so a time
// shown on a card is one the picker would offer for that job a moment later,
// and one checkout's write would then accept. What differs is only how the
// facts are read: for the up-to-20 garages on screen at once, in a handful of
// grouped queries (vendors.service nextFree), not one round trip per garage
// per day.

import type { BookingType } from './booking-types.js'
import {
  addDaysToDateKey,
  getDayOfWeekFromDate,
  istDayBounds,
  slotsForDay,
  todayDateKey,
  type BusyInterval,
  type DayFacts,
} from './slots.js'

/** How many garages one ask may name: a screen of cards, never the whole list. */
export const NEXT_FREE_MAX_IDS = 20

/** How many times a card offers. */
export const NEXT_FREE_TIMES = 3

/**
 * How far ahead to look, today included. A week covers a garage with a
 * weekly off day and a holiday next to it; one with nothing in a week shows
 * no row rather than a date the customer would not plan around.
 */
export const NEXT_FREE_DAYS = 7

/** today, tomorrow, or the IST date the times are on. */
export type NextFreeDay = 'today' | 'tomorrow' | string

export interface NextFree {
  day: NextFreeDay
  /** Up to three ISO starts, earliest first. */
  times: string[]
}

/** The day's label as the API sends it, from the date key of its times. */
export function nextFreeDayLabel(date: string, today: string): NextFreeDay {
  if (date === today) return 'today'
  if (date === addDaysToDateKey(today, 1)) return 'tomorrow'
  return date
}

/** What the rule reads about one garage, already loaded. */
export interface GarageWeek {
  pausedAt: Date | null
  slotIntervalMins: number
  bays: number | null
  jobsPerDay: number | null
  /** Its vendor_working_hours rows, any day of the week. */
  hours: ReadonlyArray<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }>
  /** Its holidays as IST date keys. */
  closures: ReadonlySet<string>
  /**
   * Its capacity holders from the day before the first day to the end of the
   * last (listCapacityHoldersFor): each day keeps those that started that day
   * or the one before, as listCapacityHolders reads them for one day.
   */
  busy: readonly BusyInterval[]
}

/**
 * The free starts for this job on one IST day at this garage: the picker's
 * own slotsForDay over the facts already loaded (the day's hours, holiday,
 * the bays and cap, and the capacity holders that started that day or the
 * one before). Shared with the rescue's times near the original slot
 * (lib/rescue-garages.ts).
 */
export function slotsOnDay(
  garage: GarageWeek,
  job: { durationMins: number; bookingType: BookingType },
  date: string,
  now: number = Date.now()
): string[] {
  const dayOfWeek = getDayOfWeekFromDate(date)
  const from = istDayBounds(addDaysToDateKey(date, -1)).start.getTime()
  const to = istDayBounds(date).end.getTime()
  const facts: DayFacts = {
    date,
    pausedAt: garage.pausedAt,
    isHoliday: garage.closures.has(date),
    hours: garage.hours.find((row) => row.dayOfWeek === dayOfWeek),
    intervalMins: garage.slotIntervalMins,
    bays: garage.bays,
    jobsPerDay: garage.jobsPerDay,
    busy: garage.busy.filter((busyJob) => {
      const start = busyJob.start.getTime()
      return start >= from && start < to
    }),
  }
  return slotsForDay(facts, job, now).slots
}

/**
 * The first day with a free time for this job, and its first three times;
 * null when there is none in NEXT_FREE_DAYS (paused, shut all week, full).
 */
export function nextFreeTimes(
  garage: GarageWeek,
  job: { durationMins: number; bookingType: BookingType },
  now: number = Date.now()
): NextFree | null {
  if (garage.pausedAt) return null
  const today = todayDateKey(now)
  for (let offset = 0; offset < NEXT_FREE_DAYS; offset++) {
    const date = addDaysToDateKey(today, offset)
    const slots = slotsOnDay(garage, job, date, now)
    if (slots.length > 0) {
      return { day: nextFreeDayLabel(date, today), times: slots.slice(0, NEXT_FREE_TIMES) }
    }
  }
  return null
}

/** The window the busy rows are read over: the day before today to the end of the last day. */
export function nextFreeWindow(now: number = Date.now()): { from: Date; to: Date; first: string; last: string } {
  const first = todayDateKey(now)
  const last = addDaysToDateKey(first, NEXT_FREE_DAYS - 1)
  return {
    from: istDayBounds(addDaysToDateKey(first, -1)).start,
    to: istDayBounds(last).end,
    first,
    last,
  }
}
