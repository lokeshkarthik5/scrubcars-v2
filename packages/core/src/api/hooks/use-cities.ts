'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCities } from '@repo/core/api/cities'
import {
  citiesOrFallback,
  customerCityOf,
  customerPoint,
  type CityLocation,
  type CustomerCity,
  type CustomerPlace,
} from '@repo/core/customer-city'

export const cityKeys = { all: ['cities'] as const }

/**
 * The cities customers may pick (0070). Until the API answers, and from an
 * API without the route (it deploys after the app) or a failed read, the
 * list is Chennai alone (FALLBACK_CITY), which is exactly the app before
 * cities. Kept a minute, as the server caches them, so an admin's city
 * change reaches an open app within a few minutes; never retried.
 */
export function useCities(): readonly CustomerCity[] {
  const query = useQuery({
    queryKey: cityKeys.all,
    queryFn: getCities,
    staleTime: 60_000,
    retry: false,
  })
  const data = query.data
  return useMemo(() => citiesOrFallback(data), [data])
}

/**
 * The customer's city for a stored place, with the cities and the place the
 * garage signs measure from. The web and the native app each pass their own
 * location store's place (the rule is the same: packages/core/src/customer-city.ts).
 */
export function useCustomerCity(location: CityLocation | null | undefined): {
  city: CustomerCity
  cities: readonly CustomerCity[]
  place: CustomerPlace
} {
  const cities = useCities()
  const lat = location?.lat
  const lng = location?.lng
  const source = location?.source
  const cityId = location?.cityId
  return useMemo(() => {
    const where = lat !== undefined && lng !== undefined && source ? { lat, lng, source, cityId } : null
    const city = customerCityOf(where, cities)
    return { city, cities, place: { city, at: customerPoint(where) } }
  }, [cities, lat, lng, source, cityId])
}
