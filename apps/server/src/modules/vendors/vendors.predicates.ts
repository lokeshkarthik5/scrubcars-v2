// What "customers can find this garage" means, in one place.
//
// Cities (0069) added one condition: the garage's city (or Other towns) is
// switched on for customers, or admin ticked "Show this garage anyway".
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
import { cityLetsCustomersSee, OTHER_TOWNS_SETTING_KEY } from '../../lib/cities.js'
import { DEFAULT_DOORSTEP_RADIUS_KM } from '../../lib/doorstep.js'
import { DEFAULT_PICKUP_RADIUS_KM } from '../../lib/pickup.js'

/** The facts about a garage that decide whether customers can find it. */
export interface ListedRow {
  status: string
  isVerified: boolean
  bookingsPausedAt: Date | string | null
  deletedAt: Date | string | null
  /** "Show this garage anyway" (0069): shown even while its city is off. */
  showWhenCityOff: boolean
  /**
   * Whether customers see garages in this garage's place (0069): its city's
   * "Customers see garages here", or the Other towns setting for a garage in
   * no city, read by the garage's stored city_id (citiesService.rules()
   * standingOf); the SQL is CITY_SHOWN below.
   */
  cityShown: boolean
}

// ─── Cities (0069) ───────────────────────────────────────────────────────────
//
// The garage's city is stored in `v.city_id` (NULL = Other towns) and kept
// right by the database (triggers in drizzle/0069_cities_reach.sql, by
// lib/cities.ts cityOfGarage's rule). Everything below reads it by primary
// key, never by searching the cities per row: a nearest-centre search in
// every row's subquery is what made the customer list take seconds on
// PostgreSQL 16 (PR #122's CI). The Other towns switch is an uncorrelated
// subquery, so it is read once per query (an InitPlan). Aliases `cty` and
// `ots` are used so they cannot shadow anything the outer query names.

/** One value of the garage's city (an expression over `cty`), by its stored id; NULL in no city. */
function garageCityValue(expression: SQL, options: { pinnedOnly?: boolean } = {}): SQL {
  const pinned = options.pinnedOnly ? sql` AND v.geo IS NOT NULL` : sql``
  return sql`(SELECT ${expression} FROM cities cty WHERE cty.id = v.city_id${pinned})`
}

/** The garage's city's id, or NULL for Other towns. Against the alias `v`. */
export const GARAGE_CITY_ID = sql`v.city_id`

/** The Other towns switch (admin_settings), shown unless set to `visible: false`. Uncorrelated: one read a query. */
const OTHER_TOWNS_VISIBLE = sql`COALESCE((SELECT (ots.value->>'visible')::boolean FROM admin_settings ots WHERE ots.key = ${sql.raw(`'${OTHER_TOWNS_SETTING_KEY}'`)}), true)`

/**
 * **The city lets customers see this garage** (0069): admin ticked "Show this
 * garage anyway", or its place is on — its city's "Customers see garages
 * here", or, in no city, the Other towns switch. The row twin is
 * cityLetsCustomersSee in lib/cities.ts. Against the alias `v`.
 */
export const CITY_SHOWN = sql`(v.show_when_city_off OR COALESCE(${garageCityValue(sql`cty.customers_see`)}, ${OTHER_TOWNS_VISIBLE}))`

/**
 * Whether the point is inside the garage's city, for "All over <city>"
 * (lib/cities.ts cityCoversPoint): measured from the city's centre. NULL
 * when the garage is unpinned or in no city, so a caller can fall back to
 * the garage's radius with COALESCE.
 */
export function garageCityCovers(point: SQL): SQL {
  return garageCityValue(sql`gis.ST_DWithin(cty.centre, ${point}, cty.reach_km * 1000, false)`, {
    pinnedOnly: true,
  })
}

/**
 * How far past its city's reach the point is, in metres (negative inside),
 * for a whole-city garage's "Just outside their area"; NULL with no city.
 */
export function garageCityOutsideM(point: SQL): SQL {
  return garageCityValue(sql`gis.ST_Distance(cty.centre, ${point}, false) - cty.reach_km * 1000`, {
    pinnedOnly: true,
  })
}

