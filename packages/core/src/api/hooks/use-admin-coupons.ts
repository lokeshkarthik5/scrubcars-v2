'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCouponBatch,
  getAdminCouponConfig,
  getCouponBatch,
  listCouponBatches,
  listCouponCodes,
  listCouponRedemptions,
  voidCouponBatch,
  voidCouponCode,
  type CreateCouponBatchPayload,
} from '@repo/core/api/coupons'

export const adminCouponKeys = {
  all: ['admin-coupons'] as const,
  config: ['admin-coupons', 'config'] as const,
  list: ['admin-coupons', 'list'] as const,
  batch: (id: string) => ['admin-coupons', 'batch', id] as const,
  codes: (id: string) => ['admin-coupons', 'codes', id] as const,
  redemptions: (id: string) => ['admin-coupons', 'redemptions', id] as const,
}

/** Whether bonus stamps can be offered (Rewards live), the limits and the QR's site. */
export function useAdminCouponConfig() {
  return useQuery({ queryKey: adminCouponKeys.config, queryFn: getAdminCouponConfig, staleTime: 60_000 })
}

export function useCouponBatches() {
  return useQuery({
    queryKey: adminCouponKeys.list,
    queryFn: async () => (await listCouponBatches()).batches,
    refetchInterval: 60_000,
  })
}

export function useCouponBatch(batchId: string) {
  return useQuery({ queryKey: adminCouponKeys.batch(batchId), queryFn: () => getCouponBatch(batchId), refetchInterval: 60_000 })
}

/**
 * Every code of a batch, re-derived on the server, for the print sheet and
 * the CSV. Fetched only when asked for, never kept: the codes are the
 * coupons.
 */
export function useCouponCodes(batchId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminCouponKeys.codes(batchId),
    queryFn: () => listCouponCodes(batchId),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

export function useCouponRedemptions(batchId: string) {
  return useQuery({
    queryKey: adminCouponKeys.redemptions(batchId),
    queryFn: () => listCouponRedemptions(batchId),
  })
}

export function useCreateCouponBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCouponBatchPayload) => createCouponBatch(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminCouponKeys.list }),
  })
}

/** Voiding changes the batch, its figures and its redemptions: all of it is read again. */
export function useVoidCouponBatch(batchId: string) {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminCouponKeys.all })
  return useMutation({
    mutationFn: (payload: { actorName: string; reason: string; cancelUnspent: boolean }) => voidCouponBatch(batchId, payload),
    onSuccess: refresh,
    onError: refresh,
  })
}

export function useVoidCouponCode(batchId: string) {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminCouponKeys.all })
  return useMutation({
    mutationFn: (payload: { code: string; actorName: string; reason: string }) => voidCouponCode(batchId, payload),
    onSuccess: refresh,
  })
}
