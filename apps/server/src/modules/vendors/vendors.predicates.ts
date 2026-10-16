// What "customers can find this garage" means, in one place.
//
// The customer lists (browse, search, the map, Home's Nearby) and the admin
// panel's "Live" both ask it. The panel used to work it out by reading three
// badges per card, which is how a paused or unverified garage got called live.
// The SQL is what the lists run; the plain-function twin below is the same
// rule over one row, for the admin list, and vendors.predicates.test.ts pins
// the two together. Change one, change both.

import { sql } from 'drizzle-orm'

/** The facts about a garage that decide whether customers can find it. */
export interface ListedRow {
  status: string
  isVerified: boolean
  bookingsPausedAt: Date | string | null
}

/**
 * **Listed to customers**: stage Active, verified by Detlio, and not paused.
 *
 * A paused garage takes no new bookings, so it is left out of every list a
 * customer browses — search and the map read this too. Its own page still
 * loads (findPublicVendorById does not filter on pause) and says why it
 * cannot be booked.
 *
 * Written against the alias `v`: every query that uses it reads
 * `FROM vendors v`.
 */
export const LISTED_TO_CUSTOMERS = sql`(v.status = 'active' AND v.is_verified = true AND v.bookings_paused_at IS NULL)`

export function isListedToCustomers(row: ListedRow): boolean {
  return row.status === 'active' && row.isVerified && row.bookingsPausedAt == null
}
