'use client'

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { getVendors, type VendorListParams } from '@repo/core/api/vendors'
import type { Vendor } from '@repo/core/types'

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
  isError: boolean
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
    // refresh and the full loading state is kept for the very first load.
    isLoading: query.isPending,
    isRefreshing,
    isFetchingMore: query.isFetchingNextPage,
    isError: query.isError,
    loadMore: () => {
      if (hasMore && !query.isFetchingNextPage) {
        void query.fetchNextPage()
      }
    },
  }
}
