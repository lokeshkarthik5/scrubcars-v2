/**
 * The customer's city (0070): which of the cities Detlio serves the customer
 * is browsing, for the city chip, the "Where's your car?" sheet, the garage
 * signs, the small-city view and the free-wash card.
 *
 * The cities come from `GET /cities` (only those switched on for customers,
 * the default first). The customer's city is the one whose reach holds where
 * they are: a phone fix, an address, an area's centre, or a whole city they
 * picked. With no place, or a place outside every city, it is the first city
 * (Chennai, while it is on), so nobody is ever without one.
 *
 * Which city holds a point is the server's nearest-city rule (cityOfGarage in
 * apps/server/src/lib/cities.ts, here through cityOfPin), and the far-garage
 * limit is the server's too; cities.parity.test.ts keeps them equal. Relative
 * imports only, so that test can load this file by path.
 */
import { cityNameKey, cityOfPin } from './cities'
import { driveMinutes } from './drive-time'
import { t, type Translate } from './i18n/translate'
import { straightLineKm } from './map'
import { SERVICE_CITY, type OutsideServiceCity } from './service-city'

/**
 * How far away a garage may be and still be in the list without a search,
 * in km: the server's FAR_LIMIT_KM (apps/server/src/lib/discovery.ts), which
 * leaves them out. The apps only name it.
 */
export const FAR_LIMIT_KM = 150

/**
 * A city with fewer garages than this is a small city (owner, 10 Nov 2026):
 * no counts anywhere, so nobody reads a lonely "1 garage", and one quiet way
 * to recommend a garage instead. From this many up, counts come back.
 */
export const SMALL_CITY_GARAGES = 3

/** A city as the customer apps read it (`GET /cities`). */
export interface CustomerCity {
  id: string
  name: string
  centre: { lat: number; lng: number }
  reachKm: number
  /** "Growing here": the owner is bringing more garages, so the free-wash card shows. */
  growing: boolean
  /**
   * Garages customers can find in the city. Null only for the stand-in
   * below, before the API has answered: unknown, so never a small city.
   */
  garageCount: number | null
}

/**
 * Chennai as the app knows it before `GET /cities` answers (or from an API
 * without the route): the service city, growing, count unknown. So a first
 * render, and an old API, look exactly as the app did before cities.
 */
export const FALLBACK_CITY: CustomerCity = {
  id: 'service-city',
  name: SERVICE_CITY.name,
  centre: { lat: SERVICE_CITY.centre.lat, lng: SERVICE_CITY.centre.lng },
  reachKm: SERVICE_CITY.radiusKm,
  growing: true,
  garageCount: null,
}

/** What the rule needs from the customer's stored place (the location store's ActiveLocation). */
export interface CityLocation {
  lat: number
  lng: number
  source: 'gps' | 'address' | 'manual' | 'area'
  /** Set on a whole city picked in the sheet (selectCity). */
  cityId?: string
}

/** The cities to choose from: the API's, or the stand-in while there are none. */
export function citiesOrFallback(cities: readonly CustomerCity[] | null | undefined): readonly CustomerCity[] {
  return cities && cities.length > 0 ? cities : [FALLBACK_CITY]
}

/**
 * The city whose reach holds a point, the nearest centre when two do (name
 * first in the alphabet on a tie): the server's rule. Null outside them all.
 */
export function cityHolding(
  point: { lat: number; lng: number },
  cities: readonly CustomerCity[]
): CustomerCity | null {
  const held = cityOfPin(
    point,
    cities.map((city) => ({ id: city.id, name: city.name, lat: city.centre.lat, lng: city.centre.lng, reachKm: city.reachKm }))
  )
  return held ? (cities.find((city) => city.id === held.id) ?? null) : null
}

/**
 * The customer's city.
 *
 * A whole city picked in the sheet is that city, while it is still on. An
 * "All of Chennai" kept from before cities (a `manual` place with no city)
 * is Chennai. Any other place is the city whose reach holds it. Otherwise,
 * and with no place at all, the first city.
 */
export function customerCityOf(
  location: CityLocation | null | undefined,
  cities: readonly CustomerCity[] | null | undefined
): CustomerCity {
  const list = citiesOrFallback(cities)
  const first = list[0]!
  if (!location) return first
  if (location.source === 'manual') {
    const picked = location.cityId
      ? list.find((city) => city.id === location.cityId)
      : list.find((city) => cityNameKey(city.name) === cityNameKey(SERVICE_CITY.name))
    if (picked) return picked
  }
  return cityHolding(location, list) ?? first
}

