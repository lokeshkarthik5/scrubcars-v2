import { env } from '../env.js'
import { createFakePlaces } from './fake.js'
import { createGooglePlaces } from './google.js'
import { createOlaPlaces } from './ola.js'
import type { GoogleDetailsSource, PlacesSource } from './types.js'

export * from './types.js'

/**
 * Which sources the zone finder has (0064): Google when
 * GOOGLE_PLACES_API_KEY is set, Ola when OLA_MAPS_API_KEY is, both fake
 * under PLACES_FAKE. Built once per instance; nothing outside lib/places
 * names a provider's wire format.
 */
export interface PlacesSources {
  google: (PlacesSource & GoogleDetailsSource) | null
  ola: PlacesSource | null
}

function build(): PlacesSources {
  if (env.placesFake) return createFakePlaces()
  return {
    google: env.googlePlacesApiKey
      ? createGooglePlaces(env.googlePlacesApiKey)
      : null,
    ola: env.olaMapsApiKey ? createOlaPlaces(env.olaMapsApiKey) : null,
  }
}

let sources: PlacesSources | null = null

export function placesSources(): PlacesSources {
  sources ??= build()
  return sources
}

/** For tests: put stand-in sources in place (null: build from the env again). */
export function setPlacesSourcesForTests(next: PlacesSources | null) {
  sources = next
}
