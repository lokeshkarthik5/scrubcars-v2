/**
 * The zone finder's list (0064, mockup zone-finder), outside the page: the
 * sort, what may be ticked, and the summary line. Pure, unit-tested in
 * finder.test.ts. Merging Google and Ola and marking what is known happen on
 * the server (lib/places/merge.ts).
 */
import type {
  FoundPlace,
  PlacesSearchResult,
} from '@repo/core/api/admin-coverage'
import { LEAD_STATUS_LABELS, type PlaceKind } from '@repo/core/leads'

export type FinderSort = 'reviews' | 'rating' | 'nearest'

export const FINDER_SORTS: Array<{ value: FinderSort; label: string }> = [
  { value: 'reviews', label: 'Most reviews' },
  { value: 'rating', label: 'Rating' },
  { value: 'nearest', label: 'Nearest' },
]

/** The kinds ticked when the finder opens: everything but tyres, as the mockup. */
export const DEFAULT_FINDER_KINDS: PlaceKind[] = [
  'car_wash',
  'detailing',
  'workshop',
  'doorstep',
]

const byNumberDesc = (a: number | null, b: number | null) =>
  (b ?? -1) - (a ?? -1)

/**
 * Most reviews (then rating), Rating (then reviews), or Nearest. A place
 * with no rating or reviews goes after those with; ties keep the order the
 * server gave.
 */
export function sortPlaces(
  places: readonly FoundPlace[],
  sort: FinderSort
): FoundPlace[] {
  const indexed = places.map((place, index) => ({ place, index }))
  indexed.sort((a, b) => {
    let order = 0
    if (sort === 'reviews') {
      order =
        byNumberDesc(a.place.reviewCount, b.place.reviewCount) ||
        byNumberDesc(a.place.rating, b.place.rating)
    } else if (sort === 'rating') {
      order =
        byNumberDesc(a.place.rating, b.place.rating) ||
        byNumberDesc(a.place.reviewCount, b.place.reviewCount)
    } else {
      order = a.place.distanceKm - b.place.distanceKm
    }
    return order || a.index - b.index
  })
  return indexed.map(({ place }) => place)
}

/** Only places the team does not know yet can be ticked. */
export const canTick = (place: FoundPlace) => place.known === null

/** "31 found (Google 24 · Ola 12 · 5 in both) · 22 new · 9 known". */
export function finderSummary(counts: PlacesSearchResult['counts']): string {
  return `${counts.found} found (Google ${counts.google} · Ola ${counts.ola} · ${counts.both} in both) · ${counts.new} new · ${counts.known} known`
}

/** A known place's status chip: Onboarded / Not live yet for a garage, the lead's status for a lead. */
export function knownLabel(known: NonNullable<FoundPlace['known']>): string {
  if (known.status === 'live') return 'Onboarded'
  if (known.status === 'not_live') return 'Garage, not live yet'
  return known.status === 'to_target'
    ? 'Lead'
    : LEAD_STATUS_LABELS[known.status]
}

/** The line under a known place: who has it, or why not. */
export function knownDetail(known: NonNullable<FoundPlace['known']>): string {
  if (known.kind === 'garage') return `Matches your garage ${known.name}`
  if (known.status === 'not_interested' && known.notInterestedReason)
    return `“${known.notInterestedReason}”`
  return known.assignedName
    ? `Already a lead · ${known.assignedName}`
    : 'Already a lead'
}

/** "3 ticked · become leads in Anna Nagar, status To target". */
export function addLine(count: number, zoneName: string): string {
  return `${count} ticked · become leads in ${zoneName}, status To target`
}
