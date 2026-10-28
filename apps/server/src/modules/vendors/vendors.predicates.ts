// What "customers can find this garage" means, in one place.
//
// The customer lists (browse, search, the map, Home's Nearby) and the admin
// panel's "Live" both ask it. The panel used to work it out by reading three
// badges per card, which is how a paused or unverified garage got called live.
// The SQL is what the lists run; the plain-function twin below is the same
// rule over one row, for the admin list, and vendors.predicates.test.ts pins
// the two together. Change one, change both.
//
// The Bin (0034) lives here too. A garage in the Bin is off the app for
// everyone but admin: no list, no garage page, no booking, no team login.
// "In the Bin" is `deleted_at IS NOT NULL`, and every read that serves
// customers or the garage's team says so through one of the names below
// rather than restating it.

import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { vendors } from '../../db/schema.js'

/** The facts about a garage that decide whether customers can find it. */
export interface ListedRow {
  status: string
  isVerified: boolean
  bookingsPausedAt: Date | string | null
  deletedAt: Date | string | null
}

/**
 * **Listed to customers**: stage Active, verified by Detlio, not paused, and
 * not in the Bin.
 *
 * A paused garage takes no new bookings, so it is left out of every list a
 * customer browses — search and the map read this too. Its own page still
 * loads (findPublicVendorById does not filter on pause) and says why it
 * cannot be booked. A garage in the Bin has no page at all.
 *
 * Written against the alias `v`: every query that uses it reads
 * `FROM vendors v`.
 */
export const LISTED_TO_CUSTOMERS = sql`(v.status = 'active' AND v.is_verified = true AND v.bookings_paused_at IS NULL AND v.deleted_at IS NULL)`

export function isListedToCustomers(row: ListedRow): boolean {
  return (
    row.status === 'active' &&
    row.isVerified &&
    row.bookingsPausedAt == null &&
    row.deletedAt == null
  )
}

// ─── Pickup & drop ───────────────────────────────────────────────────────────

/**
 * **Offers pickup & drop** (0037): said yes ('nearby', an older onboarding
 * answer, counts) and the responsibility terms are on file. Against the
 * alias `v`. The row twin is isPickupOffered in lib/pickup.ts, pinned to
 * this by vendors.predicates.test.ts. Change one, change both.
 */
export const PICKUP_OFFERED = sql`(v.pickup IN ('yes', 'nearby') AND v.pickup_terms_accepted_at IS NOT NULL)`

// ─── Gold and Silver ─────────────────────────────────────────────────────────

/**
 * **Gold** (Detlio Certified, 0048): an admin awarded it and it has not been
 * revoked or lost since. Against the alias `v`, for the customer lists'
 * "Silver & above". The row twin is isCertified in lib/certification.ts,
 * pinned to this by vendors.predicates.test.ts. Change one, change both.
 */
export const CERTIFIED_GARAGE = sql`EXISTS (SELECT 1 FROM vendor_certifications vc WHERE vc.vendor_id = v.id AND vc.certified_at IS NOT NULL AND vc.revoked_at IS NULL)`

/**
 * **Silver** (0063): the nightly run gave it and has not taken it away.
 * Against the alias `v`. The row twin is holdsSilver in lib/tiers.ts, pinned
 * to this by vendors.predicates.test.ts. Change one, change both.
 */
export const SILVER_GARAGE = sql`EXISTS (SELECT 1 FROM vendor_tier_standings ts WHERE ts.vendor_id = v.id AND ts.silver_at IS NOT NULL)`

// ─── The Bin ─────────────────────────────────────────────────────────────────

/** In the Bin: moved there by admin, and not restored. */
export function isInBin(row: { deletedAt: Date | string | null }): boolean {
  return row.deletedAt != null
}

/** Not in the Bin, against the alias `v`, for raw SQL over `FROM vendors v`. */
export const NOT_IN_BIN = sql`v.deleted_at IS NULL`

/** Not in the Bin, as a Drizzle condition on the vendors table. */
export function vendorNotInBin(): SQL {
  return isNull(vendors.deletedAt)
}

/**
 * A garage whose page customers may open: Active, verified and not in the
 * Bin. Unlike the lists it ignores pause, so a paused garage's page still
 * loads and says why it can't be booked. The garage page and everything
 * read off it (services, packages, slots, hours, holidays) and the booking
 * write all look a garage up through this.
 */
export function vendorPageOpen(id: string): SQL {
  return and(eq(vendors.id, id), ...pageOpenConditions())!
}

/**
 * The same rule over every garage, for a read that joins `vendors` (the
 * customer's Saved garages): Active, verified and not in the Bin, paused or
 * not.
 */
export function vendorPagesOpen(): SQL {
  return and(...pageOpenConditions())!
}

function pageOpenConditions(): SQL[] {
  return [eq(vendors.status, 'active'), eq(vendors.isVerified, true), vendorNotInBin()]
}
