/**
 * The city the pilot started in: where the map opens before it knows
 * anything, and the customer's city until `GET /cities` says otherwise
 * (FALLBACK_CITY in ./customer-city).
 *
 * The garage signs were words relative to Chennai built from
 * `outsideServiceCity` ("Outside Chennai · Sivakasi"). Since cities (0070)
 * they are relative to the customer's own city and place instead, and live
 * with it in ./customer-city (outsideCityTag, outsideCityLine): a garage in the
 * customer's city carries no sign at all. The server still sends
 * `outsideServiceCity`, which app builds from before read; the type stays
 * here for them.
 *
 * The centre and the reach are a twin of the server's SERVICE_CITY, kept equal
 * by apps/server/src/lib/service-city.parity.test.ts. No imports, so that test
 * can load this file directly.
 */

export const SERVICE_CITY = {
  name: 'Chennai',
  /** Where the map opens before it knows anything (DEFAULT_CENTER is this). */
  centre: { lat: 13.0827, lng: 80.2707 },
  /** The city's reach (CITY_REACH_KM on the server): the map's Nearby mode's reach. */
  radiusKm: 50,
} as const

/**
 * From the API: set on a pinned garage more than 50 km from Chennai's centre,
 * and on an unpinned one whose own city field names another town. The apps
 * read it only for a garage from an API older than `garageCity` (0070).
 */
export interface OutsideServiceCity {
  /** The garage's own town; null when its city field says Chennai. */
  town: string | null
  /**
   * Whole km from the centre, as the crow flies. Null for an unpinned garage,
   * known to be elsewhere only from its city field.
   */
  km: number | null
}

/**
 * Admin's garage list's chip (ops, not customers): "Outside Chennai ·
 * Sivakasi", or "Outside Chennai". Ops still read where a garage sits
 * against the city the pilot started in; customers see their own city's
 * signs instead (./customer-city).
 */
export function outsideServiceCityTag(outside: OutsideServiceCity): string {
  return outside.town ? `Outside ${SERVICE_CITY.name} · ${outside.town}` : `Outside ${SERVICE_CITY.name}`
}
