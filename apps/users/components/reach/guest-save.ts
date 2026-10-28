import { createAddress, createVehicle } from '@repo/core/api/users'
import type { DraftAddress, DraftCar } from '@repo/core/booking-draft'
import { useUserStore } from '@repo/core/stores/user-store'

/**
 * Saves what a guest typed (a car, an address) to the account they just
 * signed in to, through the ordinary vehicle and address APIs, as checkout
 * does at "Confirm" (customer reach, 0062). Used by the request sheet, which
 * needs a saved car and address before a request can be sent.
 */
export async function saveGuestCar(car: DraftCar): Promise<string> {
  const created = await createVehicle({
    make: car.make.trim(),
    model: car.model.trim(),
    vehicleType: car.vehicleType,
    isDefault: useUserStore.getState().vehicles.length === 0,
  })
  useUserStore.setState((st) => ({ vehicles: [...st.vehicles, created] }))
  return created.id
}

export async function saveGuestAddress(address: DraftAddress): Promise<string> {
  const created = await createAddress({
    label: address.label,
    address: address.address,
    city: address.city,
    lat: address.lat,
    lng: address.lng,
    geoSource: address.geoSource,
    isDefault: useUserStore.getState().addresses.length === 0,
  })
  useUserStore.setState((st) => ({ addresses: [...st.addresses, created] }))
  return created.id
}
