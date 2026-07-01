import { apiClient } from './client'
import {
  mapAddress,
  mapUserProfile,
  mapVehicle,
} from './mappers'
import type { ApiAddress, ApiUserProfile, ApiVehicle } from './types'
import type { Address, User, Vehicle } from '@/lib/types'

export interface UpdateProfilePayload {
  name: string
  email?: string | null
}

export interface CreateAddressPayload {
  label: string
  address: string
  city: string
  lat: number
  lng: number
  isDefault?: boolean
}

/** GET /users/me */
export async function getProfile(): Promise<User> {
  const profile = await apiClient<ApiUserProfile>('/users/me')
  const addresses = await apiClient<ApiAddress[]>('/users/me/addresses').catch(
    () => []
  )
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0]
  return mapUserProfile(profile, defaultAddress)
}

/** Alias for backwards compatibility */
export const getCurrentUser = getProfile

/** PATCH /users/me */
export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  const profile = await apiClient<ApiUserProfile>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return mapUserProfile(profile)
}

/** GET /users/me/vehicles */
export async function getVehicles(): Promise<Vehicle[]> {
  const vehicles = await apiClient<ApiVehicle[]>('/users/me/vehicles')
  return vehicles.map(mapVehicle)
}

/** GET /users/me/addresses */
export async function getAddresses(): Promise<Address[]> {
  const addresses = await apiClient<ApiAddress[]>('/users/me/addresses')
  return addresses.map(mapAddress)
}

/** POST /users/me/addresses */
export async function createAddress(payload: CreateAddressPayload): Promise<Address> {
  const address = await apiClient<ApiAddress>('/users/me/addresses', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return mapAddress(address)
}

/** POST /users/me/vehicles */
export async function createVehicle(payload: {
  make: string
  model: string
  licensePlate?: string
  vehicleType: 'sedan' | 'suv' | 'hatchback'
  isDefault?: boolean
}): Promise<Vehicle> {
  const vehicle = await apiClient<ApiVehicle>('/users/me/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return mapVehicle(vehicle)
}

/** GPS location — not implemented on backend; returns placeholder */
export async function detectLocation(
  lat: number,
  lng: number
): Promise<{ area: string; pincode: string }> {
  void lat
  void lng
  return { area: 'Chennai', pincode: '600020' }
}

/** Pincode resolve — not implemented on backend; returns city from pincode */
export async function resolvePincode(
  pincode: string
): Promise<{ area: string; pincode: string }> {
  return { area: 'Chennai', pincode }
}
