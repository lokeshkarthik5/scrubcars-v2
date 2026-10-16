'use client'

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveAdminVendor,
  binAdminVendor,
  deleteAdminVendorForever,
  getAdminVendor,
  getAdminVendorBinPreview,
  getAdminVendorDeletePreview,
  listAdminVendors,
  restoreAdminVendor,
  unarchiveAdminVendor,
  verifyAdminVendor,
  type AdminVendor,
} from '@repo/core/api/admin'
import { adminBookingKeys } from '@repo/core/api/hooks/use-admin-bookings'
import { adminRefundKeys } from '@repo/core/api/hooks/use-admin-refunds'

/**
 * Hierarchical keys so a single `invalidateQueries({ queryKey: keys.all })`
 * after a write refreshes every list and detail at once. The list takes no
 * filter: it is always every garage, and the panel's chips filter it on the
 * client (other screens' garage pickers read the same list).
 */
export const adminVendorKeys = {
  all: ['admin-vendors'] as const,
  lists: () => [...adminVendorKeys.all, 'list'] as const,
  list: () => [...adminVendorKeys.lists()] as const,
  details: () => [...adminVendorKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminVendorKeys.details(), id] as const,
  /** The Bin's two previews, per garage: what binning cancels, what deleting removes. */
  binPreview: (id: string) => [...adminVendorKeys.all, 'bin-preview', id] as const,
  deletePreview: (id: string) => [...adminVendorKeys.all, 'delete-preview', id] as const,
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
 * Marks the garage list stale, for a page that changed a garage without these
 * hooks (the edit page saves through the API directly). The list refetches
 * the moment it is shown again, so Back lands on what was just saved — the
 * checklist and the Live count included — not a copy up to 30 s old.
 */
export function useInvalidateAdminVendors() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
  }, [queryClient])
}

/**
 * Verify / archive / restore all patch one row and return the updated vendor.
 * They share this shape: write, then patch every cached list in place so the
 * row settles at once, and invalidate the detail because it carries fields
 * the list response does not.
 *
 * The lists are refetched as well: the server returns the bare row, and what
 * the list adds to it — `live`, the checklist — is decided on the server.
 * Verifying a garage can make it live, so without the refetch the Live count
 * would stay wrong until something else reloaded the list.
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
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
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

// ─── The Bin ─────────────────────────────────────────────────────────────────

/**
 * What moving the garage to the Bin would cancel. Read as the dialog opens
 * and never cached: it is about this moment.
 */
export function useAdminVendorBinPreview(id: string, enabled: boolean) {
  return useQuery({
    queryKey: adminVendorKeys.binPreview(id),
    queryFn: () => getAdminVendorBinPreview(id),
    enabled: enabled && Boolean(id),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  })
}

/**
 * What Delete forever would remove and keep. The Bin card reads it for its
 * "N bookings will be deleted with it" line and the sheet for everything
 * else, so the two share one copy; the sheet reads it afresh on opening.
 */
export function useAdminVendorDeletePreview(id: string, options: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: adminVendorKeys.deletePreview(id),
    queryFn: () => getAdminVendorDeletePreview(id),
    enabled: Boolean(id),
    // The sheet reads it again as it opens, whatever the card already has:
    // its fingerprint is what the delete must match.
    refetchOnMount: options.fresh ? 'always' : true,
    retry: false,
  })
}

/**
 * Bin, Restore and Delete forever all change what the list, the bookings and
 * the refunds show: binning cancels bookings (a paid one is a refund owed),
 * and deleting removes them. So each refreshes all three; the garage's own
 * detail and previews are under the garages' key.
 */
function useInvalidateAfterBin() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminRefundKeys.all })
  }, [queryClient])
}

export function useBinAdminVendor() {
  const invalidate = useInvalidateAfterBin()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; actorName: string; reason?: string }) =>
      binAdminVendor(id, input),
    onSuccess: () => invalidate(),
  })
}

export function useRestoreAdminVendor() {
  const invalidate = useInvalidateAfterBin()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; actorName: string }) =>
      restoreAdminVendor(id, input),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteAdminVendorForever() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterBin()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      actorName: string
      confirmName: string
      selectionHash: string
    }) => deleteAdminVendorForever(id, input),
    onSuccess: (result, { id }) => {
      // Gone, unless a run had more to do: its detail must not linger.
      if (result.outcome !== 'partial') {
        queryClient.removeQueries({ queryKey: adminVendorKeys.detail(id) })
      }
      invalidate()
    },
  })
}
