import type { Vehicle } from '@repo/core/types'

/**
 * The car a booking is for, before the customer taps one: the car they had
 * on screen on Home (Book a wash, an offer) if it is still one of theirs,
 * else their default car, else their only car. Null with several cars and
 * no default, when checkout has to ask.
 *
 * One rule for the garage page's "₹599 for your Creta" and checkout's
 * pre-picked car, so the price quoted is the price charged.
 */
export function bookingCarId(
  vehicles: readonly Pick<Vehicle, 'id' | 'isDefault'>[],
  homeVehicleId: string | null | undefined
): string | null {
  if (homeVehicleId && vehicles.some((v) => v.id === homeVehicleId))
    return homeVehicleId
  return (
    vehicles.find((v) => v.isDefault)?.id ??
    (vehicles.length === 1 ? vehicles[0].id : null)
  )
}
