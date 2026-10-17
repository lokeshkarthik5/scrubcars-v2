'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminGaragePayouts,
  getAdminPayoutAccount,
  listAdminPayouts,
  recordAdminPayout,
  removeAdminPayoutAccount,
  saveAdminPayoutAccount,
  type PayoutAccountInput,
  type RecordPayoutInput,
} from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'

/** Hierarchical: one invalidation refreshes the list and every garage. */
export const adminPayoutKeys = {
  all: ['admin-payouts'] as const,
  list: () => [...adminPayoutKeys.all, 'list'] as const,
  garage: (vendorId: string) => [...adminPayoutKeys.all, 'garage', vendorId] as const,
  account: (vendorId: string) => [...adminPayoutKeys.all, 'account', vendorId] as const,
}

/**
 * The read gives up after 10 s on the one database connection (503
 * PAYOUTS_TIMEOUT): retrying would only hold it again. A 4xx is an answer.
 */
function retryPayouts(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status < 500 || error.code === 'PAYOUTS_TIMEOUT')) return false
  return failureCount < 2
}

/**
 * The Payouts list. Refetched every minute while open: a job finishing
 * elsewhere becomes due, and the 24-hour flag moves with the clock.
 */
export function useAdminPayouts() {
  return useQuery({
    queryKey: adminPayoutKeys.list(),
    queryFn: listAdminPayouts,
    refetchInterval: 60_000,
    retry: retryPayouts,
  })
}

export function useAdminGaragePayouts(vendorId: string) {
  return useQuery({
    queryKey: adminPayoutKeys.garage(vendorId),
    queryFn: () => getAdminGaragePayouts(vendorId),
    enabled: Boolean(vendorId),
    refetchInterval: 60_000,
    retry: retryPayouts,
  })
}

/** A garage's payout details, for its edit page. */
export function useAdminPayoutAccount(vendorId: string) {
  return useQuery({
    queryKey: adminPayoutKeys.account(vendorId),
    queryFn: () => getAdminPayoutAccount(vendorId),
    enabled: Boolean(vendorId),
    retry: retryPayouts,
  })
}

/** Record payout. Refused or not, the figures are read again. */
export function useRecordPayout(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordPayoutInput) => recordAdminPayout(vendorId, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminPayoutKeys.all }),
  })
}

export function useSavePayoutAccount(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PayoutAccountInput) => saveAdminPayoutAccount(vendorId, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminPayoutKeys.all }),
  })
}

export function useRemovePayoutAccount(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => removeAdminPayoutAccount(vendorId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminPayoutKeys.all }),
  })
}
