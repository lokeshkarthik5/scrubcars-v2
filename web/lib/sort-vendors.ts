import type { SortKey } from '@/components/sc/sort-sheet'
import type { Vendor } from '@/lib/types'

// A vendor with no priced services arrives as 0. That means "unknown", not
// "free", so it must never win a cheapest-first sort — and it isn't the most
// expensive either. Unpriced vendors sort last in both directions.
function hasPrice(vendor: Vendor): boolean {
  return vendor.startingPrice > 0
}

// Same idea for ratings: an unreviewed vendor is 0, which is not a bad score.
function hasRating(vendor: Vendor): boolean {
  return vendor.reviewCount > 0
}

/**
 * Pushes entries without the relevant data to the bottom, keeping their order
 * among themselves, and applies `compare` to the rest.
 */
function sortKnownFirst(
  list: Vendor[],
  known: (vendor: Vendor) => boolean,
  compare: (a: Vendor, b: Vendor) => number
): Vendor[] {
  const withData = list.filter(known)
  const withoutData = list.filter((vendor) => !known(vendor))
  return [...withData.sort(compare), ...withoutData]
}

/**
 * Orders a vendor list. Sorting is client-side: the list endpoint has no sort
 * param, and the pages already hold the full nearby set.
 *
 * Returns a new array; the input is not mutated.
 */
export function sortVendors(vendors: Vendor[], sort: SortKey): Vendor[] {
  const list = [...vendors]
  switch (sort) {
    case 'rating':
      return sortKnownFirst(list, hasRating, (a, b) => b.rating - a.rating)
    case 'price_asc':
      return sortKnownFirst(
        list,
        hasPrice,
        (a, b) => a.startingPrice - b.startingPrice
      )
    case 'price_desc':
      return sortKnownFirst(
        list,
        hasPrice,
        (a, b) => b.startingPrice - a.startingPrice
      )
    default:
      return list
  }
}
