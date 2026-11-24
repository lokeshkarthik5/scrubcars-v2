'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchPlaces } from '@repo/core/api/geo'
import {
  PLACE_SEARCH_DEBOUNCE_MS,
  PLACE_SEARCH_MIN,
  areaPlacesIn,
  type AreaPlace,
} from '@repo/core/area-place'
import type { CustomerCity } from '@repo/core/customer-city'

/**
 * Places in the city matching what the customer typed in the area sheet
 * (area-place.ts): asked once typing pauses, from three letters, biased to
 * the city's centre and kept to the city. A failed or unconfigured search
 * lists nothing, so the sheet is as it was: the zones and "All of <City>".
 */
export function useAreaPlaces({
  query,
  city,
  cities,
  zoneNames,
  sessionToken,
}: {
  query: string
  city: CustomerCity
  cities: readonly CustomerCity[]
  /** The zones already listed above, so a place is not listed twice. */
  zoneNames: readonly string[]
  sessionToken?: string
}): { places: AreaPlace[]; searching: boolean } {
  const trimmed = query.trim()
  const [settled, setSettled] = useState(trimmed)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(trimmed), PLACE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  const enabled = settled.length >= PLACE_SEARCH_MIN
  const result = useQuery({
    queryKey: ['area-places', city.id, settled.toLowerCase()],
    queryFn: () => searchPlaces(settled, city.centre, sessionToken),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  })

  const zonesKey = zoneNames.join('|')
  const places = useMemo(
    () => (enabled && trimmed.length >= PLACE_SEARCH_MIN ? areaPlacesIn(result.data ?? [], city, cities, zoneNames) : []),
    // zoneNames by value: a new array each render must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, trimmed.length, result.data, city, cities, zonesKey]
  )
  const searching = trimmed.length >= PLACE_SEARCH_MIN && (trimmed !== settled || result.isFetching)
  return { places, searching }
}
