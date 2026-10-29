import type { PlaceKind } from './kinds.js'

/**
 * The zone finder's sources (0064): Google Places (New) Text Search and Ola
 * Maps' Places text search. Each adapter turns its provider's answer into
 * this one shape, so nothing past lib/places knows a provider's wire format.
 */

export type PlaceSourceName = 'google' | 'ola'

/** One business as one source found it. Phone is normalised (lib/leads.ts normalisePhone). */
export interface FoundPlace {
  source: PlaceSourceName
  placeId: string
  name: string
  address: string | null
  lat: number
  lng: number
  phone: string | null
  /** 0 to 5, one decimal; null when the source gives none. */
  rating: number | null
  reviewCount: number | null
  /** The kinds whose search found it (a car wash that also details is found twice). */
  kinds: PlaceKind[]
}

/** A Google place's details as read again for the 30-day refresh. */
export interface GooglePlaceDetails {
  name: string | null
  address: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  lat: number | null
  lng: number | null
}

export interface PlaceSearch {
  /** The words to search for. */
  text: string
  /** The kind this search stands for, or null for free words. */
  kind: PlaceKind | null
  centre: { lat: number; lng: number }
  radiusKm: number
}

export interface PlacesSource {
  readonly name: PlaceSourceName
  search(query: PlaceSearch): Promise<FoundPlace[]>
}

export interface GoogleDetailsSource {
  /** A place's details again; null when Google no longer knows the place. */
  details(placeId: string): Promise<GooglePlaceDetails | null>
}

/** Thrown by an adapter for anything the provider refused or fumbled. Never carries what was searched. */
export class PlacesProviderError extends Error {
  constructor(
    public readonly source: PlaceSourceName,
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = 'PlacesProviderError'
  }
}
