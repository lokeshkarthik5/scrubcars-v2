import { straightLineKm } from './service-city.js'

/**
 * Cities (0069): which city a garage belongs to, whether customers see the
 * garages there, and how far "All over <city>" reaches.
 *
 * The owner asked for two things (10 Nov 2026): to switch a whole city on or
 * off for customers, so a garage in a town Detlio is not ready for can be
 * onboarded and kept out of sight, and to let a doorstep or pickup garage say
 * it comes anywhere in its city instead of naming a radius. Both need the same
 * answer first: which city is this garage in. The rule is cityOfGarage here,
 * from the garage's pin (or, with no pin, its own city field). The database
 * applies the same rule and stores the answer in vendors.city_id: a trigger
 * on every garage write that touches the pin or the city field, and a
 * recompute of every garage on any change to `cities`
 * (drizzle/0069_cities_reach.sql, garage_city_of). Reads go by that stored
 * id (cityById, storedWholeCity, cityStanding), so the lists and the admin
 * screens agree on one answer; cityOfGarage stays the definition, unit-tested
 * here and checked against the database's choice end to end
 * (apps/e2e/specs/platform/garage-city.spec.ts).
 *
 * Nothing here changes what customers see by default: Chennai is seeded with
 * its switch on, and a garage in no city ("Other towns") is shown unless
 * admin turns that off.
 *
 * Pure, so every rule is unit-tested without a database (cities.test.ts).
 * The SQL that reads the stored city for every garage at once is in
 * modules/vendors/vendors.predicates.ts (CITY_SHOWN and its helpers), and
 * the words and limits the screens show are twinned in
 * packages/core/src/cities.ts (cities.parity.test.ts).
 */

/** A city's reach from its centre, in km, as admin may set it. */
export const CITY_REACH_MIN_KM = 1
export const CITY_REACH_MAX_KM = 300
/** A new city's reach when admin does not say: Chennai's 50 km. */
export const DEFAULT_CITY_REACH_KM = 50
/** `cities.name` is varchar(100); a city's name is at least two letters. */
export const CITY_NAME_MIN = 2
export const CITY_NAME_MAX = 100

/** What every screen calls the garages that are in no city. */
export const OTHER_TOWNS_LABEL = 'Other towns'

/** The admin_settings key for the Other towns switch (absent = shown). */
export const OTHER_TOWNS_SETTING_KEY = 'other_towns_visible'

/** Where a city is and how far it reaches. */
export interface CityPlace {
  id: string
  name: string
  lat: number
  lng: number
  reachKm: number
}

/** A city with its "Customers see garages here" switch. */
export interface City extends CityPlace {
  customersSee: boolean
}

/** The garage facts that decide its city. */
export interface GaragePlace {
  lat: number | null
  lng: number | null
  city: string | null
}

/**
 * A city name as compared: trimmed and in lower case, so "chennai " and
 * "CHENNAI" are the same city. Madras is Chennai's old name and still how
 * some garages write it, so it reads as Chennai. The SQL twin is
 * CITY_NAME_KEY in vendors.predicates.ts.
 */
export function cityNameKey(name: string | null | undefined): string {
  const key = (name ?? '').trim().toLowerCase()
  return key === 'madras' ? 'chennai' : key
}

function pinned(garage: GaragePlace): garage is GaragePlace & { lat: number; lng: number } {
  return (
    garage.lat !== null &&
    garage.lng !== null &&
    Number.isFinite(garage.lat) &&
    Number.isFinite(garage.lng)
  )
}

/**
 * The garage's city.
 *
 * With a pin: among the cities whose reach (straight-line km from the
 * centre) holds the pin, the one with the nearest centre, so a garage
 * between two overlapping cities belongs to the closer one. A pin outside
 * every city is in none, whatever its city field says: the pin is what
 * customers find it by.
 *
 * With no pin: the city whose name matches the garage's own city field
 * (cityNameKey), else none. An unpinned garage is never doorstep or pickup
 * (both need a pin), so this only decides whether it is listed.
 *
 * Ties on distance (two cities with the same centre) go to the name first in
 * the alphabet, as the SQL orders them.
 */
export function cityOfGarage<C extends CityPlace>(garage: GaragePlace, cities: readonly C[]): C | null {
  if (!pinned(garage)) {
    const key = cityNameKey(garage.city)
    if (key === '') return null
    return cities.find((city) => cityNameKey(city.name) === key) ?? null
  }
  let best: { city: C; km: number } | null = null
  for (const city of cities) {
    const km = straightLineKm({ lat: city.lat, lng: city.lng }, { lat: garage.lat, lng: garage.lng })
    if (km > city.reachKm) continue
    if (
      best === null ||
      km < best.km ||
      (km === best.km && city.name.localeCompare(best.city.name) < 0)
    ) {
      best = { city, km }
    }
  }
  return best?.city ?? null
}

/**
 * The city a garage's stored `vendors.city_id` names, or null for Other
 * towns. The database wrote that id by cityOfGarage's rule; this only looks
 * it up among the cities read with it.
 */
export function cityById<C extends CityPlace>(cityId: string | null, cities: readonly C[]): C | null {
  if (cityId === null) return null
  return cities.find((city) => city.id === cityId) ?? null
}

/**
 * wholeCityOf over the stored city: the garage's city, for a pinned garage
 * only. What the cards and the garage page say "All over <city>" covers, the
 * same city the SQL's doorstepCovers / pickupCovers read.
 */
