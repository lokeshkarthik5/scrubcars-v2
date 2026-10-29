import { CITY_REACH_KM } from './discovery.js'

/**
 * The city the pilot serves, and how a garage outside it is told apart.
 *
 * Garages in other towns are part of the pilot (owner decision, 2026-10-16:
 * live today in Sivakasi, Rajapalayam and Tirupur), but a customer must never
 * book one thinking it is in Chennai. So every public garage carries
 * `outsideServiceCity`, and the customer app says it on the card, on the
 * garage page and at checkout. It is a sign, never a filter: nothing here
 * hides a garage or refuses a booking.
 *
 * Pure, so the rule is unit-tested without a database (service-city.test.ts).
 */

/**
 * Chennai, measured from the same point the customer map's city mode uses
 * (DEFAULT_CENTER in packages/core/src/map.ts, through the twin in
 * packages/core/src/service-city.ts; service-city.parity.test.ts keeps the
 * two equal), and with the same reach as the list's radius. A garage the map
 * leaves off its city view is exactly a garage this calls outside.
 */
export const SERVICE_CITY = {
  name: 'Chennai',
  centre: { lat: 13.0827, lng: 80.2707 },
  radiusKm: CITY_REACH_KM,
} as const

export interface OutsideServiceCity {
  /**
   * The garage's town as it typed it (`vendors.city`), tidied; null when that
   * says Chennai or is empty, and the sign then reads just "Outside Chennai".
   */
  town: string | null
  /**
   * Straight-line km from the city centre, rounded to a whole km. Null for a
   * garage with no pin that is known to be elsewhere only from its own city
   * field: there is no distance to give.
   */
  km: number | null
}

/**
 * Kilometres between two points as the crow flies (haversine, 6371 km earth).
 * The same formula as straightLineKm in packages/core/src/map.ts, which the
 * map's city mode filters with, so a garage on the edge is in or out on both.
 */
export function straightLineKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Madras is Chennai's old name, and still how some people write it. Whole
// words, so "Chennai - Tambaram" counts and a town merely containing the
// letters would not.
const SERVICE_CITY_NAMES = /\b(chennai|madras)\b/i

/**
 * The town to name on the sign, from the free-text city a garage typed.
 *
 * Null when it names Chennai: a garage that says Chennai but is pinned more
 * than 50 km out is either in a far suburb or pinned wrongly, and "Outside
 * Chennai · Chennai" would say neither. All-capitals and all-lowercase entries
 * ("SIVAKASI", "tirupur") are put in title case, since the sign is a calm
 * line, not a shout; anything with mixed case is left as the garage wrote it.
 */
export function townName(city: string | null | undefined): string | null {
  const tidy = (city ?? '').replace(/\s+/g, ' ').trim()
  if (tidy === '' || SERVICE_CITY_NAMES.test(tidy)) return null
  if (tidy !== tidy.toLowerCase() && tidy !== tidy.toUpperCase()) return tidy
  return tidy
    .toLowerCase()
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_, gap: string, letter: string) => gap + letter.toUpperCase()
    )
}

// India Post's Chennai codes: every pincode in the city and its suburbs
// (Tambaram 600045, Avadi 600054, Poonamallee 600056) starts 600.
const SERVICE_CITY_PINCODE = /^\s*600\d{3}\s*$/

/**
 * Whether a garage is outside the service city, and how far out.
 *
 * With a pin, the pin decides: outside means strictly more than
 * SERVICE_CITY.radiusKm from the centre; exactly 50 km is still in, as on the
 * map. The distance is judged before rounding, so 50.4 km is outside even
 * though it reads "about 50 km".
 *
 * With no pin, the list still shows the garage (after the pinned ones, even
 * to a customer in Chennai), so a garage that says it is in another town must
 * carry the sign too, or it is exactly the one booked by mistake. Its own city
 * field is then the only thing known: it is outside when that names a town
 * other than Chennai, with no km, since there is nothing to measure from. Not
 * when its pincode is a Chennai one, though: a suburb typed as its own town
 * ("Tambaram", 600045) is in the city, and a false sign would turn customers
 * away. A garage with no pin whose city says Chennai, or is empty, carries no
 * sign: where it is is unknown, and a sign would be a guess.
 */
export function outsideServiceCity(garage: {
  lat: number | null
  lng: number | null
  city: string | null
  pincode?: string | null
}): OutsideServiceCity | null {
  const { lat, lng } = garage
  if (
    lat === null ||
    lng === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    const town = townName(garage.city)
    if (town === null || SERVICE_CITY_PINCODE.test(garage.pincode ?? '')) {
      return null
    }
    return { town, km: null }
  }
  const km = straightLineKm(SERVICE_CITY.centre, { lat, lng })
  if (km <= SERVICE_CITY.radiusKm) return null
  return { town: townName(garage.city), km: Math.round(km) }
}
