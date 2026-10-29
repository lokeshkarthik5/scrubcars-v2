import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { PLACE_KIND_QUERIES } from '../../lib/places/kinds.js'
import {
  placesSources,
  type FoundPlace,
  type PlacesSource,
} from '../../lib/places/index.js'
import {
  finderCounts,
  markKnown,
  mergePlaces,
  type MergedPlace,
} from '../../lib/places/merge.js'
import { ZONE_RADIUS_KM, zoneFor } from '../../lib/zones.js'
import { leadsService } from '../leads/leads.service.js'
import { placesRepository } from './places.repository.js'
import type { PlacesSearchInput } from './places.validation.js'

const log = logger.child({ module: 'places' })

/** How a source did: searched, not connected (no key), some searches failed, or all failed. */
export type SourceState = 'ok' | 'off' | 'partial' | 'failed'

export interface PlacesSearchResponse {
  zone: { id: string; name: string }
  sources: { google: SourceState; ola: SourceState }
  counts: ReturnType<typeof finderCounts>
  places: MergedPlace[]
}

async function searchAll(
  source: PlacesSource | null,
  queries: Array<{ text: string; kind: FoundPlace['kinds'][number] | null }>,
  centre: { lat: number; lng: number }
): Promise<{ state: SourceState; places: FoundPlace[] }> {
  if (!source) return { state: 'off', places: [] }
  const answers = await Promise.allSettled(
    queries.map((query) =>
      source.search({ ...query, centre, radiusKm: ZONE_RADIUS_KM })
    )
  )
  const places = answers.flatMap((answer) =>
    answer.status === 'fulfilled' ? answer.value : []
  )
  const failed = answers.filter((answer) => answer.status === 'rejected').length
  return {
    state:
      failed === 0 ? 'ok' : failed === answers.length ? 'failed' : 'partial',
    places,
  }
}

export const placesService = {
  /**
   * "Find businesses in a zone": each kind ticked (and the words typed) is
   * searched at Google and Ola around the zone's centre, kept to the places
   * whose pin is in this zone by the zones' one rule (lib/zones.ts), merged
   * into one list (lib/places/merge.ts) and marked against the garages and
   * leads the team has. Nothing is stored. Logs counts only, never what
   * was found.
   */
  async search(input: PlacesSearchInput): Promise<PlacesSearchResponse> {
    const zones = await placesRepository.listZones()
    const zone = zones.find((row) => row.id === input.zoneId)
    if (!zone) throw new AppError(404, 'Zone not found', 'ZONE_NOT_FOUND')

    const queries = [
      ...input.kinds.map((kind) => ({ text: PLACE_KIND_QUERIES[kind], kind })),
      ...(input.text ? [{ text: input.text, kind: null }] : []),
    ]
    const sources = placesSources()
    const [google, ola] = await Promise.all([
      searchAll(sources.google, queries, zone),
      searchAll(sources.ola, queries, zone),
    ])
    if (google.state === 'off' && ola.state === 'off') {
      throw new AppError(
        503,
        'Neither Google nor Ola Maps is connected',
        'PLACES_UNCONFIGURED'
      )
    }

    const inZone = (place: FoundPlace) => zoneFor(place, zones)?.id === zone.id
    const merged = mergePlaces(
      google.places.filter(inZone),
      ola.places.filter(inZone),
      zone
    )
    const places = markKnown(merged, await leadsService.knownPlaces(zones))
    const counts = finderCounts(places)
    log.info(
      {
        kinds: input.kinds.length,
        words: Boolean(input.text),
        googleState: google.state,
        olaState: ola.state,
        ...counts,
      },
      'places:search'
    )
    return {
      zone: { id: zone.id, name: zone.name },
      sources: { google: google.state, ola: ola.state },
      counts,
      places,
    }
  },
}
