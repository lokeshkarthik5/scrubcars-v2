'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getPilotStats } from '@repo/core/api/admin'

export const pilotStatsKeys = {
  all: ['admin-pilot-stats'] as const,
  window: (days: 7 | 30) => [...pilotStatsKeys.all, days] as const,
}

/**
 * The pilot's numbers for the last 7 or 30 days. The previous window's figures
 * stay up while the other loads, so the toggle does not blank the card.
 */
export function usePilotStats(days: 7 | 30) {
  return useQuery({
    queryKey: pilotStatsKeys.window(days),
    queryFn: () => getPilotStats(days),
    placeholderData: keepPreviousData,
    // Counts over days barely move in a minute, and each read scans the window.
    staleTime: 60_000,
  })
}
