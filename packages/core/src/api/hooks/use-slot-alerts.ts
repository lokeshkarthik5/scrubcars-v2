'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelSlotAlert, getSlotAlerts, setSlotAlert, type SetSlotAlertInput } from '@repo/core/api/slot-alerts'

export const slotAlertKeys = {
  mine: ['slot-alerts', 'mine'] as const,
}

/**
 * The customer's waiting slot alerts: checkout's ask, the garage page and
 * Profile → Slot alerts all read this one list. Off while signed out.
 */
export function useSlotAlerts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: slotAlertKeys.mine,
    queryFn: getSlotAlerts,
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  })
}

/** Set (or change) one; the list is refreshed so every screen shows it. */
export function useSetSlotAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetSlotAlertInput) => setSlotAlert(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: slotAlertKeys.mine })
    },
  })
}

/** Cancel one; the list is refreshed. */
export function useCancelSlotAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cancelSlotAlert(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: slotAlertKeys.mine })
    },
  })
}
