import type { GeoPlace } from './api/geo'
import { zoneInCity, type CustomerCity } from './customer-city'

/**
 * Any place in the city, for the "Where's your car?" sheet (22 Nov 2026).
 * The sheet lists the city's drawn zones (25 in Chennai), and a customer in
 * Besant Nagar or Mogappair found nothing. Typing now also asks the address
 * search (GET /geo/autocomplete, the same one the address picker uses) and
 * lists real places under the zones; picking one works like an area: its
 * point, its name, no permission asked, distances shown with "~".
 */
export interface AreaPlace {
  /** The provider's id, or the label when it has none: a list key only. */
  id: string
  /** What the header shows once picked: "Besant Nagar". */
  name: string
  /** The line under it: "Elliot's Promenade, Odaimanagar". Empty when there is nothing more. */
  detail: string
  lat: number
  lng: number
}

/** Under this many letters the address search is not asked at all. */
export const PLACE_SEARCH_MIN = 3

/** How long typing must pause before the address search is asked. */
export const PLACE_SEARCH_DEBOUNCE_MS = 300

/** At most this many places are listed under the zones. */
export const PLACE_SEARCH_MAX = 6

// The tail every Indian label ends with, which says nothing in a city's own
// sheet: the city, the state, the country and the pincode.
const TAIL = /^(india|tamil nadu|\d{6})$/i

/**
 * A suggestion as a place to pick: its first part as the name, the next two
 * as the detail line, without door numbers or the city, state, country
 * or pincode. Null for
 * one with no coordinates (it cannot be measured from) or no name.
 */
export function areaPlaceOf(place: GeoPlace, cityName: string): AreaPlace | null {
  if (place.lat === null || place.lng === null) return null
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null
  const city = cityName.trim().toLowerCase()
  const parts = place.label
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !TAIL.test(p) && p.toLowerCase() !== city)
  const name = parts[0]
  if (!name) return null
  // Door numbers ("34", "51-T-10-A") say nothing to someone picking an area.
  const detail = parts
    .slice(1)
    .filter((p) => p.toLowerCase() !== name.toLowerCase() && !/\d/.test(p))
    .slice(0, 2)
    .join(', ')
  return { id: place.providerPlaceId ?? place.label, name, detail, lat: place.lat, lng: place.lng }
}

/**
 * The suggestions worth listing in a city's sheet: inside that city (as the
 * zones are, by cityHolding), each name once, not one of the zones already
 * listed above, and at most PLACE_SEARCH_MAX.
 */
export function areaPlacesIn(
  places: readonly GeoPlace[],
  city: CustomerCity,
  cities: readonly CustomerCity[],
  zoneNames: readonly string[] = []
): AreaPlace[] {
  const seen = new Set(zoneNames.map((n) => n.trim().toLowerCase()))
  const out: AreaPlace[] = []
  for (const place of places) {
    const area = areaPlaceOf(place, city.name)
    if (!area || !zoneInCity(area, city, cities)) continue
    const key = `${area.name.toLowerCase()}|${area.detail.toLowerCase()}`
    if (seen.has(area.name.toLowerCase()) && !area.detail) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(area)
    if (out.length >= PLACE_SEARCH_MAX) break
  }
  return out
}
