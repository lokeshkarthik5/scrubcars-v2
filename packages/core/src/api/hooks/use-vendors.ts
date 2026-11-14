'use client'

import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { ApiError } from '@repo/core/api/client'
import { getVendorPackages } from '@repo/core/api/packages'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getVendorAddOns, type AddOn } from '@repo/core/api/add-ons'
import {
  getPublicVendor,
  getVendors,
  type JustOutsideVendor,
  type VendorListParams,
  type VendorListResult,
} from '@repo/core/api/vendors'
import type { ApiReachFigures } from '@repo/core/api/types'
import { mapPublicVendor, mapService } from '@repo/core/api/mappers'
import type { Service, ServicePackage, Vendor } from '@repo/core/types'

/**
 * The paginated garage listing, shared by the home feed, the search page and
 * the map view.
 *
 * All three want the same thing — a cursor-paged, server-sorted list — so the
 * fetch, the page accumulation and the "how far did this list reach"
 * bookkeeping live here rather than three times over.
 */

export const vendorKeys = {
  all: ['vendors'] as const,
  list: (params: VendorListParams) => [...vendorKeys.all, 'list', params] as const,
  garage: (id: string) => [...vendorKeys.all, 'garage', id] as const,
}

export interface VendorSearchResult {
  vendors: Vendor[]
  /**
   * How far from the customer the list reached, in km (50 unless the caller
   * asked for less), or null when no radius applied: no location, doorstep,
   * the map's viewport, or a typed search.
   */
  radiusKm: number | null
  /** What each tab offers the customer (the first page's; null when unknown). */
  reach: ApiReachFigures | null
  /** Doorstep and Pickup & drop's "Just outside their area" group (the first page's). */
  outside: JustOutsideVendor[] | null
  hasMore: boolean
  /** True only on a first load, when there is nothing to show yet. */
  isLoading: boolean
  /**
   * True while the list on screen still belongs to the previous filters and
   * the new results are on their way. Only ever set with `keepPrevious`.
   */
  isRefreshing: boolean
  isFetchingMore: boolean
  /**
   * The list could not be fetched at all. Distinct from an empty answer: "no
   * garages nearby" is a fact about the area, this is a fact about the
   * connection, and showing the first for the second sends people away.
   */
  isError: boolean
  /** Try the failed fetch again. */
  retry: () => void
  loadMore: () => void
}

