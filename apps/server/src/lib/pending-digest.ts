/**
 * Deciding when to nudge the team about paid bookings no garage has accepted.
 *
 * Pure and clock-free (the caller passes `now`), so every rule is unit-tested.
 * An outside scheduler calls the digest every DIGEST_TICK_MINS; there is no
 * "already nudged" column, so whether to post is worked out from the clock:
 *
 * - a booking reached 30 minutes of waiting since the last tick → post;
 * - a waiting booking's start time passed since the last tick → post;
 * - on the hour, while anything is still waiting → post a reminder;
 * - at 07:00 IST, if anything is listed → post the morning roll-up;
 * - never between 22:00 and 07:00 IST (the morning roll-up catches the night).
 *
 * Every post lists everything still waiting, so one message is the whole
 * picture. A skipped run delays a nudge to the next hourly reminder at worst.
 */

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

/** Must equal the scheduler's interval, or crossings post twice or wait an hour. */
export const DIGEST_TICK_MINS = 10
export const NUDGE_AFTER_MINS = 30

const MINUTE_MS = 60_000
const IST_OFFSET_MINS = 330
const QUIET_FROM_HOUR = 22
const MORNING_HOUR = 7

export type DigestReason =
  | 'quiet_hours'
  | 'empty'
  | 'nothing_new'
  | 'new_waiting'
  | 'new_missed'
  | 'hourly'
  | 'morning'

export interface DigestPlan {
  post: boolean
  reason: DigestReason
  /** Waiting at least 30 minutes, start still ahead: the garage can still accept. */
  waiting: PendingBookingRow[]
  /** Start passed while still pending: can't be accepted any more — refund or rebook. */
  missed: PendingBookingRow[]
}

export function planPendingDigest(now: number, rows: PendingBookingRow[]): DigestPlan {
  const tickMs = DIGEST_TICK_MINS * MINUTE_MS
  const tick = Math.floor(now / tickMs) * tickMs
  const previous = tick - tickMs
  const nudgeAfterMs = NUDGE_AFTER_MINS * MINUTE_MS
  const crossed = (at: number) => at > previous && at <= tick

  const waiting = rows.filter(
    (row) => row.scheduledAt.getTime() > tick && row.waitingSince.getTime() + nudgeAfterMs <= tick
  )
  const missed = rows.filter((row) => row.scheduledAt.getTime() <= tick)

  // IST has no daylight saving, and 5h30 is a whole number of ticks, so IST
  // minutes line up with ticks.
  const istMinuteOfDay = (((tick / MINUTE_MS + IST_OFFSET_MINS) % 1440) + 1440) % 1440
  const hour = Math.floor(istMinuteOfDay / 60)
  const minute = istMinuteOfDay % 60

  const plan = (post: boolean, reason: DigestReason): DigestPlan => ({ post, reason, waiting, missed })

  if (hour >= QUIET_FROM_HOUR || hour < MORNING_HOUR) return plan(false, 'quiet_hours')
  if (waiting.length === 0 && missed.length === 0) return plan(false, 'empty')
  if (waiting.some((row) => crossed(row.waitingSince.getTime() + nudgeAfterMs))) {
    return plan(true, 'new_waiting')
  }
  if (missed.some((row) => crossed(row.scheduledAt.getTime()))) return plan(true, 'new_missed')
  if (hour === MORNING_HOUR && minute === 0) return plan(true, 'morning')
  if (minute === 0 && waiting.length > 0) return plan(true, 'hourly')
  return plan(false, 'nothing_new')
}
