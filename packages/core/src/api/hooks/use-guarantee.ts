'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptClaim,
  bookRedo,
  createClaim,
  decideClaim,
  disputeClaim,
  getAdminClaim,
  getAdminClaims,
  getAdminGuaranteeConfig,
  getBookingGuarantee,
  getGarageClaims,
  getGuaranteeConfig,
  getRedoSlots,
  type AdminClaimTab,
  type CreateClaimInput,
  type DecideClaimInput,
} from '@repo/core/api/guarantee'

/**
 * Detlio Guarantee (0051): the queries and writes every app uses. A failed
 * config read counts as off, so nothing shows; it only changes with a
 * deploy, so it is kept a few minutes and never retried.
 */
export const guaranteeKeys = {
  config: ['guarantee', 'config'] as const,
  adminConfig: ['guarantee', 'admin-config'] as const,
  booking: (bookingId: string) => ['guarantee', 'booking', bookingId] as const,
  redoSlots: (claimId: string, date: string) => ['guarantee', 'redo-slots', claimId, date] as const,
  garage: (scope: 'open' | 'closed') => ['guarantee', 'garage', scope] as const,
  garageAll: ['guarantee', 'garage'] as const,
  adminAll: ['guarantee', 'admin'] as const,
  adminList: (tab: AdminClaimTab) => ['guarantee', 'admin', 'list', tab] as const,
  adminClaim: (id: string) => ['guarantee', 'admin', 'claim', id] as const,
}

export function useGuaranteeConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: guaranteeKeys.config,
    queryFn: getGuaranteeConfig,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useAdminGuaranteeConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: guaranteeKeys.adminConfig,
    queryFn: getAdminGuaranteeConfig,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

// ─── The customer ────────────────────────────────────────────────────────────

/** The guarantee on one of the customer's bookings: can they claim, or their claim. */
export function useBookingGuarantee(bookingId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(bookingId),
    queryKey: guaranteeKeys.booking(bookingId),
    queryFn: () => getBookingGuarantee(bookingId),
    staleTime: 30_000,
  })
}

export function useCreateClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateClaimInput) => createClaim(input),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: guaranteeKeys.booking(input.bookingId) })
    },
  })
}

export function useRedoSlots(claimId: string, date: string | null) {
  return useQuery({
    enabled: Boolean(claimId && date),
    queryKey: guaranteeKeys.redoSlots(claimId, date ?? ''),
    queryFn: () => getRedoSlots(claimId, date!),
    staleTime: 15_000,
  })
}

export function useBookRedo(bookingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { claimId: string; scheduledAt: string }) => bookRedo(input.claimId, input.scheduledAt),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guaranteeKeys.booking(bookingId) })
      void queryClient.invalidateQueries({ queryKey: ['guarantee', 'redo-slots'] })
    },
  })
}

// ─── The garage ──────────────────────────────────────────────────────────────

export function useGarageClaims(scope: 'open' | 'closed', enabled = true) {
  return useQuery({
    enabled,
    queryKey: guaranteeKeys.garage(scope),
    queryFn: () => getGarageClaims(scope),
    staleTime: 30_000,
    // The countdown runs on the page; the list itself refreshes now and then.
    refetchInterval: 60_000,
  })
}

export function useAnswerClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { claimId: string; answer: 'accept' } | { claimId: string; answer: 'dispute'; note: string }) =>
      input.answer === 'accept' ? acceptClaim(input.claimId) : disputeClaim(input.claimId, input.note),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guaranteeKeys.garageAll })
    },
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useAdminClaims(tab: AdminClaimTab, enabled = true) {
  return useQuery({
    enabled,
    queryKey: guaranteeKeys.adminList(tab),
    queryFn: () => getAdminClaims(tab),
    staleTime: 30_000,
  })
}

export function useAdminClaim(id: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(id),
    queryKey: guaranteeKeys.adminClaim(id),
    queryFn: () => getAdminClaim(id),
  })
}

export function useDecideClaim(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DecideClaimInput) => decideClaim(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(guaranteeKeys.adminClaim(id), data)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: guaranteeKeys.adminAll })
    },
  })
}
