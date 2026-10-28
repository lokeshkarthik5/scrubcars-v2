'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiError } from '@repo/core/api/client'
import {
  getStatsBehaviour,
  getStatsBreakdown,
  getStatsCommission,
  getStatsFunnel,
  getStatsOverview,
  type StatsBehaviourFilters,
  type StatsFilters,
  type StatsFunnelMode,
} from '@repo/core/api/admin'

export const adminStatsKeys = {
  all: ['admin-stats'] as const,
  overview: (filters: StatsFilters & { compare: boolean }) =>
    [...adminStatsKeys.all, 'overview', filters] as const,
  breakdown: (filters: StatsFilters) => [...adminStatsKeys.all, 'breakdown', filters] as const,
  commission: (filters: StatsFilters) => [...adminStatsKeys.all, 'commission', filters] as const,
  funnel: (filters: { from: string; to: string; mode: StatsFunnelMode }) =>
    [...adminStatsKeys.all, 'funnel', filters] as const,
  behaviour: (filters: StatsBehaviourFilters) => [...adminStatsKeys.all, 'behaviour', filters] as const,
}

// Figures over days barely move in a few minutes, and each read scans the
// period on the API's one database connection, so they are kept for five.
// The figures on screen stay up while new filters load, so a change of
// garage or period does not blank the page.
const STALE_MS = 5 * 60_000

/**
 * As the app's default (a 4xx is an answer; anything else is tried twice
 * more), except a STATS_TIMEOUT: the period was too long to add up in 10
 * seconds, and asking again just holds the API's one database connection,
 * which checkout shares, for another 10 seconds each time while the owner
 * looks at the last filter's figures. Shown once, with its message.
 */
export function retryStats(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status < 500 || error.code === 'STATS_TIMEOUT')) {
    return false
  }
  return failureCount < 2
}

/** The Statistics page's Overview tab. */
export function useStatsOverview(filters: StatsFilters & { compare: boolean }, enabled = true) {
  return useQuery({
    queryKey: adminStatsKeys.overview(filters),
    queryFn: () => getStatsOverview(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: retryStats,
    enabled,
  })
}

/** The Breakdown tab. */
export function useStatsBreakdown(filters: StatsFilters, enabled = true) {
  return useQuery({
    queryKey: adminStatsKeys.breakdown(filters),
    queryFn: () => getStatsBreakdown(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: retryStats,
    enabled,
  })
}

/** The Commission tab. */
export function useStatsCommission(filters: StatsFilters, enabled = true) {
  return useQuery({
    queryKey: adminStatsKeys.commission(filters),
    queryFn: () => getStatsCommission(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: retryStats,
    enabled,
  })
}

/** The Funnel tab. */
export function useStatsFunnel(
  filters: { from: string; to: string; mode: StatsFunnelMode },
  enabled = true
) {
  return useQuery({
    queryKey: adminStatsKeys.funnel(filters),
    queryFn: () => getStatsFunnel(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: retryStats,
    enabled,
  })
}

/** The Behaviour tab (0061). */
export function useStatsBehaviour(filters: StatsBehaviourFilters, enabled = true) {
  return useQuery({
    queryKey: adminStatsKeys.behaviour(filters),
    queryFn: () => getStatsBehaviour(filters),
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    retry: retryStats,
    enabled,
  })
}
