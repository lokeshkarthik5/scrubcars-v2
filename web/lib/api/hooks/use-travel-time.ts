'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export interface TravelEstimate {
  /** Road distance in metres — not the straight line. */
  distanceM: number
  /** Typical driving time in seconds. */
  durationS: number
}

/**
 * Driving time from the customer to one garage.
 *
 * Deliberately per-garage and on demand. Every other geo call in this app is
 * either free (browser GPS) or paid once and cached forever (a garage geocoded
 * at onboarding); routing is the only one whose volume tracks *browsing*, which
 * is the one thing that could actually burn the provider's free tier. So it is
 * never called for a list — only here, for the one garage someone opened.
 *
 * Returns null when routing is unavailable. The caller already has a
 * straight-line distance and must degrade to it rather than showing an error:
 * a missing travel time is a missing nicety, not a broken page.
 */
export function useTravelTime(
  from: { lat: number; lng: number } | null | undefined,
  to: { lat: number | null; lng: number | null } | null | undefined
) {
  const enabled =
    !!from && !!to && to.lat !== null && to.lng !== null

  return useQuery({
    queryKey: ['travel-time', from?.lat, from?.lng, to?.lat, to?.lng],
    queryFn: () =>
      apiClient<TravelEstimate | null>('/geo/route', {
        auth: false,
        params: {
          fromLat: from!.lat,
          fromLng: from!.lng,
          toLat: to!.lat as number,
          toLng: to!.lng as number,
        },
      }),
    enabled,
    // Traffic shifts, but not fast enough to justify re-asking within a session,
    // and each refetch is a billable call.
    staleTime: 15 * 60_000,
    retry: false,
  })
}

/**
 * Seconds to minutes, for handing to `formatDuration` in lib/utils — which
 * already speaks minutes and is what every other duration in the app goes
 * through. One duration formatter, not two that round differently.
 */
export function toMinutes(seconds: number): number {
  return Math.round(seconds / 60)
}
