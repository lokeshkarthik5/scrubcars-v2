import { samePlace, type MatchReason, type PlaceLike } from '../lead-match.js'
import { LEAD_DUPLICATE_RADIUS_M } from '../leads.js'
import { straightLineKm } from '../service-city.js'
import { PLACE_KINDS, type PlaceKind } from './kinds.js'
import type { FoundPlace } from './types.js'

/**
 * The zone finder's one list (0064): Google's and Ola's answers merged so
 * the same business shows once with both tags, then marked against the
 * garages and leads the team already has. Pure, unit-tested in
 * merge.test.ts.
 */

/** Two sources' results are the same place: the same phone, or a similar name this close. */
export const PLACE_MERGE_RADIUS_M = 100

/** One source's own answer for a place, kept apart (Google's falls under its terms). */
export interface SourcePart {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  lat: number
  lng: number
}

/** What the team already has that a result looks like. */
export interface KnownPlace extends PlaceLike {
  kind: 'lead' | 'garage'
  id: string
  label: string
  /** A lead's status, or a garage's: live or not yet. */
  status: 'to_target' | 'not_interested' | 'onboarded' | 'live' | 'not_live'
  assignedName: string | null
  notInterestedReason: string | null
}

export interface MergedPlace {
  /** Stable within one answer: the Google id when Google found it, else Ola's. */
  key: string
  name: string
  address: string | null
  lat: number
  lng: number
  phone: string | null
  rating: number | null
  reviewCount: number | null
  kinds: PlaceKind[]
  google: SourcePart | null
  ola: SourcePart | null
  /** Straight-line km from the zone's centre, one decimal. */
  distanceKm: number
  known: {
    kind: 'lead' | 'garage'
    id: string
    name: string
    status: KnownPlace['status']
    assignedName: string | null
    notInterestedReason: string | null
    reason: MatchReason
  } | null
}

function part(place: FoundPlace): SourcePart {
  return {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    phone: place.phone,
    rating: place.rating,
    reviewCount: place.reviewCount,
    lat: place.lat,
    lng: place.lng,
  }
}

const orderedKinds = (kinds: Iterable<PlaceKind>) => {
  const set = new Set(kinds)
  return PLACE_KINDS.filter((kind) => set.has(kind))
}

/** One source's results with each place once (a place found by two kinds' searches keeps both kinds). */
export function dedupeSource(places: readonly FoundPlace[]): FoundPlace[] {
  const byId = new Map<string, FoundPlace>()
  for (const place of places) {
    const seen = byId.get(place.placeId)
    byId.set(
      place.placeId,
      seen
        ? { ...seen, kinds: orderedKinds([...seen.kinds, ...place.kinds]) }
        : { ...place, kinds: orderedKinds(place.kinds) }
    )
  }
  return [...byId.values()]
}

const likeOf = (place: FoundPlace): PlaceLike => ({
  name: place.name,
  phones: [place.phone],
  lat: place.lat,
  lng: place.lng,
})

/**
 * Google's and Ola's places as one list: an Ola place that is the same as
 * a Google one (same phone, or a similar name within 100 m) joins it, each
 * Google place taking one Ola place at most. What shows is Google's where
 * it has it (the fuller answer), Ola's otherwise.
 */
export function mergePlaces(
  google: readonly FoundPlace[],
  ola: readonly FoundPlace[],
  centre: { lat: number; lng: number }
): MergedPlace[] {
  const googles = dedupeSource(google)
  const olas = dedupeSource(ola)
  const taken = new Set<string>()
  const merged: MergedPlace[] = []

  const build = (g: FoundPlace | null, o: FoundPlace | null): MergedPlace => {
    const main = (g ?? o)!
    return {
      key: g ? `google:${g.placeId}` : `ola:${o!.placeId}`,
      name: main.name,
      address: g?.address ?? o?.address ?? null,
      lat: main.lat,
      lng: main.lng,
      phone: g?.phone ?? o?.phone ?? null,
      rating: g?.rating ?? o?.rating ?? null,
      reviewCount: g?.reviewCount ?? o?.reviewCount ?? null,
      kinds: orderedKinds([...(g?.kinds ?? []), ...(o?.kinds ?? [])]),
      google: g ? part(g) : null,
      ola: o ? part(o) : null,
      distanceKm: Math.round(straightLineKm(centre, main) * 10) / 10,
      known: null,
    }
  }

  for (const g of googles) {
    const twin = olas.find(
      (o) =>
        !taken.has(o.placeId) &&
        samePlace(likeOf(g), likeOf(o), PLACE_MERGE_RADIUS_M) !== null
    )
    if (twin) taken.add(twin.placeId)
    merged.push(build(g, twin ?? null))
  }
  for (const o of olas) {
    if (!taken.has(o.placeId)) merged.push(build(null, o))
  }
  return merged
}

/**
 * Each result marked with the garage or lead it already is, when it is one
 * (lead-match's rule: the same place id or phone, or a similar name within
 * 150 m, by either source's name). A place id match wins over the rest.
 */
export function markKnown(
  places: readonly MergedPlace[],
  known: readonly KnownPlace[]
): MergedPlace[] {
  return places.map((place) => {
    const candidates: PlaceLike[] = [place.google, place.ola]
      .filter((p): p is SourcePart => p !== null)
      .map((p) => ({
        name: p.name,
        phones: [place.google?.phone, place.ola?.phone],
        lat: p.lat,
        lng: p.lng,
        googlePlaceId: place.google?.placeId ?? null,
        olaPlaceId: place.ola?.placeId ?? null,
      }))
    let best: { match: KnownPlace; reason: MatchReason } | null = null
    for (const match of known) {
      for (const candidate of candidates) {
        const reason = samePlace(candidate, match, LEAD_DUPLICATE_RADIUS_M)
        if (
          reason &&
          (!best || (reason === 'place_id' && best.reason !== 'place_id'))
        )
          best = { match, reason }
      }
      if (best?.reason === 'place_id') break
    }
    return best
      ? {
          ...place,
          known: {
            kind: best.match.kind,
            id: best.match.id,
            name: best.match.label,
            status: best.match.status,
            assignedName: best.match.assignedName,
            notInterestedReason: best.match.notInterestedReason,
            reason: best.reason,
          },
        }
      : place
  })
}

/** "31 found (Google 24 · Ola 12 · 5 in both) · 22 new · 9 known". */
export function finderCounts(places: readonly MergedPlace[]) {
  const google = places.filter((place) => place.google).length
  const ola = places.filter((place) => place.ola).length
  const both = places.filter((place) => place.google && place.ola).length
  const known = places.filter((place) => place.known).length
  return {
    found: places.length,
    google,
    ola,
    both,
    known,
    new: places.length - known,
  }
}
