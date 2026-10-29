import { GeoProviderError } from '../geo/types.js'
import { olaRequest } from '../geo/ola.js'
import { normalisePhone } from '../leads.js'
import type { PlaceKind } from './kinds.js'
import {
  PlacesProviderError,
  type FoundPlace,
  type PlaceSearch,
  type PlacesSource,
} from './types.js'

/**
 * Ola Maps' Places for the zone finder (0064), on the key address search
 * already uses (OLA_MAPS_API_KEY; 500,000 calls a month free). Text search
 * around the zone's centre, then each of the first few results' details for
 * its phone and rating (the search answer has neither), best effort.
 *
 * Ola's wire format is Google-like: `predictions[]` with `place_id`, `name`,
 * `formatted_address`, `geometry.location`; details' `result` adds
 * `formatted_phone_number`, `rating`, `user_ratings_total`. These two
 * functions are the only place it is read.
 */

/** Details read per search, at most: the first results, which are the closest matches. */
export const OLA_DETAILS_PER_SEARCH = 6

interface OlaPlace {
  place_id?: string
  name?: string
  description?: string
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  formatted_phone_number?: string
  international_phone_number?: string
  rating?: number
  user_ratings_total?: number
}

const olaRating = (value: unknown): number | null =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 5
    ? Math.round(value * 10) / 10
    : null

const olaCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null

const olaPhone = (raw: OlaPlace): string | null =>
  normalisePhone(raw.formatted_phone_number ?? raw.international_phone_number)

export function fromOlaPlace(
  raw: OlaPlace,
  kind: PlaceKind | null
): FoundPlace | null {
  const lat = raw.geometry?.location?.lat
  const lng = raw.geometry?.location?.lng
  const name = (raw.name ?? raw.description)?.trim()
  if (
    !raw.place_id ||
    !name ||
    typeof lat !== 'number' ||
    typeof lng !== 'number'
  )
    return null
  return {
    source: 'ola',
    placeId: raw.place_id,
    name: name.slice(0, 200),
    address: raw.formatted_address?.trim().slice(0, 300) || null,
    lat,
    lng,
    phone: olaPhone(raw),
    rating: olaRating(raw.rating),
    reviewCount: olaCount(raw.user_ratings_total),
    kinds: kind ? [kind] : [],
  }
}

/** A search result with what its details add: the phone and the rating. */
export function withOlaDetails(
  place: FoundPlace,
  details: OlaPlace | undefined
): FoundPlace {
  if (!details) return place
  return {
    ...place,
    phone: olaPhone(details) ?? place.phone,
    rating: olaRating(details.rating) ?? place.rating,
    reviewCount: olaCount(details.user_ratings_total) ?? place.reviewCount,
  }
}

function asPlacesError(err: unknown): never {
  if (err instanceof GeoProviderError)
    throw new PlacesProviderError('ola', err.message, err.status)
  throw err
}

export function createOlaPlaces(apiKey: string): PlacesSource {
  return {
    name: 'ola',

    async search(query: PlaceSearch) {
      let body: { predictions?: OlaPlace[] }
      try {
        body = (await olaRequest(
          '/places/v1/textsearch',
          {
            input: query.text,
            location: `${query.centre.lat},${query.centre.lng}`,
            radius: String(Math.round(query.radiusKm * 1000)),
            size: '20',
          },
          apiKey
        )) as { predictions?: OlaPlace[] }
      } catch (err) {
        asPlacesError(err)
      }
      const places = (body.predictions ?? []).flatMap((raw) => {
        const place = fromOlaPlace(raw, query.kind)
        return place ? [place] : []
      })

      // Phone and rating come only with the details. Best effort: a place
      // whose details fail is still listed, without them.
      const detailed = await Promise.all(
        places.slice(0, OLA_DETAILS_PER_SEARCH).map(async (place) => {
          try {
            const details = (await olaRequest(
              '/places/v1/details',
              { place_id: place.placeId },
              apiKey
            )) as {
              result?: OlaPlace
            }
            return withOlaDetails(place, details.result)
          } catch {
            return place
          }
        })
      )
      return [...detailed, ...places.slice(OLA_DETAILS_PER_SEARCH)]
    },
  }
}
