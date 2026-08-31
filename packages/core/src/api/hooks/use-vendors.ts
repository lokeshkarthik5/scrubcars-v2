'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
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
  isLoading: boolean
  isFetchingMore: boolean
  isError: boolean
  loadMore: () => void
}

export function useVendorSearch(
  params: VendorListParams,
  options?: { enabled?: boolean }
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
  })

  const pages = query.data?.pages ?? []

  return {
    vendors: pages.flatMap((page) => page.vendors),
    // The first page decides the radius: later pages are drawn from the same
    // bounded candidate set, so a later page's value would say nothing new.
    appliedRadiusKm: pages[0]?.appliedRadiusKm ?? null,
    hasMore: query.hasNextPage,
    isLoading: query.isPending,
    isFetchingMore: query.isFetchingNextPage,
    isError: query.isError,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage()
      }
    },
  }
}
