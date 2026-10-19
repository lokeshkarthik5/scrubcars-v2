'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@repo/core/api/client'
import type { AdminTodaySummary } from '@/lib/today'

export const adminTodayKeys = {
  all: ['admin-today'] as const,
}

/** GET /admin/today: the inbox and the menu's counts. */
export function getAdminToday() {
  return apiClient<AdminTodaySummary>('/admin/today')
}

/**
 * The Today summary, refreshed every minute while the panel is open: the
 * menu's counts and the Today page read the same query, so they never
 * disagree. `enabled` holds it back until the session check has passed.
 */
export function useAdminToday(enabled = true) {
  return useQuery({
    queryKey: adminTodayKeys.all,
    queryFn: getAdminToday,
    enabled,
    refetchInterval: 60_000,
  })
}
