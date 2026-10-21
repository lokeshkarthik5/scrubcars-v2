'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRewardExtras, getWrapped, markBadgesSeen, recordWrappedEvent } from '@repo/core/api/reward-extras'
import { invalidateRewards, rewardKeys } from '@repo/core/api/hooks/use-rewards'

export const rewardExtrasKeys = {
  extras: ['rewards', 'extras'] as const,
  wrapped: (year: number) => ['rewards', 'wrapped', year] as const,
}

/** The Rewards page's badges, challenges and Wrapped years (0054). */
export function useRewardExtras(enabled: boolean) {
  return useQuery({ queryKey: rewardExtrasKeys.extras, queryFn: getRewardExtras, enabled, staleTime: 30_000 })
}

/** After the celebration sheet: the badges are seen, everywhere. */
export function useMarkBadgesSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markBadgesSeen,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rewardExtrasKeys.extras })
      void queryClient.invalidateQueries({ queryKey: rewardKeys.summary })
    },
  })
}

export function useWrapped(year: number | null, enabled: boolean) {
  return useQuery({
    queryKey: rewardExtrasKeys.wrapped(year ?? 0),
    queryFn: () => getWrapped(year ?? 0),
    enabled: enabled && year !== null,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Counts only; a failure is ignored (it never gets in the way of sharing). */
export function useWrappedEvent() {
  return useMutation({ mutationFn: ({ year, kind }: { year: number; kind: 'opened' | 'shared' }) => recordWrappedEvent(year, kind) })
}

export { invalidateRewards }
