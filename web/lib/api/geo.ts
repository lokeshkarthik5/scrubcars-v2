import { apiClient } from './client'

/**
 * Map-provider proxy client.
 *
 * Every call goes through our own API rather than straight to the provider, so
 * the API key never ships to the browser, responses are cached server-side to
 * stay inside the free tier, and swapping providers touches nothing here. The
 * shapes below are provider-neutral by design — see server/src/lib/geo.
 *
 * Tiles are the exception and go browser-direct, since OpenFreeMap needs no key.
 */

export interface GeoPlace {
  providerPlaceId: string | null
  provider: string
  label: string
  formatted: string | null
  lat: number | null
  lng: number | null
  city: string | null
  pincode: string | null
  confidence: number | null
}

/**
 * Groups a picker session's keystrokes into one billable provider session.
 * Created once when a picker opens, discarded when it closes.
 */
export function createGeoSessionToken(): string {
  return crypto.randomUUID()
}

/** GET /geo/autocomplete — address suggestions while typing. */
export async function searchPlaces(
  q: string,
  near?: { lat: number; lng: number },
  sessionToken?: string
): Promise<GeoPlace[]> {
  return apiClient<GeoPlace[]>('/geo/autocomplete', {
    auth: false,
    params: {
      q,
      lat: near?.lat,
      lng: near?.lng,
      sessionToken,
    },
  })
}

/** GET /geo/reverse — coordinates to an address, after a pin drop. */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoPlace | null> {
  return apiClient<GeoPlace | null>('/geo/reverse', {
    auth: false,
    params: { lat, lng },
  })
}

/**
 * GET /geo/resolve — fills in coordinates for a suggestion that arrived
 * without them. Always call this on a picked suggestion: it is a no-op for
 * providers whose autocomplete already returns coordinates, which is precisely
 * why the caller never has to know which provider is configured.
 */
export async function resolvePlace(
  placeId: string,
  sessionToken?: string
): Promise<GeoPlace> {
  return apiClient<GeoPlace>('/geo/resolve', {
    auth: false,
    params: { placeId, sessionToken },
  })
}

export type MapsLinkWarning =
  | 'place_share_link'
  | 'directions_link'
  | 'no_location_found'
  | 'unreachable'

export interface MapsLinkResult {
  lat: number | null
  lng: number | null
  address: string | null
  warning: MapsLinkWarning | null
  /** 'link' = coordinates were in the URL; 'geocoded' = derived from its address. */
  source: 'link' | 'geocoded' | null
}

/**
 * GET /geo/maps-link — turn a pasted Google Maps link into a location.
 *
 * Nothing calls a Google API: the server follows the redirect and reads the
 * resulting URL. Vendors already paste these at onboarding, and Google's link
 * carries a canonical address, which our geocoder handles far better than it
 * handles a business name.
 */
export async function resolveMapsLink(url: string): Promise<MapsLinkResult> {
  return apiClient<MapsLinkResult>('/geo/maps-link', {
    auth: false,
    params: { url },
  })
}

/**
 * Parses a raw "13.0043, 80.2554" paste — what Google Maps gives you on
 * right-click → copy. The fully reliable escape hatch: no link to expand, no
 * geocode to get wrong.
 */
export function parseCoordinatePair(
  input: string
): { lat: number; lng: number } | null {
  const match = input
    .trim()
    .match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!match) return null

  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}
