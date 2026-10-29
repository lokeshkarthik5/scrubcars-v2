import { env } from '../env.js'
import { logger } from '../logger.js'
import {
  GeoProviderError,
  type GeoPlace,
  type GeoProvider,
} from './types.js'

/**
 * Ola Maps adapter.
 *
 * Chosen first because Indian addresses are where OSM-derived geocoders
 * (Nominatim, Photon, Geoapify, LocationIQ) are weakest — localities,
 * apartment complexes, landmark-relative addresses and pincode boundaries are
 * exactly what our customers and garages type.
 *
 * ⚠️ VERIFY BEFORE FIRST USE. Ola's Places API is modelled on the Google Places
 * response shape (`predictions[]`, `place_id`, `geometry.location.lat/lng`,
 * `address_components[]`), which is what `normalise*` below parses. Their
 * public docs do not publish the full schema, so confirm the field names
 * against a live key and correct the two normalise functions — they are the
 * only place the wire format is known. Everything above them is shape-agnostic.
 *
 * ⚠️ Pricing changed on 2026-09-01: prepaid credits, first 100k events/month
 * free across all products. Our usage pattern (garages geocoded once ever,
 * customer location from free browser GPS, reverse only on address save) sits
 * far under that — see plans/geo.md §5.
 */

const BASE_URL = 'https://api.olamaps.io'
const TIMEOUT_MS = 6000

interface OlaLatLng {
  lat?: number
  lng?: number
}

interface OlaAddressComponent {
  long_name?: string
  short_name?: string
  types?: string[]
}

interface OlaPlace {
  place_id?: string
  reference?: string
  description?: string
  name?: string
  formatted_address?: string
  geometry?: { location?: OlaLatLng }
  address_components?: OlaAddressComponent[]
  distance_meters?: number
}

interface OlaResponse {
  predictions?: OlaPlace[]
  geocodingResults?: OlaPlace[]
  results?: OlaPlace[]
  result?: OlaPlace
  status?: string
  error_message?: string
}

/**
 * Pulls a component out of the Google-style `address_components` array.
 * Returns null rather than guessing when the type is absent — a wrong pincode
 * is worse than a missing one, since the customer can type a missing one.
 */
function component(
  components: OlaAddressComponent[] | undefined,
  ...types: string[]
): string | null {
  if (!components) return null
  for (const type of types) {
    const hit = components.find((c) => c.types?.includes(type))
    if (hit?.long_name) return hit.long_name
  }
  return null
}

/**
 * The single seam where Ola's wire format is known. If their field names differ
 * from the Google-compatible shape, this function and `pickList` are the only
 * two things that need to change.
 */
function normalisePlace(raw: OlaPlace): GeoPlace {
  const lat = raw.geometry?.location?.lat
  const lng = raw.geometry?.location?.lng

  return {
    providerPlaceId: raw.place_id ?? raw.reference ?? null,
    provider: 'ola',
    label: raw.name ?? raw.description ?? raw.formatted_address ?? '',
    formatted: raw.formatted_address ?? raw.description ?? null,
    lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : null,
    lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : null,
    city:
      component(raw.address_components, 'locality', 'administrative_area_level_2') ??
      null,
    pincode: component(raw.address_components, 'postal_code'),
    // Ola does not publish a confidence score. Null is the honest answer —
    // callers must treat null as "unknown", never as "low".
    confidence: null,
  }
}

function pickList(body: OlaResponse): OlaPlace[] {
  return body.predictions ?? body.geocodingResults ?? body.results ?? []
}

/**
 * One request to Ola Maps with the key and the Origin header Ola wants.
 * Exported for the zone finder's Ola search (lib/places/ola.ts), so the two
 * share one way of calling Ola.
 */
