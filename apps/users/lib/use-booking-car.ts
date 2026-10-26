'use client'

import { useNow } from '@repo/core/hooks/use-now'
import { useAuthStore } from '@repo/core/stores/auth-store'
import {
  livePendingCheckout,
  usePendingCheckoutStore,
} from '@repo/core/stores/pending-checkout-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { bookingCarId } from '@/lib/booking-car'

/**
 * The car this booking is for (lib/booking-car.ts), read from the
 * customer's saved cars and what Home handed over. The garage page and
 * checkout both use it, so they price the same car.
 */
export function useBookingCar() {
  const vehicles = useUserStore((s) => s.vehicles)
  const userId = useAuthStore((s) => s.user?.id)
  const pending = usePendingCheckoutStore((s) => s.pending)
  const now = useNow()
  const live = livePendingCheckout(pending, { userId, now })
  const id = bookingCarId(vehicles, live?.vehicleId)
  return { id, car: vehicles.find((v) => v.id === id) ?? null }
}
