'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { dismissReviewPrompt } from '@repo/core/api/bookings'
import {
  dismissNotice,
  dismissOffer,
  getHome,
  getUpdates,
  markUpdatesSeen,
  type HomeData,
} from '@repo/core/api/home'
import { updateVehicle, type WashIntervalDays } from '@repo/core/api/users'
import { useUserStore } from '@repo/core/stores/user-store'

/**
 * Home and Updates are one derived read each on the server: nothing on them
 * can be patched reliably from here (an × moves the next offer up, a payment
 * moves the bill card, the bell, the tile and the feed at once). So every
 * write invalidates both and lets the server say what Home is now.
 */
export const homeKeys = {
  all: ['home'] as const,
  home: (origin: { lat: number; lng: number } | null) =>
    [...homeKeys.all, origin?.lat ?? null, origin?.lng ?? null] as const,
  updates: () => [...homeKeys.all, 'updates'] as const,
}

/**
 * Marks Home and Updates stale after anything that changes them — a booking
 * made, paid, moved or cancelled, a bill paid, a review left — so the next
 * look at Home is fresh rather than up to 30 seconds old.
 */
export function invalidateHome(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: homeKeys.all })
}

/**
 * The Home hub. `origin` is the rounded location, when the app has one, for
 * the Nearby card. 30 seconds fresh and refetched when the app comes back to
 * the foreground: a garage accepting or a bill arriving should be there when
 * the customer looks again, without a pull.
 *
 * The origin is part of the key, so turning on location or picking a place
 * on /garages starts a new query. `keepPreviousData` keeps the Home already
 * on screen until that one lands: only the Nearby card depends on the
 * origin, and blanking the whole page into the skeleton (losing the scroll)
 * to update one card would be worse than a moment of the old count.
 */
export function useHome(origin: { lat: number; lng: number } | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: homeKeys.home(origin),
    queryFn: () => getHome(origin),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}

export function useUpdates() {
  return useQuery({
    queryKey: homeKeys.updates(),
    queryFn: getUpdates,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

/** Moves the read marker to `at`, the server's own `now` from the feed. */
export function useMarkUpdatesSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (at: string) => markUpdatesSeen(at),
    onSuccess: () => {
      // Home's bell only; the Updates screen keeps the dots it opened with
      // until the customer marks them read, so it is not refetched here.
      void queryClient.invalidateQueries({
        queryKey: homeKeys.all,
        predicate: (query) => query.queryKey[1] !== 'updates',
      })
    },
  })
}

/**
 * Takes a card off every cached Home at once, before the server answers, so
 * the × feels instant; the refetch after puts back whatever should be there.
 */
function hideOnHomes(queryClient: QueryClient, edit: (home: HomeData) => HomeData) {
  for (const [key, home] of queryClient.getQueriesData<HomeData>({ queryKey: homeKeys.all })) {
    if (home && 'header' in home) queryClient.setQueryData(key, edit(home))
  }
}

export function useDismissOffer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (discountId: string) => dismissOffer(discountId),
    onMutate: async (discountId) => {
      await queryClient.cancelQueries({ queryKey: homeKeys.all })
      hideOnHomes(queryClient, (home) => ({
        ...home,
        offers: home.offers?.filter((offer) => offer.id !== discountId) ?? null,
      }))
    },
    onSettled: () => void invalidateHome(queryClient),
  })
}

export function useDismissNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noticeId: string) => dismissNotice(noticeId),
    onMutate: async (noticeId) => {
      await queryClient.cancelQueries({ queryKey: homeKeys.all })
      hideOnHomes(queryClient, (home) => ({
        ...home,
        cars: home.cars.map((car) =>
          car.rightTile.kind === 'next_booking' && car.rightTile.notice?.noticeId === noticeId
            ? { ...car, rightTile: { ...car.rightTile, notice: null } }
            : car
        ),
        updates: home.updates && {
          ...home.updates,
          pinnedNotice: home.updates.pinnedNotice?.id === noticeId ? null : home.updates.pinnedNotice,
          items: home.updates.items.filter((item) => item.noticeId !== noticeId),
        },
      }))
    },
    onSettled: () => void invalidateHome(queryClient),
  })
}

export function useDismissReviewPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bookingId: string) => dismissReviewPrompt(bookingId),
    onMutate: async (bookingId) => {
      await queryClient.cancelQueries({ queryKey: homeKeys.all })
      hideOnHomes(queryClient, (home) =>
        home.softCard?.kind === 'rate' && home.softCard.bookingId === bookingId
          ? { ...home, softCard: null }
          : home
      )
    },
    onSettled: () => void invalidateHome(queryClient),
  })
}

/**
 * The wash interval of one car, from the wash bar's sheet. Null goes back to
 * the default. The saved car also replaces the user store's copy, which
 * checkout and the profile read.
 */
export function useUpdateWashInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ vehicleId, days }: { vehicleId: string; days: WashIntervalDays | null }) =>
      updateVehicle(vehicleId, { washIntervalDays: days }),
    onSuccess: (saved) => {
      useUserStore.setState((state) => ({
        vehicles: state.vehicles.map((vehicle) =>
          vehicle.id === saved.id ? { ...vehicle, washIntervalDays: saved.washIntervalDays } : vehicle
        ),
      }))
      void invalidateHome(queryClient)
    },
  })
}
