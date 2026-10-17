/**
 * The city the pilot serves, and the words for a garage outside it.
 *
 * Garages in other towns are part of the pilot, but nobody should book one
 * thinking it is in Chennai (owner decision, 2026-10-16). The server decides
 * which garages are outside (apps/server/src/lib/service-city.ts) and sends
 * `outsideServiceCity` on every public garage; this file only says it, the
 * same way on the card, the garage page and checkout. Calm and factual: where
 * the garage is, never a warning that something is wrong.
 *
 * The centre and the reach are a twin of the server's SERVICE_CITY, kept equal
 * by apps/server/src/lib/service-city.parity.test.ts. No imports, so that test
 * can load this file directly.
 */

export const SERVICE_CITY = {
  name: 'Chennai',
  /** Where the map opens before it knows anything (DEFAULT_CENTER is this). */
  centre: { lat: 13.0827, lng: 80.2707 },
  /**
   * The list's radius from a customer (LIST_RADIUS_KM on the server), and the
   * map's city mode's reach from the centre. Past it, a garage is outside.
   */
  radiusKm: 50,
} as const

/**
 * From the API: set on a pinned garage more than 50 km from the centre, and on
 * an unpinned one whose own city field names another town.
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

const km = (value: number) => value.toLocaleString('en-IN')

/** The chip on a garage card: "Outside Chennai · Sivakasi", or "Outside Chennai". */
export function outsideCityTag(outside: OutsideServiceCity): string {
  return outside.town
    ? `Outside ${SERVICE_CITY.name} · ${outside.town}`
    : `Outside ${SERVICE_CITY.name}`
}

/**
 * The garage page's line: "This garage is in Sivakasi, about 485 km from
 * Chennai." Straight-line km, hence "about", and never a drive time; with no
 * pin there is no distance, so just "This garage is in Sivakasi."
 *
 * With no town named, no figure either: that is a garage whose own city field
 * says Chennai, shown right above under a "Chennai" label, and a precise
 * "about 1,063 km" beside it would contradict the page (and is usually a pin
 * in the wrong place, which admin shows ops with the km). The same plain words
 * as checkout instead.
 */
export function outsideCityLine(outside: OutsideServiceCity): string {
  if (!outside.town) return `This garage is outside ${SERVICE_CITY.name}.`
  return outside.km === null
    ? `This garage is in ${outside.town}.`
    : `This garage is in ${outside.town}, about ${km(outside.km)} km from ${SERVICE_CITY.name}.`
}

/** Checkout's line beside Pay: "This garage is in Sivakasi, not Chennai." */
export function outsideCityCheckoutLine(outside: OutsideServiceCity): string {
  return outside.town
    ? `This garage is in ${outside.town}, not ${SERVICE_CITY.name}.`
    : `This garage is outside ${SERVICE_CITY.name}.`
}
