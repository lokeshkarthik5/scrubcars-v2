import { asc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { zones, zoneSignups, type serviceCategoryEnum } from '../../db/schema.js'
import { JUST_OUTSIDE_KM } from '../../lib/reach.js'
import {
  doorstepCovers,
  doorstepReach,
  LISTED_TO_CUSTOMERS,
  PICKUP_OFFERED,
  pickupCovers,
  pickupReach,
  silverAndAboveCondition,
  LUXURY_SPECIALIST,
  withinFarLimit,
} from '../vendors/vendors.predicates.js'

type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]
type Point = { lat: number; lng: number }

export type ZoneRecord = typeof zones.$inferSelect

/** The filters a list was asked with, which its reach figures follow too. */
export interface ReachFilters {
  category?: ServiceCategory
  /** "Silver & above" (0063): the tiers it lets through; absent, every garage. */
  tiers?: Array<'silver' | 'gold'>
  /** "Luxury specialists" (0083): only garages showing the badge. */
  luxury?: boolean
}

function geography(origin: Point) {
  return sql`gis.ST_SetSRID(gis.ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::gis.geography`
}

/** The list's own category and "Silver & above" filters (vendorsRepository.listPublicVendorPage). */
function filterConditions(filters: ReachFilters) {
  const conditions = [LISTED_TO_CUSTOMERS]
  if (filters.category) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM services s
       WHERE s.vendor_id = v.id AND s.is_active = true AND s.is_addon = false AND s.category = ${filters.category}
    )`)
  }
  if (filters.tiers && filters.tiers.length > 0) conditions.push(silverAndAboveCondition(filters.tiers))
  if (filters.luxury) conditions.push(LUXURY_SPECIALIST)
  return conditions
}

/** A garage's "from" price: the card's own rule (computeStartingPrice), in SQL. */
const STARTING_PRICE = sql`(
  SELECT min(s.price) FROM services s
   WHERE s.vendor_id = v.id AND s.is_active = true AND s.is_addon = false AND s.price > 0
)`

export type ReachRow = {
  dropin_count: number | string
  dropin_nearest_m: number | string | null
  doorstep_count: number | string
  doorstep_from: number | string | null
  pickup_count: number | string
  pickup_from: number | string | null
}

export const reachRepository = {
  /** Every zone: the priority ones first, each group A–Z. */
  async listZones(): Promise<ZoneRecord[]> {
    return db.select().from(zones).orderBy(sql`${zones.priority} DESC`, asc(zones.name))
  },

  /** How many free-wash sign-ups each zone has (part 2), by zone id. */
  async signupCountsByZone(): Promise<Map<string, number>> {
    const rows = await db
      .select({ zoneId: zoneSignups.zoneId, count: sql<number>`count(*)::int` })
      .from(zoneSignups)
      .groupBy(zoneSignups.zoneId)
    return new Map(rows.map((row) => [row.zoneId, Number(row.count)]))
  },

  /** The pins of every garage customers can find (LISTED_TO_CUSTOMERS), for each zone's "has a garage". */
  async listListedGaragePins(): Promise<Array<{ lat: number; lng: number }>> {
    const rows = await db.execute<{ lat: number; lng: number }>(sql`
      SELECT v.lat, v.lng FROM vendors v
       WHERE ${LISTED_TO_CUSTOMERS} AND v.lat IS NOT NULL AND v.lng IS NOT NULL
    `)
    return Array.from(rows).map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) }))
  },

  /**
   * How many garages each tab offers this customer, in one read: At garage
   * (with the nearest one's distance), Doorstep and Pickup & drop (those that
   * come to them, with the lowest "from" price). The list's own rules, so a
   * count is exactly what that tab lists: with no origin, every pinned
   * doorstep or pickup garage (as the tab lists them), and every at-garage
   * one, pinned or not, within the far-garage limit when the list has one.
   */
  async summary(
    origin: Point | undefined,
    filters: ReachFilters,
    far?: { from: Point; limitM: number }
  ): Promise<ReachRow> {
    const point = origin ? geography(origin) : null
    // At garage counts what the list shows, so the far-garage limit (0070)
    // the list applies is applied here too.
    const dropin = far
      ? sql`(v.dropin_enabled = true AND ${withinFarLimit(geography(far.from), far.limitM)})`
      : sql`v.dropin_enabled = true`
    const doorstep = point
      ? sql`(v.doorstep_enabled = true AND v.geo IS NOT NULL AND ${doorstepCovers(point)})`
      : sql`(v.doorstep_enabled = true AND v.geo IS NOT NULL)`
    const pickup = point
      ? sql`(${PICKUP_OFFERED} AND v.geo IS NOT NULL AND ${pickupCovers(point)})`
      : sql`(${PICKUP_OFFERED} AND v.geo IS NOT NULL)`
    const nearest = point
      ? sql`min(gis.ST_Distance(v.geo, ${point})) FILTER (WHERE ${dropin} AND v.geo IS NOT NULL)`
      : sql`NULL::double precision`

    const [row] = await db.execute<ReachRow>(sql`
      SELECT
        count(*) FILTER (WHERE ${dropin}) AS dropin_count,
        ${nearest} AS dropin_nearest_m,
        count(*) FILTER (WHERE ${doorstep}) AS doorstep_count,
        min(${STARTING_PRICE}) FILTER (WHERE ${doorstep}) AS doorstep_from,
        count(*) FILTER (WHERE ${pickup}) AS pickup_count,
        min(${STARTING_PRICE}) FILTER (WHERE ${pickup}) AS pickup_from
        FROM vendors v
       WHERE ${sql.join(filterConditions(filters), sql` AND `)}
    `)
    return (
      row ?? {
        dropin_count: 0,
        dropin_nearest_m: null,
        doorstep_count: 0,
        doorstep_from: null,
        pickup_count: 0,
        pickup_from: null,
      }
    )
  },

  /**
   * "Just outside their area": garages of this booking type that do not come
   * to the customer but are within JUST_OUTSIDE_KM past their own reach
   * (lib/reach.ts), the closest to covering them first.
   *
   * `outside_m` is measured on the sphere, as the coverage tests are, so a
   * garage left out of the covering list always has a positive figure here.
   * `distance_m` is the spheroid distance the cards show everywhere else.
   * `cover_km` is null for a doorstep garage with a drawn area, and for a
   * garage that comes all over its city (0069): neither has a single radius
   * from its pin. A whole-city garage's `outside_m` is how far past its
   * city's reach the customer is, measured from the city's centre, as its
   * coverage is.
   */
  async listJustOutside(params: {
    origin: Point
    bookingType: 'doorstep' | 'pickup'
    filters: ReachFilters
    limit: number
  }): Promise<Array<{ id: string; distanceM: number; coverKm: number | null; outsideM: number }>> {
    const point = geography(params.origin)
    const reachM = JUST_OUTSIDE_KM * 1000
    const conditions = [...filterConditions(params.filters), sql`v.geo IS NOT NULL`]
    const reach = params.bookingType === 'doorstep' ? doorstepReach(point) : pickupReach(point)
    conditions.push(params.bookingType === 'doorstep' ? sql`v.doorstep_enabled = true` : PICKUP_OFFERED)
    conditions.push(sql`NOT ${reach.covers}`)
    // At most JUST_OUTSIDE_KM past its own reach, whichever reach that is.
    conditions.push(sql`${reach.outsideM} <= ${reachM}`)
    const cover = reach.coverKm
    const outside = reach.outsideM

    const rows = await db.execute<{
      id: string
      distance_m: number | string
      cover_km: number | string | null
      outside_m: number | string
    }>(sql`
      SELECT v.id,
             gis.ST_Distance(v.geo, ${point}) AS distance_m,
             ${cover} AS cover_km,
             ${outside} AS outside_m
        FROM vendors v
       WHERE ${sql.join(conditions, sql` AND `)}
       ORDER BY outside_m ASC, v.id ASC
       LIMIT ${params.limit}
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      distanceM: Number(row.distance_m),
      coverKm: row.cover_km === null ? null : Number(row.cover_km),
      outsideM: Number(row.outside_m),
    }))
  },
}