/** Fewer than three garages customers can find: no counts, and the recommend row (mockup D). */
export function isSmallCity(city: CustomerCity): boolean {
  return city.garageCount !== null && city.garageCount < SMALL_CITY_GARAGES
}

/**
 * Where the customer is, for distances: their own place when they shared
 * one, and null for a whole city (or nothing), which is no place anyone
 * stands. The garage signs then measure from the city's centre and say so
 * ("about 480 km from Coimbatore").
 */
export function customerPoint(location: CityLocation | null | undefined): { lat: number; lng: number } | null {
  if (!location || location.source === 'manual') return null
  return { lat: location.lat, lng: location.lng }
}

/**
 * The city chip's accessible name: "Your city: Coimbatore. Change", or, with
 * an area or a place picked, "Your area: RS Puram, Coimbatore. Change".
 */
export function cityChipName(city: CustomerCity, area: string | null): string {
  return area
    ? t('Your area: {area}, {city}. Change', { area, city: city.name })
    : t('Your city: {city}. Change', { city: city.name })
}

/**
 * The city switch's quiet line in the sheet: "42 garages", or nothing for a
 * small city (no lonely "1 garage") or a count not known yet.
 */
export function cityGaragesLine(city: CustomerCity): string | null {
  if (city.garageCount === null || isSmallCity(city)) return null
  return t('{count} garages', { count: city.garageCount.toLocaleString('en-IN') })
}

/** The cities' switch takes up to three; from four, the sheet lists them as rows. */
export const CITY_SWITCH_MAX = 3

/** "Know a great garage in Madurai? Recommend it": the small city's one quiet row. */
export function recommendRowText(city: CustomerCity): { ask: string; action: string } {
  return { ask: t('Know a great garage in {city}?', { city: city.name }), action: t('Recommend it') }
}

/** The map strip's words for a small city: "Detlio in Madurai", never a count. */
export function detlioInLine(city: CustomerCity): string {
  return t('Detlio in {city}', { city: city.name })
}

/** The list heading for a small city: "In Madurai". */
export function inCityHeading(city: CustomerCity): string {
  return t('In {city}', { city: city.name })
}

/**
 * Whether one of the sheet's areas is in the city: its centre is held by
 * this city (by the same rule, so an area between two overlapping cities is
 * listed under the nearer one only).
 */
export function zoneInCity(
  zone: { lat: number; lng: number },
  city: CustomerCity,
  cities: readonly CustomerCity[]
): boolean {
  return cityHolding(zone, citiesOrFallback(cities))?.id === city.id
}

// ─── A garage in another town ────────────────────────────────────────────────
//
// Garages in other towns are listed and bookable, but nobody should book one
// thinking it is round the corner (owner decision, 2026-10-16). Since cities
// (0070) the sign is relative to the customer: a garage in their own city
// carries none at all ("Outside Chennai should not actually show", owner,
// 10 Nov 2026), and one elsewhere says its town and how far it is from them.
// Calm and factual: where the garage is, never a warning.

/** What the signs need from the customer: their city, and where they are when they shared a place. */
export interface CustomerPlace {
  city: CustomerCity
  /** Their own place (customerPoint); null for a whole city or none, measured from the city's centre then. */
  at: { lat: number; lng: number } | null
}

/** What the signs need from a garage (a list card or the garage page). */
export interface PlacedGarage {
  lat: number | null
  lng: number | null
  /** The town the garage typed (`city` in the API, Vendor.area). */
  area?: string | null
  /**
   * The garage's own city by the cities rule (`garageCity`), null in no
   * city; undefined from an API older than it.
   */
  garageCity?: { id: string; name: string } | null
  /** The old Chennai-relative sign, read only when `garageCity` is undefined. */
  outsideServiceCity?: OutsideServiceCity | null
}

function pinOf(garage: PlacedGarage): { lat: number; lng: number } | null {
  return garage.lat !== null && garage.lng !== null && Number.isFinite(garage.lat) && Number.isFinite(garage.lng)
    ? { lat: garage.lat, lng: garage.lng }
    : null
}

/**
 * Whether the garage is in the customer's city: its stored city is that city
 * (by id, or by name for the stand-in before the API answers). From an API
 * older than `garageCity`, a pinned garage inside the city's reach, or an
 * unpinned one with no old sign.
 */
export function garageInCity(garage: PlacedGarage, city: CustomerCity): boolean {
  if (garage.garageCity !== undefined) {
    if (garage.garageCity === null) return false
    return garage.garageCity.id === city.id || cityNameKey(garage.garageCity.name) === cityNameKey(city.name)
  }
  const pin = pinOf(garage)
  if (pin) return straightLineKm(city.centre, pin) <= city.reachKm
  return !garage.outsideServiceCity
}

