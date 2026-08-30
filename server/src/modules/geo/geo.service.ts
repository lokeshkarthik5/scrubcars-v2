import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  GeoProviderError,
  getGeoProvider,
  geoProviderName,
  type GeoPlace,
  type GeoRoute,
} from '../../lib/geo/index.js'
import { logger } from '../../lib/logger.js'
import { resolveMapsLink } from '../../lib/geo/maps-link.js'
import { geoRepository } from './geo.repository.js'
import type {
  AutocompleteQuery,
  GeocodeQuery,
  ResolveQuery,
  ReverseQuery,
  RouteQuery,
  MapsLinkQuery,
} from './geo.validation.js'

/**
 * Everything the browser needs from a map provider, proxied.
 *
 * This is a proxy rather than a direct browser→provider call for four reasons,
 * in order of importance: the API key never ships to the client; responses are
 * cached so the free tier lasts; it can be rate-limited; and swapping providers
 * touches no frontend code. Tiles are the exception — those go straight from
 * the browser to the tile host, since OpenFreeMap needs no key.
 */

/**
 * Rounding coordinates before they become a cache key is what makes the cache
 * work at all: 4 decimals is ~11 m, so everyone in one apartment block shares a
 * single reverse-geocode entry. It is also the privacy story — the server never
 * needs a customer's exact position to name their neighbourhood.
 */
function roundForKey(value: number): string {
  return value.toFixed(4)
}

/**
 * Keys are prefixed with the provider name so that swapping providers cannot
 * serve rows shaped by the old one.
 */
function cacheKey(op: string, input: string): string {
  return `${geoProviderName}:${op}:${input}`
}

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = await geoRepository.get<T>(key, env.geoCacheTtlHours)
  if (hit !== null) {
    logger.debug({ key }, 'geo:cache_hit')
    return hit
  }

  const fresh = await load()
  // A cache write must never fail the request it was meant to speed up.
  await geoRepository.set(key, fresh).catch((err) => {
    logger.warn({ err, key }, 'geo:cache_write_failed')
  })
  return fresh
}

/** Provider failures are upstream problems, not client mistakes. */
function toAppError(err: unknown): never {
  if (err instanceof GeoProviderError) {
    throw new AppError(502, err.message, 'GEO_PROVIDER_ERROR')
  }
  throw err
}

export const geoService = {
  /**
   * Address suggestions while typing.
   *
   * Not cached on the `near` bias — including a moving map centre in the key
   * would make almost every keystroke a miss, which defeats the point. The
   * query text alone is the key; the bias only reorders results.
   */
  async autocomplete(query: AutocompleteQuery): Promise<GeoPlace[]> {
    const provider = getGeoProvider()
    const key = cacheKey('autocomplete', query.q.toLowerCase())

    try {
      return await cached(key, () =>
        provider.autocomplete(
          query.q,
          query.lat !== undefined && query.lng !== undefined
            ? { lat: query.lat, lng: query.lng }
            : undefined,
          query.sessionToken
        )
      )
    } catch (err) {
      toAppError(err)
    }
  },

  /** Coordinates → address. Called once, after a pin is dropped. */
  async reverse(query: ReverseQuery): Promise<GeoPlace | null> {
    const provider = getGeoProvider()
    const key = cacheKey(
      'reverse',
      `${roundForKey(query.lat)},${roundForKey(query.lng)}`
    )

    try {
      return await cached(key, () => provider.reverse(query.lat, query.lng))
    } catch (err) {
      toAppError(err)
    }
  },

  /** Address text → coordinates. */
  async geocode(query: GeocodeQuery): Promise<GeoPlace[]> {
    const provider = getGeoProvider()
    const key = cacheKey('geocode', query.q.toLowerCase())

    try {
      return await cached(key, () => provider.geocode(query.q))
    } catch (err) {
      toAppError(err)
    }
  },

  /**
   * Resolves a Google Maps link a vendor pasted into a location.
   *
   * When the link carries coordinates we use them directly. When it carries only
   * an address — which is the common case for an expanded share link — we geocode
   * that. This is why it belongs here rather than in `lib/geo/maps-link`: the
   * geocode goes through whichever provider is configured, and its result is
   * cached like any other.
   *
   * Never throws for a bad link. A warning plus whatever was salvageable is more
   * useful than an error, because the map picker is right there and dropping a
   * pin by hand always works.
   */
  async resolveMapsLink(query: MapsLinkQuery) {
    const link = await resolveMapsLink(query.url)

    if (link.lat !== null && link.lng !== null) {
      return { ...link, source: 'link' as const }
    }

    if (!link.address) return { ...link, source: null }

    try {
      const [best] = await this.geocode({ q: link.address })
      if (!best || best.lat === null || best.lng === null) {
        return { ...link, warning: link.warning ?? 'no_location_found', source: null }
      }
      return {
        lat: best.lat,
        lng: best.lng,
        address: best.formatted ?? link.address,
        warning: link.warning,
        source: 'geocoded' as const,
      }
    } catch (err) {
      logger.warn({ err }, 'geo:maps_link_geocode_failed')
      return { ...link, warning: link.warning ?? 'no_location_found', source: null }
    }
  },

  /**
   * Driving distance and time for ONE garage, on demand.
   *
   * Deliberately never called for a list. Unlike geocoding — where a garage is
   * geocoded once and a customer's location comes free from GPS — routing scales
   * with browsing traffic, which is the one thing that could actually burn the
   * free tier. Restricting it to a single explicit request on a garage page
   * keeps it bounded, and the cache keeps repeats free.
   *
   * Returns null rather than throwing when the provider cannot answer or does
   * not do routing at all: callers already have a straight-line distance and
   * must degrade to it rather than showing an error.
   */
  async route(query: RouteQuery): Promise<GeoRoute | null> {
    const provider = getGeoProvider()
    if (!provider.route) return null

    const from = {
      lat: Number(roundForKey(query.fromLat)),
      lng: Number(roundForKey(query.fromLng)),
    }
    const to = {
      lat: Number(roundForKey(query.toLat)),
      lng: Number(roundForKey(query.toLng)),
    }

    // Rounded into the key the same way reverse geocoding is, so everyone on
    // one street shares a route rather than each paying for their own.
    const key = cacheKey(
      'route',
      `${from.lat},${from.lng}->${to.lat},${to.lng}`
    )

    try {
      return await cached(key, () => provider.route!(from, to))
    } catch (err) {
      logger.warn({ err }, 'geo:route_failed')
      // A missing travel time is a missing nicety, not a broken page.
      return null
    }
  },

  /**
   * Fills in coordinates for an autocomplete row that arrived without them.
   * Callers always call this before using a picked suggestion — it is a no-op
   * for providers whose autocomplete already returns coordinates, so the
   * frontend never branches on which provider is configured.
   */
  async resolve(query: ResolveQuery): Promise<GeoPlace> {
    const provider = getGeoProvider()
    const key = cacheKey('details', query.placeId)

    try {
      return await cached(key, () =>
        provider.resolve(
          {
            providerPlaceId: query.placeId,
            provider: provider.name,
            label: '',
            formatted: null,
            lat: null,
            lng: null,
            city: null,
            pincode: null,
            confidence: null,
          },
          query.sessionToken
        )
      )
    } catch (err) {
      toAppError(err)
    }
  },
}
