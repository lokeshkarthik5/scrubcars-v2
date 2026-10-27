'use client'

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  addAdminBookingNote,
  cancelAdminBooking,
  getAdminBooking,
  getAdminBookingViewCounts,
  listAdminBookings,
  markAdminBookingNoShow,
  overrideAdminPickupStep,
  waiveAdminJobPhotos,
  type AdminBooking,
  type AdminBookingDetail,
  type AdminBookingFilters,
  type AdminBookingViewCountFilters,
  type BookingParty,
  type CancelledOnBehalfOf,
} from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'

/**
 * Hierarchical keys, the same shape as `adminVendorKeys`: the filters live
 * inside the list key so each filtered list caches on its own, and one
 * invalidate of `lists()` after an action refreshes all of them.
 */
export const adminBookingKeys = {
  all: ['admin-bookings'] as const,
  lists: () => [...adminBookingKeys.all, 'list'] as const,
  list: (filters: Omit<AdminBookingFilters, 'page' | 'cursor'>) =>
    [...adminBookingKeys.lists(), filters] as const,
  details: () => [...adminBookingKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminBookingKeys.details(), id] as const,
  /** The saved views' counts (0059), per set of the list's filters. */
  viewCounts: (filters: AdminBookingViewCountFilters) =>
    [...adminBookingKeys.all, 'view-counts', filters] as const,
}

/** Rows per page. The server caps a page at 200. */
export const ADMIN_BOOKINGS_PAGE_SIZE = 100

/** How often an open list or booking refetches, so a new booking shows up on its own. */
const REFRESH_MS = 30_000
/** The bookings list's own refresh: once a minute (see useAdminBookings). */
const LIST_REFRESH_MS = 60_000

/**
 * Where the page after `row` starts, in the form the server reads: the row's
 * scheduled time and id, which together are its place in the list's order.
 */
export function adminBookingsCursor(
  row: Pick<AdminBooking, 'scheduledAt' | 'id'>
): string {
  return `${new Date(row.scheduledAt).toISOString()}_${row.id}`
}

/**
 * The loaded pages as one list, each booking once.
 *
 * Paging by position already keeps a booking from crossing a page boundary,
 * but one can still move between two pages that were fetched at different
 * times (a pending booking rescheduled while ops scrolls). Keeping the first
 * copy means the screen and the export never show it twice.
 */
export function flattenAdminBookingPages(
  pages: readonly AdminBooking[][] | undefined
): AdminBooking[] {
  const seen = new Set<string>()
  const rows: AdminBooking[] = []
  for (const row of pages?.flat() ?? []) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    rows.push(row)
  }
  return rows
}

/**
 * The bookings list, a page at a time.
 *
 * Refetches every 30 seconds while the screen is open — ops keeps it up on a
 * spare monitor to spot bookings waiting too long — and keeps showing the
 * previous results while a new filter loads, so typing in the search box
 * never blanks the list.
 *
 * Each page continues after the last row of the one before it, rather than at
 * an offset, so bookings arriving between a refresh and "Load more" neither
 * repeat nor go missing. A full page means there may be more; a short one
 * means that was the end.
 */
export function useAdminBookings(
  filters: Omit<AdminBookingFilters, 'page' | 'limit' | 'cursor'>
) {
  return useInfiniteQuery({
    queryKey: adminBookingKeys.list(filters),
    queryFn: ({ pageParam }) =>
      listAdminBookings({
        ...filters,
        limit: ADMIN_BOOKINGS_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      const last = lastPage.at(-1)
      return lastPage.length === ADMIN_BOOKINGS_PAGE_SIZE && last
        ? adminBookingsCursor(last)
        : undefined
    },
    placeholderData: keepPreviousData,
    // A minute, not 30 s: the Needs action view (the default) also reads the
    // refunds owed, a heavy read on the API's one connection per instance.
    refetchInterval: LIST_REFRESH_MS,
  })
}

/**
 * How many bookings each saved view holds (0059). Never holds up the list:
 * read when the filters change and after booking actions, never on a timer
 * (it reads the refunds owed too; 27 Oct), the old counts kept while new filters load,
 * and an API older than the views (404) is not asked again, so the views
 * show without counts.
 */
export function useAdminBookingViewCounts(
  filters: AdminBookingViewCountFilters,
  enabled = true
) {
  const key = {
    q: filters.q || undefined,
    status: filters.status || undefined,
    vendorId: filters.vendorId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    test: filters.test || undefined,
    bookingType: filters.bookingType || undefined,
    payment: filters.payment || undefined,
  }
  return useQuery({
    queryKey: adminBookingKeys.viewCounts(key),
    queryFn: () => getAdminBookingViewCounts(key),
    enabled,
    staleTime: REFRESH_MS,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
  })
}

export function useAdminBooking(id: string) {
  return useQuery({
    queryKey: adminBookingKeys.detail(id),
    queryFn: () => getAdminBooking(id),
    enabled: Boolean(id),
    refetchInterval: REFRESH_MS,
  })
}

/**
 * Cancel and no-show both answer with the updated booking, so the detail is
 * written straight into the cache and every list is refetched — the row has
 * changed status and may have left a filtered list.
 *
 * A refusal usually means the booking moved on under ops (the garage accepted,
 * the customer cancelled), so the detail is refetched then too. Otherwise the
 * page would go on offering an action on a status that no longer exists until
 * the next 30-second refresh.
 */
function useBookingAction<TInput>(
  action: (id: string, input: TInput) => Promise<AdminBookingDetail>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TInput }) =>
      action(id, input),
    onSuccess: (booking) => {
      queryClient.setQueryData(adminBookingKeys.detail(booking.id), booking)
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: [...adminBookingKeys.all, 'view-counts'] })
    },
    onError: (_error, { id }) => {
      void queryClient.invalidateQueries({
        queryKey: adminBookingKeys.detail(id),
      })
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.lists() })
    },
  })
}

export function useCancelAdminBooking() {
  return useBookingAction(
    (id: string, input: { onBehalfOf: CancelledOnBehalfOf; reason: string }) =>
      cancelAdminBooking(id, input)
  )
}

export function useMarkAdminBookingNoShow() {
  return useBookingAction(
    (id: string, input: { party: BookingParty; note?: string }) =>
      markAdminBookingNoShow(id, input)
  )
}

/** Pickup & drop: Detlio confirms Picked up or Delivered without the customer's code. */
export function useOverrideAdminPickupStep() {
  return useBookingAction(
    (id: string, input: { step: 'picked_up' | 'delivered'; note: string }) =>
      overrideAdminPickupStep(id, input)
  )
}

/** Detlio waives the photo standard on one booking (0045). */
export function useWaiveAdminJobPhotos() {
  return useBookingAction((id: string, input: { reason: string }) =>
    waiveAdminJobPhotos(id, input)
  )
}

/**
 * A note is prepended to the cached detail rather than refetched, so it
 * appears the moment the server accepts it; the lists are refetched for their
 * notes count.
 */
export function useAddAdminBookingNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      addAdminBookingNote(id, body),
    onSuccess: (note, { id }) => {
      queryClient.setQueryData<AdminBookingDetail>(
        adminBookingKeys.detail(id),
        (booking) =>
          booking
            ? {
                ...booking,
                notes: [note, ...booking.notes],
                notesCount: booking.notesCount + 1,
              }
            : booking
      )
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.lists() })
    },
  })
}
