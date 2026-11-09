/**
 * The Cities page's words and checks (0069), pure so they are unit-tested
 * without a browser (cities.test.ts). Which city a garage is in, and who
 * customers see, is the server's alone (lib/cities.ts there); this only says
 * it and checks what admin typed before it is sent.
 */
import {
  CITY_NAME_MAX,
  CITY_NAME_MIN,
  CITY_REACH_MAX_KM,
  CITY_REACH_MIN_KM,
  DEFAULT_CITY_REACH_KM,
} from '@repo/core/cities'
import type { AdminCity, PlaceCounts } from '@repo/core/api/admin-cities'

export interface CityDraft {
  name: string
  lat: number | null
  lng: number | null
  reachKm: string
}

export const EMPTY_CITY_DRAFT: CityDraft = { name: '', lat: null, lng: null, reachKm: String(DEFAULT_CITY_REACH_KM) }

export function cityDraftFrom(city: AdminCity): CityDraft {
  return { name: city.name, lat: city.lat, lng: city.lng, reachKm: String(city.reachKm) }
}

/** What is wrong with the draft, in the words the sheet shows, or null. */
export function cityDraftProblem(draft: CityDraft): string | null {
  const name = draft.name.trim()
  if (name.length < CITY_NAME_MIN) return `Enter the city's name (at least ${CITY_NAME_MIN} letters).`
  if (name.length > CITY_NAME_MAX) return `Keep the name to ${CITY_NAME_MAX} characters.`
  if (draft.lat === null || draft.lng === null) return 'Place the city’s centre on the map.'
  const km = Number(draft.reachKm)
  if (!/^\d+$/.test(draft.reachKm.trim()) || km < CITY_REACH_MIN_KM || km > CITY_REACH_MAX_KM) {
    return `Enter the reach in whole km, from ${CITY_REACH_MIN_KM} to ${CITY_REACH_MAX_KM}.`
  }
  return null
}

/** "3 of 5 garages live"; "1 of 1 garage live"; "No garages yet". */
export function liveLine(counts: Pick<PlaceCounts, 'garagesLive' | 'garagesTotal'>): string {
  if (counts.garagesTotal === 0) return 'No garages yet'
  const noun = counts.garagesTotal === 1 ? 'garage' : 'garages'
  return `${counts.garagesLive} of ${counts.garagesTotal} ${noun} live`
}

/**
 * The confirm sheet's body before a place goes off: "Customers won't see 3
 * garages in Tirupur. Bookings already made carry on." With none to hide, it
 * says so instead of "0 garages".
 */
export function offConfirmBody(place: string, hidden: number): string {
  const what =
    hidden === 0
      ? `No garage customers can find now is in ${place}, so nothing changes for them yet.`
      : `Customers won't see ${hidden} ${hidden === 1 ? 'garage' : 'garages'} in ${place}.`
  return `${what} Bookings already made carry on.`
}

/** The Add garage form, with this city chosen and the map opened over it. */
export function addGarageHref(cityName: string): string {
  return `/vendors/new?city=${encodeURIComponent(cityName)}`
}
