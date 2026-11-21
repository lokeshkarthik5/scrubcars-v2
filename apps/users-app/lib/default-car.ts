import { useUserStore } from '@repo/core/stores/user-store';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth';

/**
 * The make of the signed-in customer's main car as they typed it ("benz"), for
 * "Specialists for your <Make>" (0083); null when signed out or with no car. As the
 * website's useDefaultCarMake: their cars from the shared store, fetched once.
 */
export function useDefaultCarMake(): string | null {
  const user = useAuth((s) => s.user);
  const vehicles = useUserStore((s) => s.vehicles);
  const fetchVehicles = useUserStore((s) => s.fetchVehicles);
  useEffect(() => {
    if (user) void fetchVehicles().catch(() => undefined);
  }, [user, fetchVehicles]);
  if (!user) return null;
  const car = vehicles.find((v) => v.isDefault) ?? vehicles[0];
  return car?.make ?? null;
}