// The town a garage typed, as the sign says it: all-capitals and
// all-lowercase entries ("SIVAKASI", "tirupur") in title case, anything with
// mixed case as written (the server's townName does the same).
function tidyTown(text: string | null | undefined): string | null {
  const tidy = (text ?? '').replace(/\s+/g, ' ').trim()
  if (tidy === '') return null
  if (tidy !== tidy.toLowerCase() && tidy !== tidy.toUpperCase()) return tidy
  return tidy.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase())
}

/**
 * The garage's town for the sign: its city's name, else the town it typed.
 * Not the customer's own city's name, though: a garage pinned just past
 * Chennai's reach that typed "Chennai" would read "Chennai · 60 km" to a
 * Chennai customer, which says nothing; it reads "60 km away" instead.
 */
export function garageTown(garage: PlacedGarage, city: CustomerCity): string | null {
  const town = garage.garageCity?.name ?? tidyTown(garage.area) ?? garage.outsideServiceCity?.town ?? null
  if (!town || cityNameKey(town) === cityNameKey(city.name)) return null
  return town
}

/**
 * Whole km from the customer to the garage, as the crow flies: from their
 * place, else from their city's centre. Null for a garage with no pin.
 */
export function garageKm(garage: PlacedGarage, place: CustomerPlace): number | null {
  const pin = pinOf(garage)
  if (!pin) return null
  return Math.round(straightLineKm(place.at ?? place.city.centre, pin))
}

const kmText = (value: number) => value.toLocaleString('en-IN')

/**
 * The chip on a garage card (mockup A): "Vellore · 125 km", "Vellore" with
 * no pin, "60 km away" with no town to name. Null for a garage in the
 * customer's city, and when there is nothing to say.
 */
export function outsideCityTag(garage: PlacedGarage, place: CustomerPlace): string | null {
  if (garageInCity(garage, place.city)) return null
  const town = garageTown(garage, place.city)
  const km = garageKm(garage, place)
  if (town) return km === null ? town : t('{town} · {km} km', { town, km: kmText(km) })
  return km === null ? null : t('{km} km away', { km: kmText(km) })
}

/**
 * The garage page's and checkout's line (mockup C): "This garage is in
 * Vellore, about 125 km from you." With no place shared, from their city:
 * "…about 125 km from Chennai." Straight-line km, hence "about", and never a
 * drive time. Null for a garage in the customer's city.
 */
export function outsideCityLine(garage: PlacedGarage, place: CustomerPlace): string | null {
  if (garageInCity(garage, place.city)) return null
  const town = garageTown(garage, place.city)
  const km = garageKm(garage, place)
  // "from you" and "from Chennai" are two sentences: Tamil puts them differently.
  const city = place.city.name
  if (town) {
    if (km === null) return t('This garage is in {town}.', { town })
    return place.at
      ? t('This garage is in {town}, about {km} km from you.', { town, km: kmText(km) })
      : t('This garage is in {town}, about {km} km from {city}.', { town, km: kmText(km), city })
  }
  if (km === null) return null
  return place.at
    ? t('This garage is about {km} km from you.', { km: kmText(km) })
    : t('This garage is about {km} km from {city}.', { km: kmText(km), city })
}

// ─── Near the customer ───────────────────────────────────────────────────────

/** What the "near you" count and the "Further away" line need from a garage. */
interface NearGarage extends PlacedGarage {
  distanceKm: number | null
}

/**
 * Whether a garage counts as near the customer: within their city's reach of
 * them once they have shared where they are, or in their city when they have
 * not. A garage in another town is still listed, nearest first, but is never
 * part of "5 garages near you".
 */
export function isNearCustomer(garage: NearGarage, options: { located: boolean; city: CustomerCity }): boolean {
  if (options.located) return garage.distanceKm !== null && garage.distanceKm <= options.city.reachKm
  return garageInCity(garage, options.city)
}

/**
 * "5 garages near you" / "5 garages in Chennai": how many of the loaded
 * garages are near, and whether more near ones may be on a page not loaded
 * yet (the "+"). On a nearest-first list that has already reached a garage
 * past the reach, or the tail with no pin, every near garage is loaded, so
 * there is no "+" however long the list goes on.
 */
export function nearGarageCount(
  garages: readonly NearGarage[],
  options: { located: boolean; hasMore: boolean; nearestFirst: boolean; city: CustomerCity }
): { count: number; more: boolean } {
  const count = garages.filter((g) => isNearCustomer(g, options)).length
  const last = garages[garages.length - 1]
  const pastTheNear =
    options.located &&
    options.nearestFirst &&
    last !== undefined &&
    (last.distanceKm === null || last.distanceKm > options.city.reachKm)
  return { count, more: options.hasMore && !pastTheNear }
}

