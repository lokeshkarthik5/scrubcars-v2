'use client'

import { useCustomerCity } from '@repo/core/api/hooks/use-cities'
import { useHydratedLocation } from '@repo/core/stores/location-store'

/**
 * The web customer's city and place (0070): the browser's stored location
 * (null until hydrated, so a server-rendered screen and its first client
 * render agree) through the cities rule. The native app has its own twin over
 * its own store (apps/users-app/lib/customer-place.ts).
 */
export function useCustomerPlace() {
  const location = useHydratedLocation()
  return { ...useCustomerCity(location), location }
}
