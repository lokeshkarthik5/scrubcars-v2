'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  decideLuxury,
  editLuxuryBrands,
  getAdminLuxury,
  getGarageLuxury,
  sendLuxuryApplication,
  type LuxuryDecisionAction,
  type SendLuxuryApplication,
} from '@repo/core/api/luxury'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'
import type { LuxuryBrand } from '@repo/core/luxury'

export const luxuryKeys = {
  all: ['luxury'] as const,
  garage: (vendorId: string | undefined) => [...luxuryKeys.all, 'garage', vendorId ?? 'none'] as const,
  admin: (vendorId: string) => [...luxuryKeys.all, 'admin', vendorId] as const,
}

// ─── The garage's own (keyed by the active garage) ───────────────────────────

export function useGarageLuxury(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: luxuryKeys.garage(vendorId),
    queryFn: getGarageLuxury,
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  })
}

export function useSendLuxuryApplication(vendorId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SendLuxuryApplication) => sendLuxuryApplication(input),
    onSuccess: (data) => queryClient.setQueryData(luxuryKeys.garage(vendorId), data),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** The side panel's application and badge. Not retried on a 4xx (an API older than 0083 answers 404). */
export function useAdminLuxury(vendorId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: luxuryKeys.admin(vendorId ?? 'none'),
    queryFn: () => getAdminLuxury(vendorId!),
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  })
}

/** Approve / Ask for more / Decline / Remove badge; the Garages list is read again for its chips. */
export function useDecideLuxury(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action, note }: { action: LuxuryDecisionAction; note?: string }) => decideLuxury(vendorId, action, note),
    onSuccess: (data) => queryClient.setQueryData(luxuryKeys.admin(vendorId), data),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: luxuryKeys.admin(vendorId) })
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.all })
    },
  })
}

export function useEditLuxuryBrands(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (brands: LuxuryBrand[]) => editLuxuryBrands(vendorId, brands),
    onSuccess: (data) => queryClient.setQueryData(luxuryKeys.admin(vendorId), data),
  })
}
