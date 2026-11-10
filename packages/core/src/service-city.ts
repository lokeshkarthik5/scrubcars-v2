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
   * The city's reach (CITY_REACH_KM on the server): the map's city mode's
   * and Nearby mode's reach. Past it from the centre, a garage is outside.
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

/** What the "near you" count and the "Further away" line need from a garage. */
interface PlacedGarage {
  distanceKm: number | null
  outsideServiceCity?: OutsideServiceCity | null
}

/**
 * Whether a garage counts as near the customer: within the city's reach of
 * them (50 km) once they have shared where they are, or inside the city when
 * they have not. A garage in another town (387 km away in Tirupur, say) is
 * still listed, nearest first, but is never part of "5 garages near you".
 */
export function isNearCustomer(garage: PlacedGarage, located: boolean): boolean {
  if (located) return garage.distanceKm !== null && garage.distanceKm <= SERVICE_CITY.radiusKm
  return !garage.outsideServiceCity
}

/**
 * "5 garages near you" / "5 garages in Chennai": how many of the loaded
 * garages are near, and whether more near ones may be on a page not loaded
 * yet (the "+"). On a nearest-first list that has already reached a garage
 * past the reach, or the tail with no pin, every near garage is loaded, so
 * there is no "+" however long the list goes on.
 */
export function nearGarageCount(
  garages: readonly PlacedGarage[],
  options: { located: boolean; hasMore: boolean; nearestFirst: boolean }
): { count: number; more: boolean } {
  const count = garages.filter((g) => isNearCustomer(g, options.located)).length
  const last = garages[garages.length - 1]
  const pastTheNear =
    options.located &&
    options.nearestFirst &&
    last !== undefined &&
    (last.distanceKm === null || last.distanceKm > SERVICE_CITY.radiusKm)
  return { count, more: options.hasMore && !pastTheNear }
}

/**
 * Where a nearest-first list crosses from near garages to far ones, for the
 * "Further away" line above the first far card; -1 when there is no such
 * point (no location, another sort, or nothing far). Garages with no pin
 * have their own line and are not "far".
 */
export function firstFarIndex(
  garages: readonly PlacedGarage[],
  options: { located: boolean; nearestFirst: boolean }
): number {
  if (!options.located || !options.nearestFirst) return -1
  return garages.findIndex((g) => g.distanceKm !== null && g.distanceKm > SERVICE_CITY.radiusKm)
}
