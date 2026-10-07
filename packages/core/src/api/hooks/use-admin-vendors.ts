'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveAdminVendor,
  deleteAdminVendor,
  getAdminVendor,
  listAdminVendors,
  unarchiveAdminVendor,
  verifyAdminVendor,
  type AdminVendor,
} from '@repo/core/api/admin'
import { adminBookingKeys } from '@repo/core/api/hooks/use-admin-bookings'

/**
 * Hierarchical keys so a single `invalidateQueries({ queryKey: keys.all })`
 * after a write refreshes every list and detail at once. The status filter
 * lives inside the list key, which is what lets a filtered list refetch on
 * its own — see `discountKeys` for the same shape.
 */
export const adminVendorKeys = {
  all: ['admin-vendors'] as const,
  lists: () => [...adminVendorKeys.all, 'list'] as const,
  list: () => [...adminVendorKeys.lists()] as const,
  details: () => [...adminVendorKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminVendorKeys.details(), id] as const,
}

export function useAdminVendors() {
  return useQuery({
    queryKey: adminVendorKeys.list(),
    queryFn: listAdminVendors,
  })
}

export function useAdminVendor(id: string) {
  return useQuery({
    queryKey: adminVendorKeys.detail(id),
    queryFn: () => getAdminVendor(id),
    enabled: Boolean(id),
  })
}

/**
 * Verify / archive / restore all patch one row and return the updated vendor.
 * They share this shape: write, then patch every cached list in place so the
 * row settles without a full refetch, and invalidate the detail because it
 * carries fields the list response does not.
 */
function useVendorRowMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<Partial<AdminVendor> & { id: string }>,
  vendorId: (args: TArgs) => string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (updated, args) => {
      const id = vendorId(args)

      for (const [key, list] of queryClient.getQueriesData<AdminVendor[]>({
        queryKey: adminVendorKeys.lists(),
      })) {
        if (!list) continue
        queryClient.setQueryData(
          key,
          list.map((v) => (v.id === id ? { ...v, ...updated } : v))
        )
      }

      void queryClient.invalidateQueries({
        queryKey: adminVendorKeys.detail(id),
      })
    },
  })
}

export function useVerifyAdminVendor() {
  return useVendorRowMutation(
    (id: string) => verifyAdminVendor(id),
    (id) => id
  )
}

export function useArchiveAdminVendor() {
  return useVendorRowMutation(
    ({ id, archiving }: { id: string; archiving: boolean }) =>
      archiving ? archiveAdminVendor(id) : unarchiveAdminVendor(id),
    ({ id }) => id
  )
}

/**
 * Deletion cascades to the vendor's bookings, so the booking lists are
 * invalidated too — otherwise the panel keeps showing rows whose vendor is
 * gone until something else happens to refetch them.
 */
export function useDeleteAdminVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAdminVendor(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: adminVendorKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all })
    },
  })
}
