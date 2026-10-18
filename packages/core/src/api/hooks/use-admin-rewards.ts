'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adjustCustomerRewards,
  findCustomerRewards,
  getAdminRewardsConfig,
  getAdminRewardsSettings,
  getAdminRewardsSummary,
  getCustomerRewards,
  saveAdminRewardsSettings,
  type AdjustRewardsPayload,
  type AdminCustomerRewards,
} from '@repo/core/api/rewards'

export const adminRewardKeys = {
  all: ['admin-rewards'] as const,
  config: ['admin-rewards', 'config'] as const,
  settings: ['admin-rewards', 'settings'] as const,
  summary: (month: string) => ['admin-rewards', 'summary', month] as const,
  customer: (userId: string) => ['admin-rewards', 'customer', userId] as const,
}

/** Whether REWARDS_ENABLED is on at the API: the nav item and page show only then. */
export function useAdminRewardsConfig(enabled = true) {
  return useQuery({ enabled, queryKey: adminRewardKeys.config, queryFn: getAdminRewardsConfig, retry: false, staleTime: 5 * 60_000 })
}

export function useAdminRewardsSettings(enabled: boolean) {
  return useQuery({ enabled, queryKey: adminRewardKeys.settings, queryFn: getAdminRewardsSettings, retry: false })
}

export function useSaveAdminRewardsSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveAdminRewardsSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(adminRewardKeys.settings, data)
      void queryClient.invalidateQueries({ queryKey: adminRewardKeys.all })
    },
  })
}

export function useAdminRewardsSummary(month: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: adminRewardKeys.summary(month),
    queryFn: () => getAdminRewardsSummary(month),
    retry: false,
  })
}

export function useFindCustomerRewards() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: findCustomerRewards,
    onSuccess: (data) => queryClient.setQueryData(adminRewardKeys.customer(data.customer.id), data),
  })
}

export function useCustomerRewards(userId: string | null) {
  return useQuery({
    enabled: !!userId,
    queryKey: adminRewardKeys.customer(userId ?? ''),
    queryFn: () => getCustomerRewards(userId ?? ''),
  })
}

export function useAdjustCustomerRewards(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AdjustRewardsPayload) => adjustCustomerRewards(userId, payload),
    onSuccess: (data: AdminCustomerRewards) => {
      queryClient.setQueryData(adminRewardKeys.customer(userId), data)
      void queryClient.invalidateQueries({ queryKey: ['admin-rewards', 'summary'] })
    },
  })
}
