'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  decidePickupFee,
  getAdminGaragePickupFee,
  getAdminPickupFeeSettings,
  getGaragePickupFee,
  getPickupFeeConfig,
  listPickupFeeChecks,
  saveAdminPickupFeeSettings,
  setAdminGaragePickupFee,
  setAdminGaragePickupFeeLimits,
  setAdminGaragePickupFeeLock,
  setGaragePickupFee,
} from '@repo/core/api/pickup-fee'
import type { GaragePickupFee, PickupFeeLimitOverrides, PickupFeeSettings } from '@repo/core/pickup-fee-maths'

export const pickupFeeKeys = {
  all: ['pickup-fee'] as const,
  config: () => [...pickupFeeKeys.all, 'config'] as const,
  garage: (vendorId: string | undefined) => [...pickupFeeKeys.all, 'garage', vendorId ?? 'none'] as const,
  adminSettings: () => [...pickupFeeKeys.all, 'admin-settings'] as const,
  adminGarage: (vendorId: string) => [...pickupFeeKeys.all, 'admin-garage', vendorId] as const,
  adminChecks: (show: string) => [...pickupFeeKeys.all, 'admin-checks', show] as const,
}

// ─── Customers ───────────────────────────────────────────────────────────────

/** Detlio's suggestion and convenience fee. Undefined until known (or on an older API: no fee shown). */
export function usePickupFeeConfig() {
  return useQuery({
    queryKey: pickupFeeKeys.config(),
    queryFn: getPickupFeeConfig,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// ─── The garage's own ────────────────────────────────────────────────────────

export function useGaragePickupFee(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: pickupFeeKeys.garage(vendorId),
    queryFn: getGaragePickupFee,
    enabled: enabled && !!vendorId,
    retry: false,
  })
}

export function useSetGaragePickupFee(vendorId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fee: GaragePickupFee) => setGaragePickupFee(fee),
    onSuccess: (data) => queryClient.setQueryData(pickupFeeKeys.garage(vendorId), data),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function useAdminPickupFeeSettings() {
  return useQuery({ queryKey: pickupFeeKeys.adminSettings(), queryFn: getAdminPickupFeeSettings })
}

export function useSaveAdminPickupFeeSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: PickupFeeSettings) => saveAdminPickupFeeSettings(settings),
    onSuccess: (data) => {
      queryClient.setQueryData(pickupFeeKeys.adminSettings(), data)
      void queryClient.invalidateQueries({ queryKey: pickupFeeKeys.all })
    },
  })
}

export function useAdminGaragePickupFee(vendorId: string) {
  return useQuery({ queryKey: pickupFeeKeys.adminGarage(vendorId), queryFn: () => getAdminGaragePickupFee(vendorId) })
}

export function useSetAdminGaragePickupFee(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fee: GaragePickupFee) => setAdminGaragePickupFee(vendorId, fee),
    onSuccess: (data) => {
      queryClient.setQueryData(pickupFeeKeys.adminGarage(vendorId), data)
      void queryClient.invalidateQueries({ queryKey: [...pickupFeeKeys.all, 'admin-checks'] })
    },
  })
}

export function useSetAdminGaragePickupFeeLock(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (locked: boolean) => setAdminGaragePickupFeeLock(vendorId, locked),
    onSuccess: (data) => queryClient.setQueryData(pickupFeeKeys.adminGarage(vendorId), data),
  })
}

export function useSetAdminGaragePickupFeeLimits(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (limits: PickupFeeLimitOverrides) => setAdminGaragePickupFeeLimits(vendorId, limits),
    onSuccess: (data) => queryClient.setQueryData(pickupFeeKeys.adminGarage(vendorId), data),
  })
}

export function usePickupFeeChecks(show: 'waiting' | 'approved' | 'kept') {
  return useQuery({ queryKey: pickupFeeKeys.adminChecks(show), queryFn: () => listPickupFeeChecks(show) })
}

export function useDecidePickupFee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { changeId: string; decision: 'approved' | 'kept'; reason?: string }) =>
      decidePickupFee(input.changeId, { decision: input.decision, reason: input.reason }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: pickupFeeKeys.all }),
  })
}
