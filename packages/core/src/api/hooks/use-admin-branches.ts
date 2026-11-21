'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getBranches,
  linkBranch,
  removeBranch,
  type AdminBranches,
} from '@repo/core/api/admin-branches'
import { ApiError } from '@repo/core/api/client'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

export const adminBranchKeys = {
  all: ['admin-branches'] as const,
  of: (vendorId: string) => [...adminBranchKeys.all, vendorId] as const,
}

/**
 * The garage's branches (0081). An API from before branches answers 404:
 * read as no group, so the editor works as before.
 */
export function useAdminBranches(vendorId: string) {
  return useQuery({
    queryKey: adminBranchKeys.of(vendorId),
    queryFn: async (): Promise<AdminBranches> => {
      try {
        return await getBranches(vendorId)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return { group: null, branches: [] }
        throw error
      }
    },
    enabled: Boolean(vendorId),
    staleTime: 30_000,
  })
}

/**
 * Link and Remove answer with the card again. Every branch's card changes
 * with it, and the garage list's rows, so those are read again.
 */
function useApplyBranches(vendorId: string) {
  const queryClient = useQueryClient()
  return (next: AdminBranches) => {
    void queryClient.invalidateQueries({ queryKey: adminBranchKeys.all })
    queryClient.setQueryData(adminBranchKeys.of(vendorId), next)
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
  }
}

export function useLinkBranch(vendorId: string) {
  const apply = useApplyBranches(vendorId)
  return useMutation({ mutationFn: (otherId: string) => linkBranch(vendorId, otherId), onSuccess: apply })
}

export function useRemoveBranch(vendorId: string) {
  const apply = useApplyBranches(vendorId)
  return useMutation({ mutationFn: (otherId: string) => removeBranch(vendorId, otherId), onSuccess: apply })
}