/**
 * Whether the garage is within the far-garage limit (0070, FAR_LIMIT_KM in
 * lib/discovery.ts) of a point (a geography): a pinned garage by its pin, one
 * with no pin by its city's centre when it is in a city, and true when it is
 * in none (where it is is not known, so it is not left out on a guess).
 * Sphere maths, as the list's radius. Against the alias `v`.
 */
export function withinFarLimit(from: SQL, limitM: number): SQL {
  return sql`(CASE WHEN v.geo IS NOT NULL THEN gis.ST_DWithin(v.geo, ${from}, ${limitM}, false)
    ELSE COALESCE(${garageCityValue(sql`gis.ST_DWithin(cty.centre, ${from}, ${limitM}, false)`)}, true) END)`
}

// ─── Who comes to the customer ───────────────────────────────────────────────

/**
 * Whether a doorstep garage comes to the point (a geography): all over its
 * city when it said so and has a city (0069, whole city wins over a drawn
 * area), else its drawn area when it has one, else its radius (or the
 * default, lib/doorstep.ts) from its pin. One rule for the Doorstep list, its
 * reach figures and "Just outside", Home, requests and the booking check
 * (bookingsRepository.isWithinDoorstepRadius), so a garage listed for an
 * address can always be booked to it. The row twin is reachesPoint in
 * lib/cities.ts (without the drawn area, which only PostGIS can read).
 * Against the alias `v`.
 */
export function doorstepCovers(point: SQL): SQL {
  return sql`COALESCE(CASE WHEN v.doorstep_whole_city THEN ${garageCityCovers(point)} END, CASE
    WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ${point})
    ELSE gis.ST_DWithin(v.geo, ${point}, COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000, false)
  END)`
}

/**
 * Whether a pickup garage collects from the point: all over its city when it
 * said so and has a city (0069), else its pickup radius (or the default,
 * lib/pickup.ts) from its pin. Every pickup check reads this, the booking's
 * included. Against the alias `v`.
 */
export function pickupCovers(point: SQL): SQL {
  return sql`COALESCE(CASE WHEN v.pickup_whole_city THEN ${garageCityCovers(point)} END, gis.ST_DWithin(v.geo, ${point}, COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000, false))`
}

/**
 * Whether "All over <city>" is what decides this garage's doorstep reach: on,
 * pinned, and it has a city (the foreign key keeps city_id pointing at one).
 */
const DOORSTEP_WHOLE_CITY_APPLIES = sql`(v.doorstep_whole_city AND v.geo IS NOT NULL AND v.city_id IS NOT NULL)`

/** The same for pickup & drop. */
const PICKUP_WHOLE_CITY_APPLIES = sql`(v.pickup_whole_city AND v.geo IS NOT NULL AND v.city_id IS NOT NULL)`

/** One mode's reach measured against a point, for "Just outside" and requests. */
export interface TravelReachSql {
  /** The garage comes to the point (doorstepCovers / pickupCovers). */
  covers: SQL
  /**
   * How far past its reach the point is, in metres on the sphere (≤ 0 when
   * it covers): from its pin past its radius, from its drawn area, or for a
   * whole-city garage from its city's centre past the city's reach.
   */
  outsideM: SQL
  /**
   * Its radius in km, or NULL when it has no single radius from its pin (a
   * drawn doorstep area, or all over its city).
   */
  coverKm: SQL
}

/** The doorstep reach of `v` against the point. */
export function doorstepReach(point: SQL): TravelReachSql {
  return {
    covers: doorstepCovers(point),
    outsideM: sql`(CASE
      WHEN ${DOORSTEP_WHOLE_CITY_APPLIES} THEN ${garageCityOutsideM(point)}
      WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Distance(v.doorstep_area, ${point}, false)
      ELSE gis.ST_Distance(v.geo, ${point}, false) - COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000
    END)`,
    coverKm: sql`(CASE WHEN ${DOORSTEP_WHOLE_CITY_APPLIES} OR v.doorstep_area IS NOT NULL THEN NULL
      ELSE COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) END)`,
  }
}

