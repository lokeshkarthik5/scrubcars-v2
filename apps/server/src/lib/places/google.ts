import { logger } from '../logger.js'
import { normalisePhone } from '../leads.js'
import type { PlaceKind } from './kinds.js'
import {
  PlacesProviderError,
  type FoundPlace,
  type GoogleDetailsSource,
  type GooglePlaceDetails,
  type PlaceSearch,
  type PlacesSource,
} from './types.js'

/**
 * Google Places API (New) for the zone finder (0064): Text Search inside
 * the zone's box, and Place Details for the 30-day refresh.
 *
 * Cost is set by the fields asked for, so the field masks name only what
 * the finder shows: name, address, location, rating, review count and
 * phone (rating, review count and phone make it the Enterprise SKU, about
 * $35 per 1,000 after the free 1,000 a month). One page of up to 20 per
 * search, never the next pages. The key never leaves the server.
 *
 * Google's terms: a place id may be kept; everything else Google gave may
 * be held for 30 days, then read again or deleted (lib/places/refresh.ts,
 * run by the cron).
 */

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const DETAILS_URL = 'https://places.googleapis.com/v1/places/'
const TIMEOUT_MS = 8000

/** Exactly the fields the finder shows. */
export const GOOGLE_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.nationalPhoneNumber',
].join(',')

/** The same fields for one place, for the refresh. */
export const GOOGLE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'nationalPhoneNumber',
].join(',')

interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  nationalPhoneNumber?: string
}

/** The box around a circle, which Text Search's locationRestriction takes (it takes no circle). */
export function boxAround(
  centre: { lat: number; lng: number },
  radiusKm: number
) {
  const dLat = radiusKm / 111.32
  const dLng = radiusKm / (111.32 * Math.cos((centre.lat * Math.PI) / 180))
  return {
    low: { latitude: centre.lat - dLat, longitude: centre.lng - dLng },
    high: { latitude: centre.lat + dLat, longitude: centre.lng + dLng },
  }
}

const rating = (value: unknown): number | null =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 5
    ? Math.round(value * 10) / 10
    : null

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null

/** The one place Google's wire format is read. */
export function fromGooglePlace(
  raw: GooglePlace,
  kind: PlaceKind | null
): FoundPlace | null {
  const lat = raw.location?.latitude
  const lng = raw.location?.longitude
  const name = raw.displayName?.text?.trim()
  if (!raw.id || !name || typeof lat !== 'number' || typeof lng !== 'number')
    return null
  return {
    source: 'google',
    placeId: raw.id,
    name: name.slice(0, 200),
    address: raw.formattedAddress?.trim().slice(0, 300) || null,
    lat,
    lng,
    phone: normalisePhone(raw.nationalPhoneNumber),
    rating: rating(raw.rating),
    reviewCount: count(raw.userRatingCount),
    kinds: kind ? [kind] : [],
  }
}

async function send(
  url: string,
  init: RequestInit,
  what: 'search' | 'details'
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new PlacesProviderError(
      'google',
      err instanceof Error && err.name === 'TimeoutError'
        ? `Google ${what} timed out`
        : `Could not reach Google`
    )
  }
}

export function createGooglePlaces(
  apiKey: string
): PlacesSource & GoogleDetailsSource {
  return {
    name: 'google',

    async search(query: PlaceSearch) {
      const response = await send(
        SEARCH_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': GOOGLE_SEARCH_FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: query.text,
            pageSize: 20,
            languageCode: 'en',
            regionCode: 'IN',
            locationRestriction: {
              rectangle: boxAround(query.centre, query.radiusKm),
            },
          }),
        },
        'search'
      )
      if (!response.ok) {
        // Status only: Google's error text can echo the request.
        logger.warn(
          { provider: 'google', status: response.status },
          'places:provider_error'
        )
        throw new PlacesProviderError(
          'google',
          'Google refused the search',
          response.status
        )
      }
      const body = (await response.json()) as { places?: GooglePlace[] }
      return (body.places ?? []).flatMap((raw) => {
        const place = fromGooglePlace(raw, query.kind)
        return place ? [place] : []
      })
    },

    async details(placeId: string): Promise<GooglePlaceDetails | null> {
      const response = await send(
        DETAILS_URL + encodeURIComponent(placeId),
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': GOOGLE_DETAILS_FIELD_MASK,
          },
        },
        'details'
      )
      // A place Google no longer has: nothing to refresh from.
      if (response.status === 404) return null
      if (!response.ok) {
        logger.warn(
          { provider: 'google', status: response.status },
          'places:details_error'
        )
        throw new PlacesProviderError(
          'google',
          'Google refused the details',
          response.status
        )
      }
      const raw = (await response.json()) as GooglePlace
      return {
        name: raw.displayName?.text?.trim().slice(0, 200) || null,
        address: raw.formattedAddress?.trim().slice(0, 300) || null,
        phone: normalisePhone(raw.nationalPhoneNumber),
        rating: rating(raw.rating),
        reviewCount: count(raw.userRatingCount),
        lat:
          typeof raw.location?.latitude === 'number'
            ? raw.location.latitude
            : null,
        lng:
          typeof raw.location?.longitude === 'number'
            ? raw.location.longitude
            : null,
      }
    },
  }
}
