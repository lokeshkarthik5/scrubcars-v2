import { asc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { zones, type serviceCategoryEnum } from '../../db/schema.js'
import { DEFAULT_DOORSTEP_RADIUS_KM } from '../../lib/doorstep.js'
import { DEFAULT_PICKUP_RADIUS_KM } from '../../lib/pickup.js'
import { JUST_OUTSIDE_KM } from '../../lib/reach.js'
import {
  CERTIFIED_GARAGE,
  LISTED_TO_CUSTOMERS,
  PICKUP_OFFERED,
} from '../vendors/vendors.predicates.js'

type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number]
type Point = { lat: number; lng: number }

export type ZoneRecord = typeof zones.$inferSelect

/** The filters a list was asked with, which its reach figures follow too. */
export interface ReachFilters {
  category?: ServiceCategory
  certifiedOnly?: boolean
}

function geography(origin: Point) {
  return sql`gis.ST_SetSRID(gis.ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::gis.geography`
}

/** The list's own category and Certified filters (vendorsRepository.listPublicVendorPage). */
function filterConditions(filters: ReachFilters) {
  const conditions = [LISTED_TO_CUSTOMERS]
  if (filters.category) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM services s
       WHERE s.vendor_id = v.id AND s.is_active = true AND s.category = ${filters.category}
    )`)
  }
  if (filters.certifiedOnly) conditions.push(CERTIFIED_GARAGE)
  return conditions
}

/**
 * Whether a doorstep garage comes to the point: its drawn area when it has
 * one, else its radius (or the default) from its pin. The Doorstep list's
 * and the booking check's own rule (listPublicVendorPage,
 * bookingsRepository.isWithinDoorstepRadius), restated in SQL here only
 * because it is a condition inside a larger query.
 */
function doorstepCovers(point: ReturnType<typeof geography>) {
  return sql`(CASE
    WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ${point})
    ELSE gis.ST_DWithin(v.geo, ${point}, COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000, false)
  END)`
}

/** Whether a pickup garage collects from the point: its pickup radius from its pin. */
function pickupCovers(point: ReturnType<typeof geography>) {
  return sql`gis.ST_DWithin(v.geo, ${point}, COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000, false)`
}

/** A garage's "from" price: the card's own rule (computeStartingPrice), in SQL. */
const STARTING_PRICE = sql`(
  SELECT min(s.price) FROM services s
   WHERE s.vendor_id = v.id AND s.is_active = true AND s.price > 0
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
   * one, pinned or not.
   */
  async summary(origin: Point | undefined, filters: ReachFilters): Promise<ReachRow> {
    const point = origin ? geography(origin) : null
    const doorstep = point
      ? sql`(v.doorstep_enabled = true AND v.geo IS NOT NULL AND ${doorstepCovers(point)})`
      : sql`(v.doorstep_enabled = true AND v.geo IS NOT NULL)`
    const pickup = point
      ? sql`(${PICKUP_OFFERED} AND v.geo IS NOT NULL AND ${pickupCovers(point)})`
      : sql`(${PICKUP_OFFERED} AND v.geo IS NOT NULL)`
    const nearest = point
      ? sql`min(gis.ST_Distance(v.geo, ${point})) FILTER (WHERE v.dropin_enabled = true AND v.geo IS NOT NULL)`
      : sql`NULL::double precision`

    const [row] = await db.execute<ReachRow>(sql`
      SELECT
        count(*) FILTER (WHERE v.dropin_enabled = true) AS dropin_count,
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
   * `cover_km` is null for a doorstep garage with a drawn area (it has no
   * single radius).
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
    let cover
    let outside
    if (params.bookingType === 'doorstep') {
      conditions.push(sql`v.doorstep_enabled = true`)
      conditions.push(sql`NOT ${doorstepCovers(point)}`)
      conditions.push(sql`(CASE
        WHEN v.doorstep_area IS NOT NULL THEN gis.ST_DWithin(v.doorstep_area, ${point}, ${reachM}, false)
        ELSE gis.ST_DWithin(v.geo, ${point}, COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000 + ${reachM}, false)
      END)`)
      cover = sql`CASE WHEN v.doorstep_area IS NOT NULL THEN NULL
        ELSE COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) END`
      outside = sql`CASE
        WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Distance(v.doorstep_area, ${point}, false)
        ELSE gis.ST_Distance(v.geo, ${point}, false) - COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000
      END`
    } else {
      conditions.push(PICKUP_OFFERED)
      conditions.push(sql`NOT ${pickupCovers(point)}`)
      conditions.push(
        sql`gis.ST_DWithin(v.geo, ${point}, COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000 + ${reachM}, false)`
      )
      cover = sql`COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM})`
      outside = sql`gis.ST_Distance(v.geo, ${point}, false) - COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000`
    }

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
