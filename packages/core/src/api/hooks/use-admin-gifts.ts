'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adjustCustomerCredit,
  cancelAdminGift,
  findCustomerCredit,
  getAdminGiftsConfig,
  getAdminGiftsSummary,
  getCustomerCredit,
  listAdminGifts,
  listCreditBalances,
  type AdminCustomerCredit,
  type AdminGiftFilter,
} from '@repo/core/api/gifts'

export const adminGiftKeys = {
  all: ['admin-gifts'] as const,
  config: ['admin-gifts', 'config'] as const,
  summary: ['admin-gifts', 'summary'] as const,
  lists: () => [...adminGiftKeys.all, 'list'] as const,
  list: (filter: AdminGiftFilter) => [...adminGiftKeys.lists(), filter] as const,
  balances: ['admin-gifts', 'balances'] as const,
  customer: (userId: string) => [...adminGiftKeys.all, 'customer', userId] as const,
}

/**
 * Whether Gift a wash is on at the API. Answers whatever the switch says;
 * a failed read counts as off, so the Gifts nav item and page stay hidden.
 * Not retried and kept a few minutes: the switch only changes with a deploy.
 */
export function useAdminGiftsConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: adminGiftKeys.config,
    queryFn: getAdminGiftsConfig,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/** The page's tiles: sold, redeemed, outstanding, and what Detlio still owes. */
export function useAdminGiftsSummary(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: adminGiftKeys.summary,
    queryFn: getAdminGiftsSummary,
    refetchInterval: 60_000,
  })
}

/** One filter chip's gifts, newest first. */
export function useAdminGifts(filter: AdminGiftFilter, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: adminGiftKeys.list(filter),
    queryFn: async () => (await listAdminGifts(filter)).gifts,
    refetchInterval: 60_000,
  })
}

/** The customers holding the most credit. */
export function useCreditBalances(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: adminGiftKeys.balances,
    queryFn: async () => (await listCreditBalances()).customers,
  })
}

/** One customer's credit and ledger, picked from Top balances or found by phone. */
export function useCustomerCredit(userId: string | null) {
  return useQuery({
    enabled: userId !== null,
    queryKey: adminGiftKeys.customer(userId ?? ''),
    queryFn: () => getCustomerCredit(userId!),
  })
}

/**
 * Finding a customer by phone. A POST (the phone travels in the body), so a
 * mutation; its answer is written into the customer's own query so the
 * section below reads from one place whichever way it was opened.
 */
export function useFindCustomerCredit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (phone: string) => findCustomerCredit(phone),
    onSuccess: (found) => {
      queryClient.setQueryData<AdminCustomerCredit>(adminGiftKeys.customer(found.customer.id), found)
    },
  })
}

/**
 * Cancelling a gift moves it between chips and changes every total, so the
 * whole page is refetched — on a refusal too, since a 409 usually means the
 * gift changed (redeemed, or cancelled by someone else) and the list is old.
 */
export function useCancelAdminGift() {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminGiftKeys.all })
  return useMutation({
    mutationFn: ({ giftId, reason }: { giftId: string; reason: string }) =>
      cancelAdminGift(giftId, { reason }),
    onSuccess: refresh,
    onError: refresh,
  })
}

/** A manual adjustment: the customer's answer comes back with it. */
export function useAdjustCustomerCredit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      ...payload
    }: {
      userId: string
      amount: number
      reason: string
    }) => adjustCustomerCredit(userId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminCustomerCredit>(adminGiftKeys.customer(updated.customer.id), updated)
      void queryClient.invalidateQueries({ queryKey: adminGiftKeys.summary })
      void queryClient.invalidateQueries({ queryKey: adminGiftKeys.balances })
    },
  })
}
