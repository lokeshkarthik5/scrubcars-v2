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

import { and, inArray, ne } from 'drizzle-orm'
import { bookings, payments } from '../../db/schema.js'

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
 */
export const DISCOUNT_HELD = and(
  ne(bookings.status, 'cancelled'),
  ne(payments.status, 'refunded')
)

/**
 * **Realized** — money actually saved, for admin reporting only.
 *
 * Never use this for a limit check (see above). `collected` is here because
 * `markCompleted` settles a cash booking to `collected`, never `paid`, and the
 * vendor-facing earnings math in web/lib/vendor-stats.ts has always counted
 * both. New bookings are online-only, so this only reaches legacy cash rows —
 * but the two halves of the codebase should agree on what "settled" means.
 */
export const DISCOUNT_REALIZED = and(
  ne(bookings.status, 'cancelled'),
  inArray(payments.status, ['paid', 'collected'])
)
