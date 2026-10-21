'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  claimInvite,
  createInvite,
  getMyRewards,
  getRewardsConfig,
  getRewardsSummary,
  scratchCard,
  setBirthday,
  type RewardsConfig,
} from '@repo/core/api/rewards'

export const rewardKeys = {
  all: ['rewards'] as const,
  config: ['rewards', 'config'] as const,
  mine: ['rewards', 'mine'] as const,
  summary: ['rewards', 'summary'] as const,
}

/**
 * Whether Detlio Rewards is live (the API's switch and the admin's), with
 * the live numbers. Every entry point waits for it: loading, failed or off
 * shows nothing. Kept a minute and not retried; "off" is the safe answer.
 */
export function useRewardsConfig() {
  return useQuery({ queryKey: rewardKeys.config, queryFn: getRewardsConfig, staleTime: 60_000, retry: false })
}

/** On only when the API said so; loading or failed reads count as off. */
export function rewardsEnabled(config: RewardsConfig | undefined): config is RewardsConfig & { enabled: true } {
  return config?.enabled === true
}

/** The Rewards page. */
export function useMyRewards(enabled: boolean) {
  return useQuery({ queryKey: rewardKeys.mine, queryFn: getMyRewards, enabled, staleTime: 30_000 })
}

/** Home's strip, the booking page's scratch card, checkout's vouchers. */
export function useRewardsSummary(enabled: boolean) {
  return useQuery({ queryKey: rewardKeys.summary, queryFn: getRewardsSummary, enabled, staleTime: 30_000, retry: false })
}

/** After a booking with a voucher, a cancellation or a scratch: read fresh next time. */
export function invalidateRewards(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: rewardKeys.mine }),
    queryClient.invalidateQueries({ queryKey: rewardKeys.summary }),
  ])
}

export function useScratchCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: scratchCard,
    // The page refreshes after the reveal animation, not under it.
    onSuccess: () => {
      window.setTimeout(() => void invalidateRewards(queryClient), 1800)
    },
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createInvite, onSuccess: () => void invalidateRewards(queryClient) })
}

export function useSetBirthday() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: setBirthday, onSuccess: () => void invalidateRewards(queryClient) })
}

export function useClaimInvite() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: claimInvite, onSuccess: () => void invalidateRewards(queryClient) })
}
