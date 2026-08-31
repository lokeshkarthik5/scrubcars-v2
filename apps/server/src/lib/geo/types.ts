/**
 * Provider-neutral geocoding contract.
 *
 * Ola Maps is the first implementation (best data for Indian addresses), but
 * nothing outside this directory is allowed to know that. Provider choice is
 * the least durable decision in the geo stack — free tiers change, per-city
 * data quality varies, and Google or MapmyIndia may win later on one specific
 * capability — so it gets an interface.
 *
 * The rule that makes a swap actually cheap: normalise INSIDE the adapter.
 * Confidence scores, address component names and pincode fields differ wildly
 * between providers. If any of that leaks past the adapter you have not built
 * an adapter, you have built a rename.
 *
 * See plans/geo.md §5.
 */

/** Where a stored coordinate came from. Mirrors the `geo_source` pg enum. */
export const GEO_SOURCES = [
  'unset',
  'gps',
  'map_pin',
  'geocoded',
  'admin',
] as const

export type GeoSource = (typeof GEO_SOURCES)[number]

export type GeoProviderName =
  | 'ola'
  | 'google'
  | 'mappls'
  | 'geoapify'
  | 'locationiq'

/**
 * One place, in whatever shape the caller needs it.
 *
 * `lat`/`lng` are null for autocomplete rows from providers that only return
 * coordinates on a follow-up details call. Callers must not branch on that —
 * they call `resolve()`, which is a no-op for providers that already had them.
 */
export interface GeoPlace {
  /**
   * The provider's opaque id. Only meaningful to the provider that issued it,
   * which is why anything persisting this must persist `provider` alongside.
   * Coordinates are the durable artifact; place ids are not.
   */
  providerPlaceId: string | null
  provider: GeoProviderName
  /** Short label for a dropdown row. */
  label: string
  /** Full formatted address, when the provider gives one. */
  formatted: string | null
  lat: number | null
  lng: number | null
  city: string | null
  pincode: string | null
  /** Normalised to 0..1 by the adapter. Null when the provider reports none. */
  confidence: number | null
}

/** A driving estimate between two points. */
export interface GeoRoute {
  /** Road distance in metres — not the straight line. */
  distanceM: number
  /** Typical driving time in seconds, for current conditions if the provider models them. */
  durationS: number
}

export interface GeoProvider {
  readonly name: GeoProviderName

  /**
   * Typing an address. `near` biases results toward the user's current map
   * view, which matters a lot in India where the same locality name recurs
   * across cities.
   *
   * `sessionToken` groups a keystroke sequence into one billable session for
   * providers that support it. Callers pass one token per picker session.
   */
  autocomplete(
    q: string,
    near?: { lat: number; lng: number },
    sessionToken?: string
  ): Promise<GeoPlace[]>

  /** Address text → coordinates. */
  geocode(q: string): Promise<GeoPlace[]>

  /** Coordinates → address. Used after a pin drop. */
  reverse(lat: number, lng: number): Promise<GeoPlace | null>

  /**
   * Fills in coordinates for an autocomplete row that arrived without them.
   * Adapters whose autocomplete already returns coordinates return the place
   * unchanged, so callers never branch on provider.
   */
  resolve(place: GeoPlace, sessionToken?: string): Promise<GeoPlace>

  /**
   * Driving distance and time between two points.
   *
   * Optional: not every provider offers routing, and callers must degrade to
   * the straight-line distance rather than failing. Unlike the geocoding calls,
   * this one's volume tracks *traffic* rather than one-off saves, so it is only
   * ever called on demand for a single garage — never for a list.
   */
  route?(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): Promise<GeoRoute | null>
}

/** Thrown by adapters for anything the provider itself rejected or fumbled. */
export class GeoProviderError extends Error {
  constructor(
    public readonly provider: GeoProviderName,
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = 'GeoProviderError'
  }
}
