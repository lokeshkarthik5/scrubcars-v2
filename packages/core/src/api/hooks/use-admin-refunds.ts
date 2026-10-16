'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAdminRefunds,
  recordAdminRefund,
  type RecordRefundInput,
} from '@repo/core/api/admin'
import { adminBookingKeys } from '@repo/core/api/hooks/use-admin-bookings'
import { adminStatsKeys } from '@repo/core/api/hooks/use-admin-stats'
import { pilotStatsKeys } from '@repo/core/api/hooks/use-pilot-stats'

export const adminRefundKeys = {
  all: ['admin-refunds'] as const,
  list: (status: 'owed' | 'done') => [...adminRefundKeys.all, status] as const,
}

/**
 * The Refunds page's two tabs. Refetched every minute while open, so a
 * booking ops cancels elsewhere shows up as owed without a reload.
 *
 * No placeholder data across tabs: Owed and Done are different lists, and
 * showing one under the other's heading while the fetch runs puts "Mark
 * refunded…" on rows that are done. A tab opened for the first time shows
 * its skeleton instead.
 */
export function useAdminRefunds(status: 'owed' | 'done') {
  return useQuery({
    queryKey: adminRefundKeys.list(status),
    queryFn: () => listAdminRefunds(status),
    refetchInterval: 60_000,
  })
}

/**
 * Records a refund. A refund moves a row between the tabs, changes a
 * booking's refund section and its list badge, the pilot numbers and the
 * Statistics (collected after refunds), so all of those are refetched — on
 * a refusal too, because a 409 usually means someone else recorded it first
 * and the screen is out of date.
 */
export function useRecordAdminRefund() {
  const queryClient = useQueryClient()

  const refresh = (bookingId: string | null) => {
    void queryClient.invalidateQueries({ queryKey: adminRefundKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: pilotStatsKeys.all })
    void queryClient.invalidateQueries({ queryKey: adminStatsKeys.all })
    if (bookingId) {
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.detail(bookingId) })
    }
  }

  return useMutation({
    mutationFn: ({ input }: { input: RecordRefundInput; bookingId: string | null }) =>
      recordAdminRefund(input),
    onSuccess: (_refund, { bookingId }) => refresh(bookingId),
    onError: (_error, { bookingId }) => refresh(bookingId),
  })
}
