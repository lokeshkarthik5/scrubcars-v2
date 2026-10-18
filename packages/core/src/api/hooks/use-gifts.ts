'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { getGiftsConfig, getMyCredit, listMyGifts, type GiftsConfig } from '@repo/core/api/gifts'

export const giftKeys = {
  all: ['gifts'] as const,
  config: ['gifts', 'config'] as const,
  credit: ['gifts', 'credit'] as const,
  sent: ['gifts', 'sent'] as const,
}

/**
 * Whether Gift a wash is switched on at the API (GIFTS_ENABLED), with its
 * amounts and limits. The one read every entry point waits for: while it is
 * loading, has failed or says off, Profile shows no gift or credit link and
 * checkout no credit row. Kept a few minutes and not retried: the switch only
 * changes with a deploy, and "off" is the safe answer to a failed read.
 */
export function useGiftsConfig() {
  return useQuery({
    queryKey: giftKeys.config,
    queryFn: getGiftsConfig,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** On only when the API said so; loading or failed reads count as off. */
export function giftsEnabled(config: GiftsConfig | undefined): config is GiftsConfig {
  return config?.enabled === true
}

/**
 * The signed-in customer's Detlio credit: balance, next expiry and the
 * latest ledger rows. Only asked for once gifts are on (every credit call is
 * a 404 while they are off) and someone is signed in.
 */
export function useMyCredit(enabled: boolean) {
  return useQuery({
    queryKey: giftKeys.credit,
    queryFn: getMyCredit,
    enabled,
    staleTime: 30_000,
  })
}

/** The gifts the customer bought, newest first. */
export function useMySentGifts(enabled: boolean) {
  return useQuery({
    queryKey: giftKeys.sent,
    queryFn: async () => (await listMyGifts()).gifts,
    enabled,
    staleTime: 30_000,
  })
}

/**
 * After anything that moves credit or a gift (a redeem, a purchase, a
 * booking paid with credit, a cancellation), so the credit screen, the
 * checkout row and Gifts you sent read fresh on their next look.
 */
export function invalidateGiftData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: giftKeys.credit }),
    queryClient.invalidateQueries({ queryKey: giftKeys.sent }),
  ])
}
