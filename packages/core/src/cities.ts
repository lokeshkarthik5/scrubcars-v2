/**
 * Cities (0069) for the apps: the words and limits the Cities page, the
 * garage editor and the travel-radius choice show. The rules are the
 * server's (apps/server/src/lib/cities.ts: which city a garage is in, who is
 * listed, how far "All over <city>" reaches); these are kept equal to it by
 * its cities.parity.test.ts.
 */

// Relative, not @repo/core/map: the server's parity test loads this file by
// path, outside the workspace's aliases.
import { straightLineKm } from './map'

/** A city's reach from its centre, in km, as admin may set it. */
export const CITY_REACH_MIN_KM = 1
export const CITY_REACH_MAX_KM = 300
/** A new city's reach when admin does not say. */
export const DEFAULT_CITY_REACH_KM = 50
export const CITY_NAME_MIN = 2
export const CITY_NAME_MAX = 100

/** What every screen calls the garages that are in no city. */
export const OTHER_TOWNS_LABEL = 'Other towns'

/** Refused when a garage with no city turns "All over <city>" on. */
export const WHOLE_CITY_NEEDS_CITY = 'Pin the garage inside a city first'

/**
 * A city name as compared: trimmed, lower case, Madras read as Chennai. The
 * server's own rule; the panel uses it to match a typed town to a city.
 */
export function cityNameKey(name: string | null | undefined): string {
  const key = (name ?? '').trim().toLowerCase()
  return key === 'madras' ? 'chennai' : key
}

/** "Its city, Tirupur, is off for customers"; "Other towns are off for customers". */
export function cityOffReason(cityName: string | null): string {
  return cityName ? `Its city, ${cityName}, is off for customers` : `${OTHER_TOWNS_LABEL} are off for customers`
}

/** "Spark Car Care – Tirupur": a branch's suggested name. */
export function branchName(garageName: string, cityName: string): string {
  const town = cityName.trim()
  return town ? `${garageName.trim()} – ${town}` : garageName.trim()
}

/** A city as the panel's lists carry it: where it is and how far it reaches. */
export interface CityPlace {
  id: string
  name: string
  lat: number
  lng: number
  reachKm: number
}

/**
 * The city a pinned garage is in, for "All over <city>": among the cities
 * whose reach holds the pin, the nearest centre (the name first in the
 * alphabet on a tie). Null with no pin or no such city. The server's own
 * rule (wholeCityOf in apps/server/src/lib/cities.ts, cities.parity.test.ts);
 * the panel uses it to name the choice before saving, and the server decides.
 */
export function cityOfPin<C extends CityPlace>(
  pin: { lat: number; lng: number } | null | undefined,
  cities: readonly C[]
): C | null {
  if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return null
  let best: { city: C; km: number } | null = null
  for (const city of cities) {
    const km = straightLineKm({ lat: city.lat, lng: city.lng }, pin)
    if (km > city.reachKm) continue
    if (best === null || km < best.km || (km === best.km && city.name.localeCompare(best.city.name) < 0)) {
      best = { city, km }
    }
  }
  return best?.city ?? null
}

// ─── The travel choice: "Up to N km" or "All over <city>" ────────────────────

/** The two answers to "How far do you go?", in the order every screen lists them. */
export type TravelChoice = 'radius' | 'whole_city'

/** "Up to 10 km": the radius answer, with the number the garage typed (or the default). */
export function travelRadiusLabel(km: number | null | undefined, defaultKm: number): string {
  const value = km ?? defaultKm
  return `Up to ${String(Number(value.toFixed(1)))} km`
}

/** "All over Chennai". */
export function wholeCityLabel(cityName: string): string {
  return `All over ${cityName}`
}

/** Under the whole-city answer when the garage has no city to cover. */
export const WHOLE_CITY_UNAVAILABLE = `${WHOLE_CITY_NEEDS_CITY} to offer this.`

/** "Comes anywhere in Chennai": the customer's line for a whole-city doorstep garage. */
export function comesAnywhereLine(cityName: string): string {
  return `Comes anywhere in ${cityName}`
}

/** "Collects anywhere in Chennai": the same for pickup & drop. */
export function collectsAnywhereLine(cityName: string): string {
  return `Collects anywhere in ${cityName}`
}

/** The city a whole-city garage covers, as public garage payloads carry it. */
export interface ReachCity {
  name: string
  lat: number
  lng: number
  reachKm: number
}

/**
 * Whether a point is inside a whole-city garage's city, as far as the app
 * can tell: straight-line km from the city's centre, with the same hair of
 * slack as the pickup radius check. The server's check is the one that
 * counts.
 */
export function insideReachCity(city: ReachCity, point: { lat: number; lng: number }): boolean {
  return straightLineKm({ lat: city.lat, lng: city.lng }, point) <= city.reachKm * 1.01
}
