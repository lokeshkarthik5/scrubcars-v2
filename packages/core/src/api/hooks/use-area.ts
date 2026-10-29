'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAreaStatus,
  leaveAreaList,
  markLaunchBannerSeen,
  recommendGarage,
  signUpForArea,
  type RecommendInput,
} from '@repo/core/api/area'
import { zoneKeys } from './use-zones'

export const areaKeys = { status: ['area', 'status'] as const }

/**
 * Home's live status (0062): open requests, area sign-ups, a free wash ready
 * and the launch banner. Signed-in customers only; an API without the route
 * yet (it deploys after the app) shows nothing, never an error.
 */
export function useAreaStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: areaKeys.status,
    queryFn: getAreaStatus,
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000,
    retry: false,
  })
}

export function useSignUpForArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signUpForArea,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.status })
      void queryClient.invalidateQueries({ queryKey: zoneKeys.all })
    },
  })
}

/** Leave an area's list and its messages (0066). */
export function useLeaveAreaList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: leaveAreaList,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.status })
      void queryClient.invalidateQueries({ queryKey: zoneKeys.all })
    },
  })
}

export function useMarkBannerSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markLaunchBannerSeen,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: areaKeys.status }),
  })
}

export function useRecommendGarage() {
  return useMutation({ mutationFn: (input: RecommendInput) => recommendGarage(input) })
}