export function storedWholeCity<C extends CityPlace>(
  garage: { lat: number | null; lng: number | null; cityId: string | null },
  cities: readonly C[]
): C | null {
  if (!pinned({ ...garage, city: null })) return null
  return cityById(garage.cityId, cities)
}

/**
 * Whether customers see garages in this place: the city's own switch, or,
 * for a garage in no city, the Other towns setting.
 */
export function placeShown(city: { customersSee: boolean } | null, otherTownsVisible: boolean): boolean {
  return city ? city.customersSee : otherTownsVisible
}

/**
 * The city half of "listed to customers": the place is shown, or admin
 * ticked "Show this garage anyway" (`show_when_city_off`) for this garage.
 * The rest of the rule (Active, shown to customers, not paused, not in the
 * Bin) is isListedToCustomers in vendors.predicates.ts, which calls this.
 */
export function cityLetsCustomersSee(row: { showWhenCityOff: boolean; cityShown: boolean }): boolean {
  return row.showWhenCityOff || row.cityShown
}

/** What admin is told about a garage's city: its name, the switch, and why it hides the garage. */
export interface GarageCityStanding {
  city: { id: string; name: string } | null
  /** The place's switch (the city's, or Other towns'). */
  cityShown: boolean
  /**
   * Why the city keeps this garage from customers, in admin's words, or null
   * when it does not (the place is on, or "Show this garage anyway" is on).
   */
  hiddenReason: string | null
}

/**
 * The garage's city and what it means for customers, for the admin list and
 * the garage's edit page: "Its city, Tirupur, is off for customers", or
 * "Other towns are off for customers".
 */
export function garageCityStanding(
  garage: GaragePlace & { showWhenCityOff: boolean },
  cities: readonly City[],
  otherTownsVisible: boolean
): GarageCityStanding {
  return cityStanding(cityOfGarage(garage, cities), garage.showWhenCityOff, otherTownsVisible)
}

/**
 * The same standing for a city already known: the garage's stored city
 * (cityById), which is how the server reads it (citiesService.rules()).
 */
export function cityStanding(city: City | null, showWhenCityOff: boolean, otherTownsVisible: boolean): GarageCityStanding {
  const cityShown = placeShown(city, otherTownsVisible)
  const hidden = !cityLetsCustomersSee({ showWhenCityOff, cityShown })
  return {
    city: city ? { id: city.id, name: city.name } : null,
    cityShown,
    hiddenReason: hidden ? cityOffReason(city?.name ?? null) : null,
  }
}

/** "Its city, Tirupur, is off for customers"; "Other towns are off for customers". */
export function cityOffReason(cityName: string | null): string {
  return cityName ? `Its city, ${cityName}, is off for customers` : `${OTHER_TOWNS_LABEL} are off for customers`
}

/**
 * The Other towns switch as stored (`admin_settings` 'other_towns_visible',
 * `{ visible: boolean }`). Absent, or anything but `visible: false`, is
 * shown: hiding garages is the one thing that must never happen by accident.
 */
export function parseOtherTownsVisible(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  return (value as Record<string, unknown>).visible !== false
}

// ─── All over the city ───────────────────────────────────────────────────────

/** Refused when a garage with no city turns "All over <city>" on. */
export const WHOLE_CITY_NEEDS_CITY = 'Pin the garage inside a city first'

/**
 * The city "All over <city>" would cover for this garage: the city its pin is
 * in. A garage with no pin has none, even if its city field names one: the
 * option only means something for a garage that travels from a pin, and the
 * refusal says so.
 */
export function wholeCityOf<C extends CityPlace>(garage: GaragePlace, cities: readonly C[]): C | null {
  if (!pinned(garage)) return null
  return cityOfGarage(garage, cities)
}

/**
 * Whether a whole-city garage reaches a point: the point is inside its
 * city's reach, measured from the city's centre (not from the garage). The
 * SQL twin is garageCityCovers in vendors.predicates.ts.
 */
export function cityCoversPoint(city: CityPlace, point: { lat: number; lng: number }): boolean {
  return straightLineKm({ lat: city.lat, lng: city.lng }, point) <= city.reachKm
}

export interface TravelReach {
  /** The garage's radius in km (null is the default). */
  radiusKm: number | null
  defaultKm: number
  wholeCity: boolean
}

/**
 * Whether a doorstep or pickup garage comes to a point, by its pin: all over
 * its city when it said so and has one, else its radius (or the default)
 * from its pin. A whole-city garage whose city went (deleted, or the pin
 * moved out) falls back to its radius rather than covering nothing. The
 * drawn doorstep area is the SQL's alone (PostGIS), and whole city wins over
 * it there too.
 */
export function reachesPoint(
  garage: GaragePlace & TravelReach,
  cities: readonly CityPlace[],
  point: { lat: number; lng: number }
): boolean {
  if (!pinned(garage)) return false
  if (garage.wholeCity) {
    const city = wholeCityOf(garage, cities)
    if (city) return cityCoversPoint(city, point)
  }
  return straightLineKm({ lat: garage.lat, lng: garage.lng }, point) <= (garage.radiusKm ?? garage.defaultKm)
}

// ─── Branches ────────────────────────────────────────────────────────────────

/** "Spark Car Care – Tirupur": a branch's suggested name. */
export function branchName(garageName: string, cityName: string): string {
  const town = cityName.trim()
  return town ? `${garageName.trim()} – ${town}` : garageName.trim()
}
