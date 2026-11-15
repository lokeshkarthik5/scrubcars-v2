'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createShineScan,
  getBookingShine,
  getShineConfig,
  getShineScan,
  getShineStatus,
  getShineSuggestions,
  listShineChecks,
  reviewShineCheck,
  type ShineCheckStatus,
  type ShineNeed,
  type ShinePhotoUpload,
} from '@repo/core/api/shine-score'

/**
 * Shine Score (0075): the queries and writes every app uses. A failed config
 * read counts as off, so nothing shows; it only changes with a deploy, so it
 * is kept a few minutes and never retried.
 */
export const shineKeys = {
  config: ['shine', 'config'] as const,
  status: ['shine', 'status'] as const,
  scan: (id: string) => ['shine', 'scan', id] as const,
  suggestions: (need: ShineNeed, lat: number | null, lng: number | null) => ['shine', 'suggestions', need, lat, lng] as const,
  booking: (bookingId: string) => ['shine', 'booking', bookingId] as const,
  adminAll: ['shine', 'admin'] as const,
  adminList: (show: ShineCheckStatus) => ['shine', 'admin', show] as const,
}

export function useShineConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: shineKeys.config,
    queryFn: getShineConfig,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/** Whether Shine Score shows: the config said on. */
export function shineOn(config: { enabled: boolean } | undefined): boolean {
  return config?.enabled === true
}

export function useShineStatus(enabled = true) {
  return useQuery({ enabled, queryKey: shineKeys.status, queryFn: getShineStatus, staleTime: 30_000 })
}

export function useShineScan(scanId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(scanId),
    queryKey: shineKeys.scan(scanId),
    queryFn: () => getShineScan(scanId),
    staleTime: Infinity,
  })
}

/** Score four photos. The result is cached as the scan, and the day's count read again. */
export function useCreateShineScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (photos: ShinePhotoUpload[]) => createShineScan(photos),
    onSuccess: (data) => {
      queryClient.setQueryData(shineKeys.scan(data.scan.id), data.scan)
      queryClient.setQueryData(shineKeys.status, { scansLeft: data.scansLeft, scansPerDay: data.scansPerDay })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: shineKeys.status })
    },
  })
}

export function useShineSuggestions(need: ShineNeed | undefined, origin: { lat: number; lng: number } | null) {
  return useQuery({
    enabled: Boolean(need),
    queryKey: shineKeys.suggestions(need ?? 'none', origin?.lat ?? null, origin?.lng ?? null),
    queryFn: () => getShineSuggestions(need!, origin),
    staleTime: 60_000,
    retry: false,
  })
}

/**
 * A finished booking's before and after. While the server is still scoring
 * it says `pending`, and this asks again every 5 seconds for a minute at
 * most; any failure is no card.
 */
export function useBookingShine(bookingId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(bookingId),
    queryKey: shineKeys.booking(bookingId),
    queryFn: () => getBookingShine(bookingId),
    retry: false,
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.state === 'pending' && query.state.dataUpdateCount < 12 ? 5_000 : false,
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useShineChecks(show: ShineCheckStatus, enabled = true) {
  return useQuery({
    enabled,
    queryKey: shineKeys.adminList(show),
    queryFn: () => listShineChecks(show),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useReviewShineCheck() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; outcome: 'looks_fine' | 'followed_up' }) => reviewShineCheck(input.id, input.outcome),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: shineKeys.adminAll })
    },
  })
}
