'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'

/**
 * The make of the signed-in customer's main car as they typed it ("benz"),
 * for "Specialists for your <Make>" (0083); null when signed out or with no
 * car. Their cars come from the store every screen shares (fetched once).
 * The store starts empty on every load, so the first render matches the
 * server's HTML and the row can only follow it.
 */
export function useDefaultCarMake(): string | null {
  const user = useAuthStore((s) => s.user)
  const vehicles = useUserStore((s) => s.vehicles)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  useEffect(() => {
    if (user) void fetchVehicles().catch(() => undefined)
  }, [user, fetchVehicles])
  if (!user) return null
  const car = vehicles.find((v) => v.isDefault) ?? vehicles[0]
  return car?.make ?? null
}