/**
 * The map peek's count once the customer has a place (owner, 20 Nov 2026):
 * garages within about this many minutes' drive, by the same estimate as the
 * "~20 min" on every card (driveMinutes). In Chennai every garage sits inside
 * the city's 50 km reach of every area, so "near you" read 12 from Adyar,
 * Nungambakkam and Tambaram alike; half an hour's drive changes as the area does.
 */
export const NEAR_DRIVE_MINUTES = 30

/**
 * "5 garages within ~30 min": how many loaded garages are within
 * NEAR_DRIVE_MINUTES of the customer, and whether more may be on a page not
 * loaded yet (the "+"). As with nearGarageCount, a nearest-first list that
 * has already reached a garage past the limit (or the unpinned tail) has
 * loaded every one, so no "+". Only for a located customer: without a place
 * there is no drive to measure.
 */
export function driveNearCount(
  garages: readonly NearGarage[],
  options: { hasMore: boolean; nearestFirst: boolean }
): { count: number; more: boolean } {
  const within = (g: NearGarage) => g.distanceKm !== null && driveMinutes(g.distanceKm) <= NEAR_DRIVE_MINUTES
  const count = garages.filter(within).length
  const last = garages[garages.length - 1]
  const pastTheLimit = options.nearestFirst && last !== undefined && !within(last)
  return { count, more: options.hasMore && !pastTheLimit }
}

/** What the map peek's count counts: a drive, or garages that reach the customer. */
export type MapPeekKind = 'drive' | 'comes' | 'collects'

/**
 * The map peek's count once the customer has a place, by mode (owner, 22 Nov
 * 2026). At garage: garages within ~30 min's drive (driveNearCount). Doorstep
 * and Pickup & drop: the customer doesn't drive, so drive time is the wrong
 * question; with a place, the API lists only garages that cover it
 * (doorstepCovers / pickupCovers), so every one loaded counts, "+" while more
 * may follow. Null when there is nothing to count: the caller falls back to
 * its near-you words.
 */
export function mapPeekCount(
  mode: 'dropin' | 'doorstep' | 'pickup',
  garages: readonly NearGarage[],
  options: { hasMore: boolean; nearestFirst: boolean }
): { count: number; more: boolean; kind: MapPeekKind } | null {
  if (mode === 'doorstep' || mode === 'pickup') {
    if (garages.length === 0) return null
    return { count: garages.length, more: options.hasMore, kind: mode === 'doorstep' ? 'comes' : 'collects' }
  }
  const drive = driveNearCount(garages, options)
  return drive.count > 0 ? { ...drive, kind: 'drive' } : null
}

/** The words after mapPeekCount's number: "garages within ~30 min", "garages can come to you". */
export function mapPeekWords(peek: { count: number; more: boolean; kind: MapPeekKind }, translate: Translate = t): string {
  const one = peek.count === 1 && !peek.more
  if (peek.kind === 'comes') return one ? translate('garage can come to you') : translate('garages can come to you')
  if (peek.kind === 'collects') return one ? translate('garage can pick up from you') : translate('garages can pick up from you')
  return one
    ? translate('garage within ~{minutes} min', { minutes: NEAR_DRIVE_MINUTES })
    : translate('garages within ~{minutes} min', { minutes: NEAR_DRIVE_MINUTES })
}

/**
 * Where a nearest-first list crosses from near garages to far ones, for the
 * "Further away · other towns" line above the first far card; -1 when there
 * is no such point (no location, another sort, or nothing far). Garages with
 * no pin have their own line and are not "far".
 */
export function firstFarIndex(
  garages: readonly NearGarage[],
  options: { located: boolean; nearestFirst: boolean; city: CustomerCity }
): number {
  if (!options.located || !options.nearestFirst) return -1
  return garages.findIndex((g) => g.distanceKm !== null && g.distanceKm > options.city.reachKm)
}

/**
 * The At garage list's words when nothing is within the far-garage limit:
 * "No garages within 150 km of you yet. Search finds a garage by its name,
 * wherever it is." (or "of Madurai" for a whole city). The list is the
 * server's; this only says why it is empty and the way on.
 */
export function farEmptyLine(place: CustomerPlace): string {
  return place.at
    ? t('No garages within {km} km of you yet. Search finds a garage by its name, wherever it is.', {
        km: FAR_LIMIT_KM,
      })
    : t('No garages within {km} km of {city} yet. Search finds a garage by its name, wherever it is.', {
        km: FAR_LIMIT_KM,
        city: place.city.name,
      })
}