export async function olaRequest(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  headers: Record<string, string> = {}
) {
  const url = new URL(path, BASE_URL)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  url.searchParams.set('api_key', apiKey)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Ola authorises an API key against a domain allowlist, and it reads
        // the ORIGIN header to decide (not Referer — that is ignored). A
        // server-side call sends neither, so without this every request comes
        // back 403 `{"message":"Domain  is not allowed."}` — note the empty
        // domain in their message.
        //
        // Domain allowlisting is a browser protection and buys nothing here:
        // this key never leaves the server (that is the point of the proxy),
        // and an Origin header is trivially set by any caller. It is honoured
        // because Ola requires it, not because it secures anything.
        ...(env.olaMapsOrigin ? { Origin: env.olaMapsOrigin } : {}),
        ...headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // A provider timeout must not read as "no results found" — that would let
    // a vendor save a garage with no pin because the search looked empty.
    throw new GeoProviderError(
      'ola',
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Map provider timed out'
        : 'Could not reach the map provider'
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    logger.warn(
      { provider: 'ola', path, status: response.status, detail: detail.slice(0, 200) },
      'geo:provider_error'
    )

    // 403 from Ola is almost always the domain allowlist rather than a bad key,
    // and the generic message sent people looking in the wrong place. Say which
    // knob to turn.
    if (response.status === 403 && detail.includes('Domain')) {
      throw new GeoProviderError(
        'ola',
        'Map provider rejected the request: the API key is restricted to specific domains. Set OLA_MAPS_ORIGIN to an allowed domain, or remove the domain restriction on this server-side key.',
        403
      )
    }

    throw new GeoProviderError(
      'ola',
      'Map provider rejected the request',
      response.status
    )
  }

  const body = (await response.json()) as OlaResponse

  if (body.status && !['ok', 'zero_results'].includes(body.status.toLowerCase())) {
    throw new GeoProviderError('ola', body.error_message ?? body.status)
  }

  return body
}

export function createOlaProvider(apiKey: string): GeoProvider {
  return {
    name: 'ola',

    async autocomplete(q, near, sessionToken) {
      const body = await olaRequest(
        '/places/v1/autocomplete',
        {
          input: q,
          ...(near ? { location: `${near.lat},${near.lng}` } : {}),
        },
        apiKey,
        // A header, not a query parameter — it was previously passed as the
        // latter, where Ola simply ignored it and every keystroke counted as a
        // fresh session.
        sessionToken ? { 'X-Request-Id': sessionToken } : {}
      )
      return pickList(body).map(normalisePlace)
    },

    async geocode(q) {
      const body = await olaRequest('/places/v1/geocode', { address: q }, apiKey)
      return pickList(body).map(normalisePlace)
    },

    async reverse(lat, lng) {
      const body = await olaRequest(
        '/places/v1/reverse-geocode',
        { latlng: `${lat},${lng}` },
        apiKey
      )
      const [first] = pickList(body)
      if (!first) return null
      const place = normalisePlace(first)
      // Reverse always knows where it was asked about. If the provider echoed
      // nothing back, keep the query point rather than returning a place with
      // no coordinates — the caller pinned it, so it is authoritative.
      return { ...place, lat: place.lat ?? lat, lng: place.lng ?? lng }
    },

    async route(from, to) {
      const body = (await olaRequest(
        '/routing/v1/directions',
        {
          origin: `${from.lat},${from.lng}`,
          destination: `${to.lat},${to.lng}`,
          mode: 'driving',
        },
        apiKey
      )) as OlaResponse & {
        routes?: Array<{
          legs?: Array<{
            distance?: number | { value?: number }
            duration?: number | { value?: number }
          }>
        }>
      }

      const leg = body.routes?.[0]?.legs?.[0]
      if (!leg) return null

      // Providers disagree on whether these are bare numbers or {value} —
      // normalising here is exactly the adapter's job.
      const asNumber = (v: number | { value?: number } | undefined) =>
        typeof v === 'number' ? v : v?.value

      const distanceM = asNumber(leg.distance)
      const durationS = asNumber(leg.duration)

      if (
        typeof distanceM !== 'number' ||
        typeof durationS !== 'number' ||
        !Number.isFinite(distanceM) ||
        !Number.isFinite(durationS)
      ) {
        return null
      }

      return { distanceM, durationS }
    },

    async resolve(place, sessionToken) {
      if (place.lat !== null && place.lng !== null) return place
      if (!place.providerPlaceId) return place

      const body = await olaRequest(
        '/places/v1/details',
        { place_id: place.providerPlaceId },
        apiKey,
        sessionToken ? { 'X-Request-Id': sessionToken } : {}
      )
      const raw = body.result ?? pickList(body)[0]
      if (!raw) return place

      const detailed = normalisePlace(raw)
      // Keep the autocomplete row's label — it is what the user actually
      // clicked — and take only the parts details was called for.
      return {
        ...place,
        lat: detailed.lat,
        lng: detailed.lng,
        formatted: detailed.formatted ?? place.formatted,
        city: detailed.city ?? place.city,
        pincode: detailed.pincode ?? place.pincode,
      }
    },
  }
}
