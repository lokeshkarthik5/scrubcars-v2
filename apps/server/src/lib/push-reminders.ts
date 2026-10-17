/**
 * When the pending-digest cron (every DIGEST_TICK_MINS, 10 minutes) sends a
 * scheduled notification (0044). Pure and clock-free: the caller passes
 * `now`, so every window is unit-tested. Each kind goes at most once per
 * booking: modules/push claims a `notification_sends` row (unique per
 * booking and kind) before sending, so overlapping or retried runs never
 * send twice; these rules only say what is due.
 *
 * - **The evening before** (`day_before`, customers): in the runs from 18:00
 *   to 18:59 IST, for confirmed bookings on the next IST day. Like the
 *   Updates feed's "Your booking is tomorrow" (dated 18:00 the day before,
 *   lib/home-updates.ts), never for a booking made after 18:00 that evening:
 *   the customer has only just booked it.
 * - **About an hour before** (`hour_before`, customers): confirmed bookings
 *   starting more than 30 and at most 70 minutes from now. A run every ten
 *   minutes sends it 60–70 minutes ahead; a run that is missed or late still
 *   sends it, down to 30 minutes ahead, and never later than that.
 * - **"Accept within 10 min"** (`respond_soon`, garages): paid pending
 *   bookings whose time to answer (`respond_by`, 0042) ends more than 2 and
 *   at most 12 minutes from now, with no open suggested times, made at least
 *   5 minutes ago (the new-booking notification has just said how long they
 *   have), and only while AUTO_CANCEL_UNANSWERED is on: without it nothing
 *   is cancelled, so there is nothing to warn about.
 *
 * Only `confirmed` bookings get reminders: a pending one may yet be
 * declined, and one in progress has started.
 */
import { addDays, istDateKey, istMidnight, istParts } from './ist.js'
import { reminderTimeFor } from './home-updates.js'
import type { ScheduledPushKind } from './push.js'

const MINUTE_MS = 60 * 1000

/** The IST hour whose cron runs send the evening-before reminders. */
export const DAY_BEFORE_HOUR = 18

export const HOUR_BEFORE_MIN_MS = 30 * MINUTE_MS
export const HOUR_BEFORE_MAX_MS = 70 * MINUTE_MS

export const RESPOND_SOON_MIN_MS = 2 * MINUTE_MS
export const RESPOND_SOON_MAX_MS = 12 * MINUTE_MS
/** A booking younger than this was just announced as new; no nudge yet. */
export const RESPOND_SOON_MIN_AGE_MS = 5 * MINUTE_MS

/** At most this many of each kind a run; the next run takes the rest. */
export const SCHEDULED_PUSH_BATCH = 50

export interface Range {
  from: Date
  to: Date
}

/** Whether this run is one of the evening-before runs (18:00–18:59 IST). */
export function isDayBeforeRun(now: Date): boolean {
  return istParts(now).hour === DAY_BEFORE_HOUR
}

/** Tomorrow in IST, as [its midnight, the next midnight). */
export function tomorrowRange(now: Date): Range {
  const tomorrow = addDays(istDateKey(now), 1)
  return { from: istMidnight(tomorrow), to: istMidnight(addDays(tomorrow, 1)) }
}

/** (now + 30 min, now + 70 min]: the hour-before window. */
export function hourBeforeRange(now: Date): Range {
  return { from: new Date(now.getTime() + HOUR_BEFORE_MIN_MS), to: new Date(now.getTime() + HOUR_BEFORE_MAX_MS) }
}

/** (now + 2 min, now + 12 min]: when a deadline is close enough to warn. */
export function respondSoonRange(now: Date): Range {
  return { from: new Date(now.getTime() + RESPOND_SOON_MIN_MS), to: new Date(now.getTime() + RESPOND_SOON_MAX_MS) }
}

/** What the rules read from a booking. */
export interface ReminderCandidate {
  status: string
  scheduledAt: Date
  createdAt: Date
  respondBy?: Date | null
  paymentStatus?: string | null
  hasOpenProposal?: boolean
}

const within = (at: Date, range: Range) => at.getTime() > range.from.getTime() && at.getTime() <= range.to.getTime()

/**
 * Whether `kind` is due for this booking now. The repository narrows to
 * these windows in SQL; this is the rule itself, checked again on every row
 * before anything is claimed or sent.
 */
export function scheduledPushDue(
  kind: ScheduledPushKind,
  booking: ReminderCandidate,
  now: Date,
  options: { autoCancelOn: boolean }
): boolean {
  switch (kind) {
    case 'day_before': {
      if (booking.status !== 'confirmed' || !isDayBeforeRun(now)) return false
      const tomorrow = tomorrowRange(now)
      const at = booking.scheduledAt.getTime()
      if (at < tomorrow.from.getTime() || at >= tomorrow.to.getTime()) return false
      return booking.createdAt.getTime() <= reminderTimeFor(booking.scheduledAt).getTime()
    }
    case 'hour_before':
      return booking.status === 'confirmed' && within(booking.scheduledAt, hourBeforeRange(now))
    case 'respond_soon':
      return (
        options.autoCancelOn &&
        booking.status === 'pending' &&
        booking.paymentStatus === 'paid' &&
        !booking.hasOpenProposal &&
        !!booking.respondBy &&
        within(booking.respondBy, respondSoonRange(now)) &&
        now.getTime() - booking.createdAt.getTime() >= RESPOND_SOON_MIN_AGE_MS
      )
  }
}
