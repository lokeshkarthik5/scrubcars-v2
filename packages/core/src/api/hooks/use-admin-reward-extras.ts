'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminChallenge,
  endAdminChallenge,
  getAdminAchievements,
  getAdminChallenge,
  getAdminChallenges,
  getAdminCustomerWrapped,
  getAdminWrappedStats,
  publishAdminChallenge,
  updateAdminChallenge,
  type AdminChallengeDetail,
  type ChallengeFormValues,
} from '@repo/core/api/reward-extras'

export const adminRewardExtrasKeys = {
  achievements: ['admin-rewards', 'achievements'] as const,
  challenges: ['admin-rewards', 'challenges'] as const,
  challenge: (id: string) => ['admin-rewards', 'challenges', id] as const,
  wrappedStats: (year: number) => ['admin-rewards', 'wrapped', year] as const,
  customerWrapped: (userId: string, year: number) => ['admin-rewards', 'wrapped', userId, year] as const,
}

export function useAdminAchievements(enabled: boolean) {
  return useQuery({ enabled, queryKey: adminRewardExtrasKeys.achievements, queryFn: getAdminAchievements, retry: false })
}

export function useAdminChallenges(enabled: boolean) {
  return useQuery({ enabled, queryKey: adminRewardExtrasKeys.challenges, queryFn: getAdminChallenges, retry: false })
}

export function useAdminChallenge(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: adminRewardExtrasKeys.challenge(id ?? ''),
    queryFn: () => getAdminChallenge(id ?? ''),
    retry: false,
  })
}

function useChallengeWrite<T>(mutationFn: (input: T) => Promise<AdminChallengeDetail>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(adminRewardExtrasKeys.challenge(data.challenge.id), data)
      void queryClient.invalidateQueries({ queryKey: adminRewardExtrasKeys.challenges })
    },
  })
}

export function useCreateChallenge() {
  return useChallengeWrite((payload: ChallengeFormValues & { actorName: string }) => createAdminChallenge(payload))
}

export function useUpdateChallenge(id: string) {
  return useChallengeWrite((payload: ChallengeFormValues & { actorName: string }) => updateAdminChallenge(id, payload))
}

export function usePublishChallenge(id: string) {
  return useChallengeWrite((actorName: string) => publishAdminChallenge(id, actorName))
}

export function useEndChallenge(id: string) {
  return useChallengeWrite((actorName: string) => endAdminChallenge(id, actorName))
}

export function useAdminWrappedStats(year: number, enabled: boolean) {
  return useQuery({ enabled, queryKey: adminRewardExtrasKeys.wrappedStats(year), queryFn: () => getAdminWrappedStats(year), retry: false })
}

export function useAdminCustomerWrapped(userId: string | null, year: number) {
  return useQuery({
    enabled: !!userId,
    queryKey: adminRewardExtrasKeys.customerWrapped(userId ?? '', year),
    queryFn: () => getAdminCustomerWrapped(userId ?? '', year),
    retry: false,
  })
}