/** The pickup reach of `v` against the point. */
export function pickupReach(point: SQL): TravelReachSql {
  return {
    covers: pickupCovers(point),
    outsideM: sql`(CASE
      WHEN ${PICKUP_WHOLE_CITY_APPLIES} THEN ${garageCityOutsideM(point)}
      ELSE gis.ST_Distance(v.geo, ${point}, false) - COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000
    END)`,
    coverKm: sql`(CASE WHEN ${PICKUP_WHOLE_CITY_APPLIES} THEN NULL
      ELSE COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) END)`,
  }
}

/**
 * **Listed to customers**: stage Active, verified by Detlio, not paused, not
 * in the Bin, and its city lets customers see it (0069, CITY_SHOWN).
 *
 * A paused garage takes no new bookings, so it is left out of every list a
 * customer browses — search and the map read this too. Its own page still
 * loads (findPublicVendorById does not filter on pause) and says why it
 * cannot be booked. A garage in the Bin has no page at all, and neither has
 * one whose city is off: to a customer it is not on Detlio yet.
 *
 * Written against the alias `v`: every query that uses it reads
 * `FROM vendors v`.
 */
export const LISTED_TO_CUSTOMERS = sql`(v.status = 'active' AND v.is_verified = true AND v.bookings_paused_at IS NULL AND v.deleted_at IS NULL AND ${CITY_SHOWN})`

export function isListedToCustomers(row: ListedRow): boolean {
  return (
    row.status === 'active' &&
    row.isVerified &&
    row.bookingsPausedAt == null &&
    row.deletedAt == null &&
    cityLetsCustomersSee(row)
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

/**
 * "Silver & above" (0063), against the alias `v`: garages whose medal
 * customers see is one of `tiers` (the switched-on ones of Silver and Gold,
 * tiersService.silverFilterTiers), never one whose medal admin hid. Gold is
 * CERTIFIED_GARAGE; a garage holding Silver or Gold shows Silver while Silver
 * is on (lib/tiers.ts shownTier). The garage list, the reach figures and
 * "Just outside" all filter with this one condition.
 */
export function silverAndAboveCondition(tiers: ReadonlyArray<'silver' | 'gold'>) {
  return tiers.includes('silver')
    ? sql`(v.tier_hidden = false AND (${CERTIFIED_GARAGE} OR ${SILVER_GARAGE}))`
    : sql`(v.tier_hidden = false AND ${CERTIFIED_GARAGE})`
}

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
 * A garage whose page customers may open: Active, verified, not in the Bin,
 * and its city lets customers see it (0069). Unlike the lists it ignores
 * pause, so a paused garage's page still loads and says why it can't be
 * booked. The garage page and everything read off it (services, packages,
 * slots, hours, holidays) and the booking write all look a garage up
 * through this; a booking already made never does (its own reads go by the
 * booking), so it carries on when a city is switched off.
 */
export function vendorPageOpen(id: string): SQL {
  return and(eq(vendors.id, id), ...pageOpenConditions())!
}

/**
 * The same rule over every garage, for a read that joins `vendors` (the
 * customer's Saved garages): Active, verified, not in the Bin and its city
 * on, paused or not.
 */
export function vendorPagesOpen(): SQL {
  return and(...pageOpenConditions())!
}

/**
 * CITY_SHOWN for the Drizzle table rather than the alias `v`: the same SQL,
 * read for this row of `vendors` through a one-row subquery, so the rule is
 * never written twice.
 */
function cityShownForRow(): SQL {
  return sql`(SELECT ${CITY_SHOWN} FROM vendors v WHERE v.id = ${vendors.id})`
}

/**
 * A garage that still serves the bookings already made with it: Active,
 * verified and not in the Bin, whatever its city's switch (0069). Moving a
 * booking (the reschedule sheet's times, and the hours and holidays its
 * picker greys out) and booking a Detlio Guarantee redo read the garage
 * through this, so switching a city off never strands a
 * customer who booked before it went off. New bookings and the garage page
 * read vendorPageOpen.
 */
export function vendorOpenForItsBookings(id: string): SQL {
  return and(eq(vendors.id, id), ...baseOpenConditions())!
}

function baseOpenConditions(): SQL[] {
  return [eq(vendors.status, 'active'), eq(vendors.isVerified, true), vendorNotInBin()]
}

function pageOpenConditions(): SQL[] {
  return [...baseOpenConditions(), cityShownForRow()]
}
