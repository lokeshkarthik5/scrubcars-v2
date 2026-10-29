'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptRequest,
  cancelMyRequest,
  createRequest,
  declineRequest,
  getGarageRequestCount,
  getMyRequest,
  getRequestStartTimes,
  getRequestWindows,
  listGarageRequests,
  listMyRequests,
  type CreateRequestInput,
} from '@repo/core/api/booking-requests'
import type { RequestMode, TravelFee } from '@repo/core/booking-requests'
import { areaKeys } from './use-area'

export const requestKeys = {
  mine: ['requests', 'mine'] as const,
  one: (id: string) => ['requests', 'one', id] as const,
  windows: (vendorId: string, mode: RequestMode, durationMins: number) =>
    ['requests', 'windows', vendorId, mode, durationMins] as const,
  garage: (scope: 'open' | 'closed') => ['requests', 'garage', scope] as const,
  garageCount: ['requests', 'garage', 'count'] as const,
}

/** The windows a garage can be asked for (public; re-read each time the sheet opens). */
export function useRequestWindows(params: { vendorId: string; mode: RequestMode; durationMins: number } | null) {
  return useQuery({
    queryKey: params ? requestKeys.windows(params.vendorId, params.mode, params.durationMins) : ['requests', 'windows', 'none'],
    queryFn: () => getRequestWindows(params!),
    enabled: params !== null && params.durationMins > 0,
    staleTime: 60_000,
  })
}

/** The customer's requests (open first). Re-read every 30 s while shown: answers arrive. */
export function useMyRequests(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: requestKeys.mine,
    queryFn: async () => (await listMyRequests()).items,
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
  })
}

export function useMyRequest(id: string | null) {
  return useQuery({
    queryKey: requestKeys.one(id ?? 'none'),
    queryFn: () => getMyRequest(id!),
    enabled: id !== null,
    staleTime: 10_000,
  })
}

function useRefreshMine() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] })
    void queryClient.invalidateQueries({ queryKey: areaKeys.status })
  }
}

export function useCreateRequest() {
  const refresh = useRefreshMine()
  return useMutation({ mutationFn: (input: CreateRequestInput) => createRequest(input), onSettled: refresh })
}

export function useCancelRequest() {
  const refresh = useRefreshMine()
  return useMutation({ mutationFn: (id: string) => cancelMyRequest(id), onSettled: refresh })
}

// ─── The garage ──────────────────────────────────────────────────────────────

/** The garage's inbox, re-read every 15 s while open (requests have a clock). */
export function useGarageRequests(scope: 'open' | 'closed', enabled = true) {
  return useQuery({
    queryKey: requestKeys.garage(scope),
    queryFn: () => listGarageRequests(scope),
    enabled,
    refetchInterval: scope === 'open' ? 15_000 : false,
  })
}

/** How many wait for the garage's answer: Home's badge. Off on an API without the route. */
export function useGarageRequestCount(enabled = true) {
  return useQuery({
    queryKey: requestKeys.garageCount,
    queryFn: getGarageRequestCount,
    enabled,
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useRequestStartTimes(id: string | null) {
  return useQuery({
    queryKey: ['requests', 'start-times', id ?? 'none'],
    queryFn: () => getRequestStartTimes(id!),
    enabled: id !== null,
    staleTime: 15_000,
  })
}

function useRefreshGarage() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: ['requests', 'garage'] })
}

export function useAcceptRequest() {
  const refresh = useRefreshGarage()
  return useMutation({
    mutationFn: (input: { id: string; startAt: string; travelFee: TravelFee }) =>
      acceptRequest(input.id, { startAt: input.startAt, travelFee: input.travelFee }),
    onSettled: refresh,
  })
}

export function useDeclineRequest() {
  const refresh = useRefreshGarage()
  return useMutation({ mutationFn: (id: string) => declineRequest(id), onSettled: refresh })
}
