/**
 * Deciding when to nudge the team about paid bookings no garage has accepted.
 *
 * Pure and clock-free (the caller passes `now`), so every rule is unit-tested.
 * An outside scheduler calls the digest every DIGEST_TICK_MINS; there is no
 * "already nudged" column, so whether to post is worked out from the clock:
 *
 * - a booking reached 30 minutes of waiting since the last tick → post;
 * - a waiting booking's start time passed since the last tick → post;
 * - on the hour, while anything is waiting or refund-due → post a reminder;
 * - at 07:00 IST, if anything is listed → post the morning roll-up;
 * - never between 22:00 and 07:00 IST (the morning roll-up catches the night).
 *
 * Pickup & drop jobs (0037) ride on the same digest: an accepted pickup job
 * PICKUP_LATE_AFTER_MINS past its time with no Picked up (the driver has not
 * collected the car) posts when it crosses that line, and is listed in every
 * reminder after, until the garage marks it picked up or it is cancelled.
 *
 * Every post lists everything still waiting, so one message is the whole
 * picture. A run that fails or is skipped — including the 7 am one — delays a
 * nudge to the next hourly reminder at worst. A refund-due booking keeps being
 * listed hourly until someone declines or cancels it.
 */

import { PICKUP_LATE_AFTER_MINS } from './pickup.js'

export interface PendingBookingRow {
  id: string
  scheduledAt: Date
  bookingType: string
  amount: string
  /** Since the customer paid, or since they moved it — whichever is later. */
  waitingSince: Date
  garageName: string
  garagePhone: string
}

/**
 * An accepted pickup & drop job with no Picked up yet, starting at
 * `scheduledAt`. `waitingSince` is the slot itself, so the digest can say how
 * late it is the same way it says how long a booking has waited.
 */
export type LatePickupRow = PendingBookingRow

/** Must equal the scheduler's interval, or crossings post twice or wait an hour. */
export const DIGEST_TICK_MINS = 10
export const NUDGE_AFTER_MINS = 30

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

/** How long after its start time a still-pending booking keeps being listed. */
export const MISSED_LOOKBACK_MS = DAY_MS
/**
 * An uncollected pickup is listed until the garage marks it picked up or it is
 * cancelled, not for a day like a pending booking: a paid car nobody collected
 * stays the team's problem. The 14 days only keep the query bounded; nothing
 * real is that old and still open.
 */
export const UNCOLLECTED_PICKUP_LOOKBACK_MS = 14 * DAY_MS

/** The oldest start time each of the digest's two queries looks back to. */
export function digestLookbacks(now: number): { bookingsSince: Date; pickupsSince: Date } {
  return {
    bookingsSince: new Date(now - MISSED_LOOKBACK_MS),
    pickupsSince: new Date(now - UNCOLLECTED_PICKUP_LOOKBACK_MS),
  }
}
const IST_OFFSET_MINS = 330
const QUIET_FROM_HOUR = 22
const MORNING_HOUR = 7

export type DigestReason =
  | 'quiet_hours'
  | 'empty'
  | 'nothing_new'
  | 'new_waiting'
  | 'new_missed'
  | 'new_late_pickup'
  | 'hourly'
  | 'morning'

export interface DigestPlan {
  post: boolean
  reason: DigestReason
  /** Waiting at least 30 minutes, start still ahead: the garage can still accept. */
  waiting: PendingBookingRow[]
  /** Start passed while still pending: can't be accepted any more — refund or rebook. */
  missed: PendingBookingRow[]
  /** Pickup & drop jobs past their time by PICKUP_LATE_AFTER_MINS, car not collected. */
  latePickups: LatePickupRow[]
}

export function planPendingDigest(
  now: number,
  rows: PendingBookingRow[],
  pickupRows: LatePickupRow[] = []
): DigestPlan {
  const tickMs = DIGEST_TICK_MINS * MINUTE_MS
  const tick = Math.floor(now / tickMs) * tickMs
  const previous = tick - tickMs
  const nudgeAfterMs = NUDGE_AFTER_MINS * MINUTE_MS
  const crossed = (at: number) => at > previous && at <= tick

  const waiting = rows.filter(
    (row) => row.scheduledAt.getTime() > tick && row.waitingSince.getTime() + nudgeAfterMs <= tick
  )
  const missed = rows.filter((row) => row.scheduledAt.getTime() <= tick)
  const lateAfterMs = PICKUP_LATE_AFTER_MINS * MINUTE_MS
  const latePickups = pickupRows.filter((row) => row.scheduledAt.getTime() + lateAfterMs <= tick)

  // IST has no daylight saving, and 5h30 is a whole number of ticks, so IST
  // minutes line up with ticks.
  const istMinuteOfDay = (((tick / MINUTE_MS + IST_OFFSET_MINS) % 1440) + 1440) % 1440
  const hour = Math.floor(istMinuteOfDay / 60)
  const minute = istMinuteOfDay % 60

  const plan = (post: boolean, reason: DigestReason): DigestPlan => ({
    post,
    reason,
    waiting,
    missed,
    latePickups,
  })

  if (hour >= QUIET_FROM_HOUR || hour < MORNING_HOUR) return plan(false, 'quiet_hours')
  if (waiting.length === 0 && missed.length === 0 && latePickups.length === 0) {
    return plan(false, 'empty')
  }
  if (waiting.some((row) => crossed(row.waitingSince.getTime() + nudgeAfterMs))) {
    return plan(true, 'new_waiting')
  }
  if (missed.some((row) => crossed(row.scheduledAt.getTime()))) return plan(true, 'new_missed')
  if (latePickups.some((row) => crossed(row.scheduledAt.getTime() + lateAfterMs))) {
    return plan(true, 'new_late_pickup')
  }
  if (hour === MORNING_HOUR && minute === 0) return plan(true, 'morning')
  if (minute === 0) return plan(true, 'hourly')
  return plan(false, 'nothing_new')
}
