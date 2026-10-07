// The two definitions of "this redemption counts", in one place.
//
// They used to be hand-copied between discounts.repository.ts and
// bookings.repository.ts with a comment asking the next reader to keep them in
// step. That is a maintenance trap, and the copies had already drifted from
// what the rest of the codebase means by "settled" — so they live here now and
// both repositories import them.
//
// Every query using these must join bookings AND payments; the conditions
// reference both tables.
//
// Each SQL predicate has a plain-function twin below it, which is the same
// rule over one row. The SQL is what the queries run; the twin is what the
// unit tests pin (discounts.predicates.test.ts), and the test also checks the
// SQL still names every column the twin reads. Change one, change both.

import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { bookings, payments } from '../../db/schema.js'

/** The facts about one redemption's booking that decide whether it counts. */
export interface RedemptionRow {
  bookingStatus: string
  noShow: 'customer' | 'garage' | null
  paymentStatus: string
}

/**
 * **Held** — counts against a usage limit.
 *
 * A customer who holds a live booking bought with a code has used that code,
 * whether or not the money has landed yet. Anything else is exploitable: the
 * redemption row and the `pending` payment are written in the same
 * transaction, so a predicate that waits for `paid` is false for every
 * in-flight booking. A customer could open N bookings with a once-per-customer
 * code, pass the check every time because none had been paid, and then pay for
 * all N.
 *
 * Cancelling the booking releases the allowance, and so does a refund. A
 * `failed` payment does not: the booking is still live and still discounted,
 * and the customer can retry payment from the booking detail screen — so it
 * keeps holding the code until it is actually cancelled.
 *
 * The one cancellation that does not give the use back is a customer no-show
 * (owner decision): the customer booked the slot with the code, the garage
 * held it, and Detlio kept the payment. Releasing the use would let the same
 * customer book with it again for a slot they also walked away from.
 */
export const DISCOUNT_HELD = or(
  and(ne(bookings.status, 'cancelled'), ne(payments.status, 'refunded')),
  eq(bookings.noShow, 'customer')
)

export function isRedemptionHeld(row: RedemptionRow): boolean {
  if (row.noShow === 'customer') return true
  return row.bookingStatus !== 'cancelled' && row.paymentStatus !== 'refunded'
}

/**
 * **Realized** — money actually saved, for admin reporting only.
 *
 * Never use this for a limit check (see above). `collected` is here because
 * `markCompleted` settles a cash booking to `collected`, never `paid`, and the
 * vendor-facing earnings math in web/lib/vendor-stats.ts has always counted
 * both. New bookings are online-only, so this only reaches legacy cash rows —
 * but the two halves of the codebase should agree on what "settled" means.
 *
 * A customer no-show counts here too: the discounted price was paid and kept,
 * and the garage is paid as if the job happened (lib/earnings.ts), so the
 * saving was as real as on a finished job.
 */
export const DISCOUNT_REALIZED = and(
  or(ne(bookings.status, 'cancelled'), eq(bookings.noShow, 'customer')),
  inArray(payments.status, ['paid', 'collected'])
)

export function isRedemptionRealized(row: RedemptionRow): boolean {
  const settled = row.paymentStatus === 'paid' || row.paymentStatus === 'collected'
  return settled && (row.bookingStatus !== 'cancelled' || row.noShow === 'customer')
}
