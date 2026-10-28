'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminTier,
  getGarageTier,
  getTierConfig,
  getTierSettings,
  setTierHidden,
  setTierSwitch,
} from '@repo/core/api/tiers'
import {
  acceptAgreement,
  getAdminAgreements,
  getGarageAgreement,
  publishAgreement,
} from '@repo/core/api/agreements'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'
import type { Tier } from '@repo/core/tiers'

export const tierKeys = {
  all: ['tiers'] as const,
  config: () => [...tierKeys.all, 'config'] as const,
  garage: (vendorId: string | undefined) => [...tierKeys.all, 'garage', vendorId ?? 'none'] as const,
  agreement: (vendorId: string | undefined) => [...tierKeys.all, 'agreement', vendorId ?? 'none'] as const,
  adminSettings: () => [...tierKeys.all, 'admin-settings'] as const,
  adminGarage: (vendorId: string) => [...tierKeys.all, 'admin-garage', vendorId] as const,
  adminAgreements: () => [...tierKeys.all, 'admin-agreements'] as const,
}

// ─── Customers ───────────────────────────────────────────────────────────────

/** Which tiers customers see, for the "Silver & above" chip. Null until known (or on an older API). */
export function useTierConfig() {
  return useQuery({
    queryKey: tierKeys.config(),
    queryFn: getTierConfig,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ─── The garage's own (keyed by the active garage) ───────────────────────────

export function useGarageTier(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: tierKeys.garage(vendorId),
    queryFn: getGarageTier,
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  })
}

export function useGarageAgreement(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: tierKeys.agreement(vendorId),
    queryFn: getGarageAgreement,
    enabled: Boolean(vendorId) && enabled,
    retry: false,
  })
}

/** Accepting answers with the agreement as it now stands; the tier card is refreshed too. */
export function useAcceptAgreement(vendorId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (version: number) => acceptAgreement(version),
    onSuccess: (data) => queryClient.setQueryData(tierKeys.agreement(vendorId), data),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tierKeys.agreement(vendorId) })
      void queryClient.invalidateQueries({ queryKey: tierKeys.garage(vendorId) })
    },
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useTierSettings() {
  return useQuery({ queryKey: tierKeys.adminSettings(), queryFn: getTierSettings })
}

/** One tier on or off: every garage's medal and the admin garage views change with it. */
export function useSetTierSwitch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { tier: Tier; shown: boolean }) => setTierSwitch(input),
    onSuccess: (data) => queryClient.setQueryData(tierKeys.adminSettings(), data),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: tierKeys.all }),
  })
}

export function useAdminTier(vendorId: string, enabled = true) {
  return useQuery({
    queryKey: tierKeys.adminGarage(vendorId),
    queryFn: () => getAdminTier(vendorId),
    enabled: Boolean(vendorId) && enabled,
  })
}

/** Hide or show one garage's medal; the garage list's tier chip is marked stale too. */
export function useSetTierHidden(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (hidden: boolean) => setTierHidden(vendorId, hidden),
    onSuccess: (data) => queryClient.setQueryData(tierKeys.adminGarage(vendorId), data),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tierKeys.adminGarage(vendorId) })
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
    },
  })
}

export function useAdminAgreements() {
  return useQuery({ queryKey: tierKeys.adminAgreements(), queryFn: getAdminAgreements })
}

/** Upload and publish the next version; every garage's tier view may change with it. */
export function usePublishAgreement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { file: File; note: string | null }) => publishAgreement(input.file, input.note),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: tierKeys.all }),
  })
}
