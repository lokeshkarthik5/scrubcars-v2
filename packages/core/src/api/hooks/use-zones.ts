'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getZones } from '@repo/core/api/zones'
import { CHENNAI_ZONES, orderZones, type Zone } from '@repo/core/zones'

export const zoneKeys = { all: ['zones'] as const }

/**
 * Chennai's zones for the area chips and sheet (0062). The seeded list
 * (packages/core/src/zones.ts) is on screen from the first render, the
 * server's included, and the API's answer replaces it when it lands; an API
 * without the route yet (it deploys after the app) or a failed read keeps
 * the seeded list. Zones change rarely: kept ten minutes, never retried.
 */
export function useZones(): Zone[] {
  const query = useQuery({
    queryKey: zoneKeys.all,
    queryFn: getZones,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const data = query.data
  return useMemo(() => orderZones(data && data.length > 0 ? data : CHENNAI_ZONES), [data])
}
