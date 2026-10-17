'use client'

import { keepPreviousData, queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ApiError } from '@repo/core/api/client'
import { getVendorPackages } from '@repo/core/api/packages'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getVendorServices } from '@repo/core/api/services'
import { getPublicVendor, getVendors, type VendorListParams } from '@repo/core/api/vendors'
import { mapPublicVendor } from '@repo/core/api/mappers'
import type { Service, ServicePackage, Vendor } from '@repo/core/types'

/**
 * The paginated garage listing, shared by the home feed, the search page and
 * the map view.
 *
 * All three want the same thing — a cursor-paged, server-sorted list — so the
 * fetch, the page accumulation and the "which radius actually answered this"
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
   * The radius that produced these results. Differs from the requested one when
   * the search auto-widened, which the UI is expected to say out loud.
   */
  appliedRadiusKm: number | null
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
  })

  const pages = query.data?.pages ?? []
  // The pages on screen are the previous query's. Paging them on would ask
  // the new query for a "next" page of a list it has not fetched yet.
  const isRefreshing = query.isPlaceholderData
  const hasMore = query.hasNextPage && !isRefreshing

  return {
    vendors: pages.flatMap((page) => page.vendors),
    // The first page decides the radius: later pages are drawn from the same
    // bounded candidate set, so a later page's value would say nothing new.
    appliedRadiusKm: pages[0]?.appliedRadiusKm ?? null,
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
  packages: ServicePackage[]
}

/**
 * Everything the garage page needs before it can show anything, as one query.
 *
 * One rather than three because the page is only useful with all of it: a
 * garage with its services missing reads as a garage that offers nothing.
 * A 404 is a real answer (the garage is not listed) and comes back as `null`
 * data; anything else is an error the page offers to retry.
 */
export function useGarage(id: string) {
  return useQuery(garageQuery(id))
}

/**
 * The garage page's query, for a screen that needs the same answer without
 * mounting the page: checkout reads it with `fetchQuery`, so Book Now from
 * the garage page opens checkout on what is already cached (under a minute
 * old) instead of fetching the garage, its services and its packages again.
 */
export function garageQuery(id: string) {
  return queryOptions({
    queryKey: vendorKeys.garage(id),
    queryFn: async (): Promise<GarageData | null> => {
      try {
        const [vendor, services, packages] = await Promise.all([
          getPublicVendor(id),
          getVendorServices(id),
          getVendorPackages(id),
        ])
        return { vendor: mapPublicVendor(vendor), services, packages }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}

/**
 * A garage's public reviews, beside its page. Kept five minutes: reviews
 * change slowly, and going back to a garage from checkout or a photo should
 * show them at once rather than fetch them again. A failed load is no
 * reviews, as it always was: the page is still one someone can book from.
 */
export function useVendorReviews(id: string) {
  return useQuery({
    queryKey: [...vendorKeys.all, 'reviews', id] as const,
    queryFn: () => getVendorReviews(id),
    staleTime: 5 * 60_000,
  })
}