export function useVendorSearch(
  params: VendorListParams,
  options?: {
    enabled?: boolean
    /**
     * Keep the current results on screen while a changed filter loads, rather
     * than dropping back to the loading state.
     *
     * Opt-in because it suits a list and not a map: switching mode or sort on
     * a list should not blank the page and throw away the scroll position,
     * but the map re-searches when it moves somewhere else entirely, and pins
     * left over from the previous area would sit in the wrong place.
     */
    keepPrevious?: boolean
    /**
     * The first page as the server already rendered it (the landing page,
     * 0062), so the list is on screen in the HTML. Used only for the exact
     * params it was fetched with.
     */
    initialPage?: VendorListResult
  }
): VendorSearchResult {
  const query = useInfiniteQuery({
    queryKey: vendorKeys.list(params),
    queryFn: ({ pageParam }) =>
      getVendors({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    // A garage's details do not change while someone scrolls a list, and
    // refetching every page on focus would multiply the query cost for nothing.
    staleTime: 60_000,
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
    initialData: options?.initialPage
      ? { pages: [options.initialPage], pageParams: [undefined] }
      : undefined,
  })

  const pages = query.data?.pages ?? []
  // The pages on screen are the previous query's. Paging them on would ask
  // the new query for a "next" page of a list it has not fetched yet.
  const isRefreshing = query.isPlaceholderData
  const hasMore = query.hasNextPage && !isRefreshing

  // The same array until the pages change, so a list (or the map peek) that
  // memoises on it is not rebuilt by every render of the screen above it.
  const data = query.data
  const vendors = useMemo(() => (data?.pages ?? []).flatMap((page) => page.vendors), [data])

  return {
    vendors,
    // From the first page: every page of one list is searched with the same
    // radius, so a later page's value would say nothing new.
    radiusKm: pages[0]?.radiusKm ?? null,
    reach: pages[0]?.reach ?? null,
    outside: pages[0]?.outside ?? null,
    hasMore,
    // Placeholder data counts as success, so this stays false through a
    // refresh and the full loading state is kept for the very first load. A
    // retry after a failure is a first load again, as far as the screen goes.
    isLoading: query.isPending || (query.isError && query.isFetching && pages.length === 0),
    isRefreshing,
    isFetchingMore: query.isFetchingNextPage,
    // Only when nothing is on screen: a later page failing to load leaves the
    // garages already shown where they are, and the sentinel tries again.
    isError: query.isError && !query.isFetching && pages.length === 0,
    retry: () => {
      void query.refetch()
    },
    loadMore: () => {
      if (hasMore && !query.isFetchingNextPage) {
        void query.fetchNextPage()
      }
    },
  }
}

/** A garage's page: the garage and everything it sells. */
export interface GarageData {
  vendor: Vendor
  services: Service[]
  /** Listed under the services, picked at checkout (0068). */
  addOns: AddOn[]
  packages: ServicePackage[]
}

/**
 * Everything the garage page needs before it can show anything, as one query.
 *
 * One rather than three because the page is only useful with all of it: a
 * garage with its services missing reads as a garage that offers nothing.
 * A 404 is a real answer (the garage is not listed) and comes back as `null`
 * data; anything else is an error the page offers to retry.
 *
 * While it loads, the garage as the list or the map last showed it stands in
 * (`isPlaceholderData`, with no catalogue yet), so the name, photo, rating
 * and distance are on screen at once and only the services wait.
 */
export function useGarage(id: string) {
  const queryClient = useQueryClient()
  return useQuery({
    ...garageQuery(id),
    placeholderData: () => garagePlaceholder(queryClient, id),
  })
}

/**
 * The garage as a list or the map already has it (any page of any
 * useVendorSearch), with an empty catalogue: what the garage page paints
 * before its own read lands. Undefined when no list on this visit had it.
 */
export function garagePlaceholder(queryClient: QueryClient, id: string): GarageData | undefined {
  const lists = queryClient.getQueriesData<InfiniteData<VendorListResult>>({
    queryKey: [...vendorKeys.all, 'list'],
  })
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const vendor = page.vendors.find((v) => v.id === id)
      if (vendor) return { vendor, services: [], packages: [], addOns: [] }
    }
  }
  return undefined
}

/**
 * Start the garage page's read before the page is open: on a card's
 * pointer-down or hover, and on /garage/* while the session is still being
 * checked. A read already fresh in the cache is not repeated.
 */
export function prefetchGarage(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery(garageQuery(id))
}

/**
 * The garage page's query, for a screen that needs the same answer without
 * mounting the page: checkout reads it with `fetchQuery`, so Book Now from
 * the garage page opens checkout on what is already cached instead of
 * fetching the garage, its services and its packages again.
 *
 * The services come inside the garage's own read (`/vendors/:id` carries the
 * same rows `/vendors/:id/services` returns, mapped the same way), so the
 * page costs one request fewer (speed fix 3, customer UI round).
 */
export function garageQuery(id: string) {
  return queryOptions({
    queryKey: vendorKeys.garage(id),
    queryFn: async (): Promise<GarageData | null> => {
      try {
        const [vendor, packages, addOns] = await Promise.all([
          getPublicVendor(id),
          getVendorPackages(id),
          // Extras only: a failure here must never lose the garage's page.
          getVendorAddOns(id).catch(() => [] as AddOn[]),
        ])
        return {
          vendor: mapPublicVendor(vendor),
          services: vendor.services.map((service) => mapService(service, id)),
          packages,
          addOns,
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}

/** How long checkout takes the garage page's read as current: five minutes. */
export const CHECKOUT_GARAGE_STALE_MS = 5 * 60_000

/**
 * A garage's public reviews, beside its page. Kept five minutes: reviews
 * change slowly, and going back to a garage from checkout or a photo should
 * show them at once rather than fetch them again. A failed load is no
 * reviews, as it always was: the page is still one someone can book from.
 */
export function useVendorReviews(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...vendorKeys.all, 'reviews', id] as const,
    queryFn: () => getVendorReviews(id),
    staleTime: 5 * 60_000,
    // The garage page asks only once the Reviews tab is opened (speed fix
    // 8): the count is already on the garage, so the tab needs no list to
    // say how many.
    enabled: options?.enabled ?? true,
  })
}
