/**
 * A garage cancelling a booking it had accepted (0066; owner's pre-iOS
 * brief, B3). Before the job starts only: confirmed, and for pickup & drop
 * before the car is collected. The customer is told, a paid booking is
 * refunded through the ordinary cancel path (lib/refunds.ts owes a garage
 * cancellation in full; AUTO_REFUNDS sends it as a garage decline) and the
 * slot is free again.
 *
 * What it costs the garage: within `lateWindowHours` of the slot it counts
 * as a missed booking in the tier metrics (the "No missed bookings" step,
 * with garage no-shows); earlier it counts like a decline, which never
 * counts against a garage. One rule, `isLateGarageCancel`, and its SQL twin
 * `lateGarageCancelSql`, never restated.
 */
import { sql, type SQL } from 'drizzle-orm'

export const GARAGE_CANCEL_RULES = {
  /** Cancelled this close to the slot (or after it): a missed booking. */
  lateWindowHours: 24,
  /** The reason the garage gives, which the team reads (never the customer's push). */
  reasonMinLength: 3,
  reasonMaxLength: 200,
} as const

const HOUR_MS = 60 * 60 * 1000

export type GarageCancelRefusal = 'not_accepted' | 'started' | 'finished' | 'car_collected'

/** Why the garage can't cancel this booking itself, or null when it can. */
export function garageCancelRefusal(booking: {
  status: string
  bookingType: string
  pickedUpAt: Date | null
}): GarageCancelRefusal | null {
  if (booking.status === 'pending') return 'not_accepted'
  if (booking.status === 'in_progress') return 'started'
  if (booking.status !== 'confirmed') return 'finished'
  if (booking.bookingType === 'pickup' && booking.pickedUpAt) return 'car_collected'
  return null
}

export const GARAGE_CANCEL_REFUSAL_WORDS: Record<GarageCancelRefusal, { status: 400 | 409; code: string; message: string }> = {
  not_accepted: {
    status: 400,
    code: 'INVALID_BOOKING_STATUS',
    message: "This booking isn't accepted yet. Reject it instead, so the customer is refunded.",
  },
  started: {
    status: 409,
    code: 'JOB_STARTED',
    message: 'The job has started, so it can no longer be cancelled here. Contact Detlio support.',
  },
  finished: {
    status: 400,
    code: 'INVALID_BOOKING_STATUS',
    message: 'This booking is already finished or cancelled.',
  },
  car_collected: {
    status: 409,
    code: 'CAR_WITH_GARAGE',
    message: "You have the customer's car. Bring it back first, then contact Detlio support.",
  },
}

/** Within the late window of the slot (or after its start): a missed booking. */
export function isLateGarageCancel(scheduledAt: Date, cancelledAt: Date): boolean {
  return scheduledAt.getTime() - cancelledAt.getTime() < GARAGE_CANCEL_RULES.lateWindowHours * HOUR_MS
}

/**
 * The same rule over `bookings b` in SQL: a garage cancellation of an
 * accepted booking within the late window of its slot.
 */
export function lateGarageCancelSql(alias = 'b'): SQL {
  const b = sql.raw(alias)
  return sql`(${b}.garage_cancelled_at IS NOT NULL AND ${b}.scheduled_at < ${b}.garage_cancelled_at + make_interval(hours => ${sql.raw(String(GARAGE_CANCEL_RULES.lateWindowHours))}))`
}
