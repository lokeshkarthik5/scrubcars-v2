import { apiClient } from './client'
import {
  mapAddress,
  mapUserProfile,
  mapVehicle,
} from './mappers'
import type { ApiAddress, ApiUserProfile, ApiVehicle } from './types'
import type { Address, User, Vehicle } from '@repo/core/types'

export interface UpdateProfilePayload {
  name: string
  email?: string | null
}

export interface CreateAddressPayload {
  label: string
  address: string
  city: string
  /**
   * Optional, and all-or-nothing with `lng`. An address saved without a pin is
   * a legitimate state — it books a drop-in slot fine, and the customer is
   * prompted for a pin when they pick it for doorstep, which is the one place
   * the coordinate actually matters.
   */
  lat?: number
  lng?: number
  geoSource?: 'gps' | 'map_pin'
  isDefault?: boolean
}

/** GET /users/me + GET /users/me/addresses in parallel */
export async function getProfileWithAddresses(): Promise<{
  user: User
  addresses: Address[]
}> {
  const [rawProfile, rawAddresses] = await Promise.all([
    apiClient<ApiUserProfile>('/users/me'),
    apiClient<ApiAddress[]>('/users/me/addresses').catch(() => [] as ApiAddress[]),
  ])
  const defaultAddress = rawAddresses.find((a) => a.isDefault) ?? rawAddresses[0]
  return {
    user: mapUserProfile(rawProfile, defaultAddress),
    addresses: rawAddresses.map(mapAddress),
  }
}

/** GET /users/me */
export async function getProfile(): Promise<User> {
  const { user } = await getProfileWithAddresses()
  return user
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

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

/** POST /users/me/avatar/upload-url — presigned R2 PUT URL for the avatar */
export async function getAvatarUploadUrl(
  contentType: UploadContentType
): Promise<{ uploadUrl: string; publicUrl: string }> {
  return apiClient<{ uploadUrl: string; publicUrl: string }>(
    '/users/me/avatar/upload-url',
    { method: 'POST', body: JSON.stringify({ contentType }) }
  )
}

/** PUT /users/me/avatar — save the avatar URL on the profile */
export async function setAvatar(url: string): Promise<User> {
  const profile = await apiClient<ApiUserProfile>('/users/me/avatar', {
    method: 'PUT',
    body: JSON.stringify({ url }),
  })
  return mapUserProfile(profile)
}

/** DELETE /users/me/avatar */
export async function deleteAvatar(): Promise<User> {
  const profile = await apiClient<ApiUserProfile>('/users/me/avatar', {
    method: 'DELETE',
  })
  return mapUserProfile(profile)
}

/** Full avatar upload flow: presign → PUT to R2 → save URL on the profile. */
export async function uploadAvatar(file: File): Promise<User> {
  const contentType = file.type as UploadContentType
  const { uploadUrl, publicUrl } = await getAvatarUploadUrl(contentType)

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }

  return setAvatar(publicUrl)
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

export interface UpdateAddressPayload {
  label?: string
  address?: string
  city?: string
  /** All-or-nothing with `lng`, same as on create. */
  lat?: number
  lng?: number
  geoSource?: 'gps' | 'map_pin'
  isDefault?: boolean
}

/** POST /users/me/addresses */
export async function createAddress(payload: CreateAddressPayload): Promise<Address> {
  const address = await apiClient<ApiAddress>('/users/me/addresses', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return mapAddress(address)
}

/**
 * PATCH /users/me/addresses/:id
 *
 * Used at doorstep checkout to drop a pin on an address saved without one,
 * which is the one moment the coordinate actually matters.
 */
export async function updateAddress(
  id: string,
  payload: UpdateAddressPayload
): Promise<Address> {
  const address = await apiClient<ApiAddress>(`/users/me/addresses/${id}`, {
    method: 'PATCH',
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

/**
 * DELETE /users/me/vehicles/:id
 *
 * Removes the car from the garage. One a booking still names is archived
 * server-side rather than deleted, so this succeeds either way and the
 * booking keeps the car it was for.
 */
export async function deleteVehicle(id: string): Promise<void> {
  await apiClient(`/users/me/vehicles/${id}`, { method: 'DELETE' })
}

/** DELETE /users/me/addresses/:id */
export async function deleteAddress(id: string): Promise<void> {
  await apiClient(`/users/me/addresses/${id}`, { method: 'DELETE' })
}

/** The wash intervals a customer can pick, in days. Null is the default. */
export type WashIntervalDays = 7 | 10 | 14 | 21 | 30

/**
 * PATCH /users/me/vehicles/:id
 *
 * Today only the wash interval is edited from the app (the Home wash bar's
 * sheet); null goes back to the default.
 */
export async function updateVehicle(
  id: string,
  payload: { washIntervalDays?: WashIntervalDays | null }
): Promise<Vehicle> {
  const vehicle = await apiClient<ApiVehicle>(`/users/me/vehicles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return mapVehicle(vehicle)
}

/** PATCH /users/me/vehicles/:id/default */
export async function setDefaultVehicle(id: string): Promise<Vehicle> {
  const vehicle = await apiClient<ApiVehicle>(
    `/users/me/vehicles/${id}/default`,
    { method: 'PATCH' }
  )
  return mapVehicle(vehicle)
}

/** PATCH /users/me/addresses/:id/default */
export async function setDefaultAddress(id: string): Promise<Address> {
  const address = await apiClient<ApiAddress>(
    `/users/me/addresses/${id}/default`,
    { method: 'PATCH' }
  )
  return mapAddress(address)
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
