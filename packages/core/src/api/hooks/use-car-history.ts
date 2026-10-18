'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dismissServiceReminder, getCarHistory, snoozeServiceReminder } from '@repo/core/api/car-history'
import { invalidateHome } from '@repo/core/api/hooks/use-home'
import type { ServiceCategory } from '@repo/core/types'

export const carHistoryKeys = {
  all: ['car-history'] as const,
  car: (vehicleId: string, category: ServiceCategory | null) =>
    [...carHistoryKeys.all, vehicleId, category ?? 'all'] as const,
}

/**
 * One car's history, filtered to a category or not. The filter is part of
 * the key (the server totals what it lists), and the list on screen stays
 * while the next filter loads. Off while signed out.
 */
export function useCarHistory(
  vehicleId: string,
  category: ServiceCategory | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: carHistoryKeys.car(vehicleId, category),
    queryFn: () => getCarHistory(vehicleId, category),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Dismiss or snooze a reminder, from the car's page or Home's card. Either
 * changes Home (its card, Updates' row) and the car's page, so both are read
 * again from the server.
 */
export function useServiceReminderAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ reminderId, action }: { reminderId: string; action: 'dismiss' | 'snooze' }) => {
      if (action === 'dismiss') await dismissServiceReminder(reminderId)
      else await snoozeServiceReminder(reminderId)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: carHistoryKeys.all })
      void invalidateHome(queryClient)
    },
  })
}
