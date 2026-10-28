import { logger } from '../logger.js'

/**
 * Turns a Google Maps link into a location.
 *
 * Vendors already paste one at onboarding, and Google's own link carries a
 * precise canonical address — which matters because Ola's business-name recall
 * is weak (roughly a third of our garages) while its *address* geocoding is
 * good. Resolving the link converts a POI-lookup problem into a geocoding one.
 *
 * Nothing here calls a Google API. It follows a redirect the vendor handed us
 * and reads the resulting URL, so there is no billing account and no Places
 * licensing question.
 */

/**
 * Hosts we will fetch. This is a security control, not link validation:
 * resolving a user-supplied URL server-side is an SSRF surface, so every hop —
 * not just the first — must land on Google. Anything else is refused before a
 * request is made.
 */
const ALLOWED_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
  'share.google',
  'g.co',
])

const MAX_REDIRECTS = 5
const TIMEOUT_MS = 8000

export type MapsLinkWarning =
  | 'place_share_link'
  | 'directions_link'
  | 'no_location_found'
  | 'unreachable'

export interface MapsLinkResult {
  lat: number | null
  lng: number | null
  /** A formatted address to geocode when the link carried no coordinates. */
  address: string | null
  /** Non-blocking. The caller shows it and lets the user carry on regardless. */
  warning: MapsLinkWarning | null
}

function hostAllowed(url: URL): boolean {
  return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase())
}

/**
 * Expands a short link by hand rather than with `redirect: 'follow'`, so every
 * hop can be checked against the allowlist. An open redirect on a Google domain
 * would otherwise be a route into our network.
 */
async function expand(rawUrl: string): Promise<URL | null> {
  let current: URL
  try {
    current = new URL(rawUrl)
  } catch {
    return null
  }
  if (!hostAllowed(current)) return null

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let response: Response
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Google serves a different (coordinate-bearing) URL to browsers than
        // to bare clients.
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      })
    } catch {
      return null
    }

    const location = response.headers.get('location')
    if (!location) return current

    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      return current
    }
    if (!hostAllowed(next)) return current
    current = next
  }

  return current
}

/** `@13.0043,80.2554,17z` — the most trustworthy form, when present. */
function coordsFromAtSegment(url: URL): { lat: number; lng: number } | null {
  const match = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!match) return null
  return { lat: Number(match[1]), lng: Number(match[2]) }
}

/** `!3d13.0043!4d80.2554` inside the opaque `data=` blob. */
function coordsFromDataBlob(url: URL): { lat: number; lng: number } | null {
  const match = url.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (!match) return null
  return { lat: Number(match[1]), lng: Number(match[2]) }
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' ')).trim()
  } catch {
    return segment.replace(/\+/g, ' ').trim()
  }
}

/**
 * The address out of `/maps/place/<address>/…`, or the `q`/`query` parameter.
 *
 * `/maps/dir/` is handled separately and deliberately: a directions link's
 * FIRST coordinate pair is the route's origin, not the destination. One of our
 * garages has such a link whose origin sits 25 km from the garage, so a parser
 * that grabbed the first lat/lng it saw would pin it silently and badly wrong.
 */
function addressFromUrl(url: URL): string | null {
  const query = url.searchParams.get('q') ?? url.searchParams.get('query')
  if (query && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(query)) return query.trim()

  const parts = url.pathname.split('/').filter(Boolean)
  const placeIndex = parts.indexOf('place')
  if (placeIndex !== -1 && parts[placeIndex + 1]) {
    return decodeSegment(parts[placeIndex + 1])
  }

  const dirIndex = parts.indexOf('dir')
  if (dirIndex !== -1) {
    // Destination is the segment after the origin. Skip anything that is itself
    // a coordinate pair, which is what the origin usually is.
    const rest = parts.slice(dirIndex + 1)
    const destination = rest.find(
      (segment) => !/^-?\d+\.\d+,-?\d+\.\d+$/.test(segment)
    )
    if (destination) return decodeSegment(destination)
  }

  return null
}

export async function resolveMapsLink(rawUrl: string): Promise<MapsLinkResult> {
  const resolved = await expand(rawUrl)

  if (!resolved) {
    return { lat: null, lng: null, address: null, warning: 'unreachable' }
  }

  const coords = coordsFromAtSegment(resolved) ?? coordsFromDataBlob(resolved)
  const address = addressFromUrl(resolved)
  const isDirections = resolved.pathname.includes('/dir/')

  // A "share.google" place link expands to a Google *search* result keyed on a
  // Knowledge Graph id — it carries neither coordinates nor an address. Two of
  // our garages have one, so it is worth naming rather than failing vaguely.
  const isPlaceShare =
    resolved.pathname.startsWith('/search') || resolved.searchParams.has('kgmid')

  logger.info(
    {
      host: resolved.hostname,
      hasCoords: coords !== null,
      hasAddress: address !== null,
      isPlaceShare,
    },
    'geo:maps_link_resolved'
  )

  const warning: MapsLinkWarning | null = coords
    ? null
    : isPlaceShare
      ? 'place_share_link'
      : address
        ? isDirections
          ? 'directions_link'
          : null
        : 'no_location_found'

  return { lat: coords?.lat ?? null, lng: coords?.lng ?? null, address, warning }
}

/**
 * The pin a full Google Maps link already carries (`@lat,lng` or the
 * `!3d…!4d…` place blob, read in resolveMapsLink's order), without fetching
 * anything. Null for a short link, a directions link (its first pair is the
 * route's start) or a link with no coordinates: those go through
 * resolveMapsLink. Add lead uses it first, so a full link needs no request.
 */
export function coordsInLink(rawUrl: string): { lat: number; lng: number } | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (!hostAllowed(url) || url.pathname.includes('/dir/')) return null
  const coords = coordsFromAtSegment(url) ?? coordsFromDataBlob(url)
  if (!coords || Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) return null
  return coords
}
