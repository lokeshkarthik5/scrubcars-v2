'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useInvalidateAdminVendors } from '@repo/core/api/hooks/use-admin-vendors'
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
 * The Today summary, refreshed every minute while the panel is in view: the
 * menu's counts and the Today page read the same query, so they never
 * disagree. `enabled` holds it back until the session check has passed.
 */
export function useAdminToday(enabled = true) {
  return useQuery({
    queryKey: adminTodayKeys.all,
    queryFn: getAdminToday,
    enabled,
    refetchInterval: 60_000,
    // Every page carries the menu, so it is read only while someone can see
    // it: a tab in the background waits until it is shown again.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}

/**
 * The garage list is stale, and so are the menu's counts: for the edit
 * page's actions that call the API directly (hide or show a service, a
 * document, a pin) rather than through a mutation, which AdminScope already
 * follows.
 */
export function useMarkGaragesStale() {
  const invalidateVendors = useInvalidateAdminVendors()
  const queryClient = useQueryClient()
  return useCallback(() => {
    invalidateVendors()
    void queryClient.invalidateQueries({ queryKey: adminTodayKeys.all })
  }, [invalidateVendors, queryClient])
}
