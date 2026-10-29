// What "this review counts" means, in one place (0065, lib/ratings.ts).
//
// A review counts toward a score, a list, a tier or Statistics when its
// booking is not marked Test and admin has not hidden it. Every reader of a
// rating says so through one of the names below rather than restating it:
// the garage list and its "Top rated" sort, the garage page, the garage
// portal, Gold and Silver, Statistics, and the public review list. The
// plain-function twin is isCountedReview in lib/ratings.ts, pinned to this by
// reviews.predicates.test.ts. Change one, change both.

import { and, isNull, sql, type SQL } from 'drizzle-orm'
import { reviews } from '../../db/schema.js'

/**
 * Raw SQL over the alias `r` (`FROM reviews r`). The booking is looked up by
 * its own key, so it cannot fan a grouped query's rows out.
 */
export const COUNTED_REVIEW = sql`(r.hidden_at IS NULL AND NOT EXISTS (SELECT 1 FROM bookings counted_b WHERE counted_b.id = r.booking_id AND counted_b.marked_test_at IS NOT NULL))`

/** The same rule for Drizzle, over the `reviews` table itself. */
export function countedReview(): SQL {
  return and(
    isNull(reviews.hiddenAt),
    sql`NOT EXISTS (SELECT 1 FROM bookings counted_b WHERE counted_b.id = ${reviews.bookingId} AND counted_b.marked_test_at IS NOT NULL)`
  )!
}
