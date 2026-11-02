import { useNow } from '@repo/core/hooks/use-now';
import { livePendingCheckout } from '@repo/core/stores/pending-checkout-store';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Vehicle } from '@repo/core/types';

import { useAuth } from './auth';
import { usePendingCheckout } from './pending-checkout';

/** The car a booking is for: Home's pick, else the default, else the only car. */
export function bookingCarId(
  vehicles: readonly Pick<Vehicle, 'id' | 'isDefault'>[],
  homeVehicleId: string | null | undefined
): string | null {
  if (homeVehicleId && vehicles.some((v) => v.id === homeVehicleId)) return homeVehicleId;
  return vehicles.find((v) => v.isDefault)?.id ?? (vehicles.length === 1 ? vehicles[0].id : null);
}

/** The garage page and checkout both use it, so they price the same car. */
export function useBookingCar() {
  const vehicles = useUserStore((s) => s.vehicles);
  const userId = useAuth((s) => s.user?.id);
  const pending = usePendingCheckout((s) => s.pending);
  const now = useNow();
  const live = livePendingCheckout(pending, { userId, now });
  const id = bookingCarId(vehicles, live?.vehicleId);
  return { id, car: vehicles.find((v) => v.id === id) ?? null };
}
