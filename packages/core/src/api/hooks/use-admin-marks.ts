'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVendorMark,
  deleteVendorMark,
  listVendorMarks,
  markGaragesAsked,
  updateVendorMark,
  updateVendorMarkItem,
  type CreateMarkInput,
  type MarkAskedInput,
  type OnboardingMark,
  type UpdateMarkInput,
  type UpdateMarkItemInput,
} from '@repo/core/api/admin-marks'
import { ApiError } from '@repo/core/api/client'
import { adminVendorKeys } from '@repo/core/api/hooks/use-admin-vendors'

/**
 * Onboarding marks (0059). Every write refreshes the garage's marks, the
 * Garages list (its Marks column reads `openMarks`) and that garage's
 * detail. The Today summary is refreshed by AdminScope after any mutation
 * that worked, as for every other admin action.
 */
export const adminMarkKeys = {
  all: ['admin-marks'] as const,
  vendor: (vendorId: string) => [...adminMarkKeys.all, 'vendor', vendorId] as const,
}

/** A 4xx is an answer (404: an API older than the marks); only a 5xx is tried again. */
function retryServerErrors(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 2
}

/** Every mark on one garage, open ones first: its history included. */
export function useVendorMarks(vendorId: string, enabled = true) {
  return useQuery({
    queryKey: adminMarkKeys.vendor(vendorId),
    queryFn: () => listVendorMarks(vendorId),
    enabled: enabled && Boolean(vendorId),
    retry: retryServerErrors,
  })
}

function useMarksChanged() {
  const queryClient = useQueryClient()
  return (vendorIds: readonly string[]) => {
    for (const vendorId of vendorIds) {
      void queryClient.invalidateQueries({ queryKey: adminMarkKeys.vendor(vendorId) })
      void queryClient.invalidateQueries({ queryKey: adminVendorKeys.detail(vendorId) })
    }
    void queryClient.invalidateQueries({ queryKey: adminVendorKeys.lists() })
  }
}

/** Put one changed or new mark into the garage's cached marks at once. */
function usePutMark() {
  const queryClient = useQueryClient()
  return (mark: OnboardingMark) => {
    queryClient.setQueryData<OnboardingMark[]>(adminMarkKeys.vendor(mark.vendorId), (marks) => {
      if (!marks) return marks
      const at = marks.findIndex((row) => row.id === mark.id)
      if (at === -1) return [mark, ...marks]
      const next = marks.slice()
      next[at] = mark
      return next
    })
  }
}

/** 409 MARK_EXISTS when the garage already has an open mark of that missing key. */
export function useCreateMark() {
  const put = usePutMark()
  const changed = useMarksChanged()
  return useMutation({
    mutationFn: ({ vendorId, input }: { vendorId: string; input: CreateMarkInput }) =>
      createVendorMark(vendorId, input),
    onSuccess: (mark, { vendorId }) => {
      put(mark)
      changed([vendorId])
    },
  })
}

export function useUpdateMark() {
  const put = usePutMark()
  const changed = useMarksChanged()
  return useMutation({
    mutationFn: ({ vendorId, markId, input }: { vendorId: string; markId: string; input: UpdateMarkInput }) =>
      updateVendorMark(vendorId, markId, input),
    onSuccess: (mark, { vendorId }) => {
      put(mark)
      changed([vendorId])
    },
  })
}

/**
 * One checklist item ticked or answered (0064), from the mark's checklist
 * or the call sheet. Saves as it goes; the answer is the changed mark.
 */
export function useUpdateMarkItem() {
  const put = usePutMark()
  const changed = useMarksChanged()
  return useMutation({
    mutationFn: ({
      vendorId,
      markId,
      itemId,
      input,
    }: {
      vendorId: string
      markId: string
      itemId: string
      input: UpdateMarkItemInput
    }) => updateVendorMarkItem(vendorId, markId, itemId, input),
    onSuccess: (mark, { vendorId }) => {
      put(mark)
      changed([vendorId])
    },
  })
}

export function useDeleteMark() {
  const queryClient = useQueryClient()
  const changed = useMarksChanged()
  return useMutation({
    mutationFn: ({ vendorId, markId }: { vendorId: string; markId: string }) => deleteVendorMark(vendorId, markId),
    onSuccess: (_result, { vendorId, markId }) => {
      queryClient.setQueryData<OnboardingMark[]>(adminMarkKeys.vendor(vendorId), (marks) =>
        marks?.filter((row) => row.id !== markId)
      )
      changed([vendorId])
    },
  })
}

/** "Mark these as Asked today" for one or more garages (at most 50). */
export function useMarkAsked() {
  const changed = useMarksChanged()
  return useMutation({
    mutationFn: (input: MarkAskedInput) => markGaragesAsked(input),
    onSuccess: (_result, input) => changed(input.garages.map((garage) => garage.vendorId)),
  })
}
