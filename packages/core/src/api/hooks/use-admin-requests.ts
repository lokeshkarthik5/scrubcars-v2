'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelAdminRequest,
  getAdminRequests,
  type AdminRequestFilter,
  type AdminRequestList,
} from '@repo/core/api/admin-requests'
import { ApiError } from '@repo/core/api/client'
import { coverageKeys } from '@repo/core/api/hooks/use-admin-coverage'

export const adminRequestKeys = {
  all: ['admin-requests'] as const,
  list: (filter: AdminRequestFilter, zone: string | null) =>
    [...adminRequestKeys.all, filter, zone ?? ''] as const,
}

/**
 * The Requests list. Refetched every 30 seconds while open: a request
 * waits two hours at most, and its countdown is what the team acts on. A
 * 404 (an API from before 0064) reads as `available: false`.
 */
export function useAdminRequests(
  filter: AdminRequestFilter,
  zone: string | null
) {
  return useQuery({
    queryKey: adminRequestKeys.list(filter, zone),
    queryFn: async (): Promise<AdminRequestList & { available: boolean }> => {
      try {
        return {
          ...(await getAdminRequests({ filter, zone })),
          available: true,
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return {
            items: [],
            counts: { open: 0, accepted: 0, failed: 0, all: 0 },
            zone: null,
            days: 30,
            available: false,
          }
        }
        throw error
      }
    },
    refetchInterval: 30_000,
  })
}

/**
 * Cancel an open request with the team's reason. The list and Coverage's
 * demand are read again, on a refusal too (someone else moved it first).
 */
export function useCancelAdminRequest() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminRequestKeys.all })
    void queryClient.invalidateQueries({ queryKey: coverageKeys.all })
  }
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelAdminRequest(id, reason),
    onSettled: refresh,
  })
}
