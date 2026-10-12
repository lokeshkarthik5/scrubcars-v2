/**
 * The wash bar on Home: how long since a car was last washed, and when the
 * next one is due. Pure, with the clock passed in.
 *
 * Owner decisions:
 *
 *   - The customer picks an interval per car: 7, 10, 14, 21 or 30 days.
 *   - With none picked, the default is 14 days, and 10 days from 1 October to
 *     31 December, the Chennai north-east monsoon, when roads are muddy and
 *     cars need washing more often. Decided by today's date in IST. Chennai
 *     only, and hard-coded, until a second city launches.
 *   - A car with a paid (or cash-collected) booking coming up is "booked",
 *     never "overdue": the customer has already done the thing the bar asks
 *     for. An unpaid booking holds no slot, so it does not count.
 *
 * Days are whole IST calendar days, so a wash at 23:00 and a look at 01:00
 * the next morning is one day, as the customer would count it.
 */
import { addDays, daysBetween, istDateKey, istParts } from './ist.js'

/** The intervals the app offers. Kept in step with 0031's CHECK. */
export const WASH_INTERVAL_CHOICES = [7, 10, 14, 21, 30] as const

export type WashIntervalDays = (typeof WASH_INTERVAL_CHOICES)[number]

export const DEFAULT_WASH_INTERVAL_DAYS = 14
export const MONSOON_WASH_INTERVAL_DAYS = 10

/** "Due soon" from this many days before the due date. */
export const DUE_SOON_DAYS = 2

/** Whether a moment falls in the monsoon months (October to December), in IST. */
export function isMonsoon(now: Date): boolean {
  // istParts' month is 0-based: 9 is October.
  return istParts(now).month >= 9
}

/** The default interval for today: 10 days in the monsoon, 14 otherwise. */
export function defaultWashIntervalDays(now: Date): number {
  return isMonsoon(now) ? MONSOON_WASH_INTERVAL_DAYS : DEFAULT_WASH_INTERVAL_DAYS
}

export type WashState =
  /** Never washed through Detlio: nothing to count from. */
  | 'none'
  | 'ok'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  /** A paid booking is coming up, so it is not overdue whatever the count. */
  | 'booked'

export interface WashStatus {
  /** The interval in force: the customer's, or today's default. */
  intervalDays: number
  /** True when the customer has not picked one. */
  isDefaultInterval: boolean
  lastWashAt: string | null
  /** Whole IST days since the last wash. Null with no wash. */
  daysSinceWash: number | null
  /** The IST date the next wash is due, "YYYY-MM-DD". Null with no wash. */
  dueOn: string | null
  /** Days until due (0 is today). Negative once overdue. Null with no wash. */
  daysLeft: number | null
  state: WashState
  /** The upcoming paid booking that makes it 'booked', if any. */
  bookedFor: { bookingId: string; scheduledAt: string } | null
}

export function washStatus(input: {
  /** The car's own interval; null is the default. */
  intervalDays: number | null
  /** When its last wash finished. */
  lastWashAt: Date | null
  /** Its soonest upcoming booking that is paid or collected. */
  bookedFor: { bookingId: string; scheduledAt: Date } | null
  now: Date
}): WashStatus {
  const intervalDays = input.intervalDays ?? defaultWashIntervalDays(input.now)
  const bookedFor = input.bookedFor
    ? { bookingId: input.bookedFor.bookingId, scheduledAt: input.bookedFor.scheduledAt.toISOString() }
    : null

  const base = {
    intervalDays,
    isDefaultInterval: input.intervalDays === null,
    bookedFor,
  }

  if (!input.lastWashAt) {
    return {
      ...base,
      lastWashAt: null,
      daysSinceWash: null,
      dueOn: null,
      daysLeft: null,
      state: bookedFor ? 'booked' : 'none',
    }
  }

  const today = istDateKey(input.now)
  const washedOn = istDateKey(input.lastWashAt)
  const dueOn = addDays(washedOn, intervalDays)
  const daysLeft = daysBetween(today, dueOn)

  let state: WashState
  if (bookedFor) state = 'booked'
  else if (daysLeft < 0) state = 'overdue'
  else if (daysLeft === 0) state = 'due_today'
  else if (daysLeft <= DUE_SOON_DAYS) state = 'due_soon'
  else state = 'ok'

  return {
    ...base,
    lastWashAt: input.lastWashAt.toISOString(),
    // Never below zero: a wash recorded "tomorrow" by a skewed clock is today.
    daysSinceWash: Math.max(0, daysBetween(washedOn, today)),
    dueOn,
    daysLeft,
    state,
  }
}

/**
 * When a completed wash happened: its completion time, or its slot for a job
 * from before 0028 recorded completion times. Only used to count days, never
 * stored, so this is not the guessed timestamp AGENTS.md forbids writing.
 */
export function washedAt(booking: { completedAt: Date | null; scheduledAt: Date }): Date {
  return booking.completedAt ?? booking.scheduledAt
}

/** Whether a wash is due or overdue: the 'wash_due' offer audience. */
export function isWashDue(status: Pick<WashStatus, 'state'>): boolean {
  return status.state === 'due_soon' || status.state === 'due_today' || status.state === 'overdue'
}
