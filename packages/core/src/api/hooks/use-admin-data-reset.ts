'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteTestBooking,
  executeDataReset,
  getDataResetConfig,
  previewDataReset,
  previewTestBookingDelete,
  setAdminBookingTestMark,
  type DataResetExecuteInput,
  type DataResetPreview,
  type DataResetPreviewInput,
} from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'
import { adminBookingKeys } from '@repo/core/api/hooks/use-admin-bookings'
import { adminComplaintKeys } from '@repo/core/api/hooks/use-admin-complaints'
import { adminRefundKeys } from '@repo/core/api/hooks/use-admin-refunds'
import { adminStatsKeys } from '@repo/core/api/hooks/use-admin-stats'
import { pilotStatsKeys } from '@repo/core/api/hooks/use-pilot-stats'

export const dataResetKeys = {
  config: ['admin-data-reset', 'config'] as const,
}

/**
 * Whether "Start pilot clean" is switched on at the API. The API answers
 * 404 while it is off, which reads here as `enabled: false` rather than an
 * error, so the nav item and the delete button simply stay hidden. Not
 * retried and kept a few minutes: the switch only changes with a deploy.
 */
export function useDataResetConfig(enabled = true) {
  return useQuery({
    enabled,
    queryKey: dataResetKeys.config,
    queryFn: async () => {
      try {
        return await getDataResetConfig()
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/**
 * A dry run, checking old payments with Razorpay to the end: the API asks
 * about a slice per call and says how many are left, so this calls again,
 * carrying the ids Razorpay could not answer for, until none are.
 * `onProgress` hears each step, for "Checked 25 of 143".
 */
export async function previewDataResetFully(
  input: DataResetPreviewInput,
  onProgress?: (preview: DataResetPreview) => void
): Promise<DataResetPreview> {
  let unknownIds = input.unknownIds ?? []
  // Bounded, so a server that never reports 0 cannot loop forever.
  for (let call = 0; call < 200; call += 1) {
    const preview = await previewDataReset({ ...input, unknownIds })
    onProgress?.(preview)
    if (preview.lookups.remaining === 0 || preview.lookups.checkedNow === 0) return preview
    unknownIds = preview.lookups.unknownIds
  }
  return previewDataReset({ ...input, unknownIds })
}

export function usePreviewDataReset() {
  return useMutation({
    mutationFn: ({
      input,
      onProgress,
    }: {
      input: DataResetPreviewInput
      onProgress?: (preview: DataResetPreview) => void
    }) => previewDataResetFully(input, onProgress),
  })
}

/**
 * The delete. Whatever it answers, the bookings, refunds, pilot numbers and
 * Statistics on screen are out of date, so all of them are refetched.
 */
export function useExecuteDataReset() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminRefundKeys.all })
    void queryClient.invalidateQueries({ queryKey: pilotStatsKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminStatsKeys.all })
  }
  return useMutation({
    mutationFn: (input: DataResetExecuteInput) => executeDataReset(input),
    onSuccess: refresh,
    onError: refresh,
  })
}

/**
 * The dry run for deleting one test booking (0061), checking old payments
 * with Razorpay to the end like previewDataResetFully. Works with the reset
 * switched off.
 */
export async function previewTestBookingDeleteFully(
  bookingId: string,
  onProgress?: (preview: DataResetPreview) => void
): Promise<DataResetPreview> {
  let unknownIds: string[] = []
  for (let call = 0; call < 200; call += 1) {
    const preview = await previewTestBookingDelete(bookingId, { unknownIds })
    onProgress?.(preview)
    if (preview.lookups.remaining === 0 || preview.lookups.checkedNow === 0) return preview
    unknownIds = preview.lookups.unknownIds
  }
  return previewTestBookingDelete(bookingId, { unknownIds })
}

/**
 * Deletes one test booking with its chain (0061). The lists, refunds,
 * complaints, pilot numbers and Statistics are marked out of date; the
 * booking's own page is left alone (it is gone, and its dialog is still
 * showing the result), and is left by the caller.
 */
export function useDeleteTestBooking() {
  const queryClient = useQueryClient()
  const refresh = () => {
    // Out of date, but not fetched now: the open booking page would 404.
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all, refetchType: 'none' })
    void queryClient.invalidateQueries({ queryKey: adminComplaintKeys.all, refetchType: 'none' })
    void queryClient.invalidateQueries({ queryKey: adminRefundKeys.all })
    void queryClient.invalidateQueries({ queryKey: pilotStatsKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminStatsKeys.all })
  }
  return useMutation({
    mutationFn: ({
      bookingId,
      input,
    }: {
      bookingId: string
      input: { unknownIds: string[]; selectionHash: string; confirmText: string }
    }) => deleteTestBooking(bookingId, input),
    onSuccess: refresh,
  })
}

/**
 * Marks a booking "Test" or takes the mark off. Answers with the booking,
 * written straight into its cache; the lists, the pilot numbers and the
 * Statistics change with it.
 */
export function useSetAdminBookingTestMark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, marked }: { id: string; marked: boolean }) =>
      setAdminBookingTestMark(id, marked),
    onSuccess: (booking) => {
      queryClient.setQueryData(adminBookingKeys.detail(booking.id), booking)
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: pilotStatsKeys.all })
      void queryClient.invalidateQueries({ queryKey: adminStatsKeys.all })
    },
    onError: (_error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.detail(id) })
    },
  })
}
