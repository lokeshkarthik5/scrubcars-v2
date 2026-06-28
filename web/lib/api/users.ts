import { apiClient } from './client'
import { MOCK_USER } from '@/lib/mock/data'
import type { User } from '@/lib/types'

export interface UpdateProfilePayload {
  name: string
  area?: string
  pincode?: string
  lat?: number
  lng?: number
}

/** GET /users/me */
export async function getCurrentUser(): Promise<User> {
  // TODO: return apiClient<User>('/users/me')
  return MOCK_USER
}

/** PATCH /users/me */
export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  // TODO: return apiClient<User>('/users/me', { method: 'PATCH', body: JSON.stringify(payload) })
  return { ...MOCK_USER, ...payload }
}

/** POST /users/me/location/detect — reverse geocode from GPS */
export async function detectLocation(
  lat: number,
  lng: number
): Promise<{ area: string; pincode: string }> {
  // TODO: return apiClient('/users/me/location/detect', { method: 'POST', body: JSON.stringify({ lat, lng }) })
  void lat
  void lng
  return { area: 'Adyar', pincode: '600020' }
}

/** GET /users/me/location/resolve?pincode= */
export async function resolvePincode(
  pincode: string
): Promise<{ area: string; pincode: string }> {
  // TODO: return apiClient('/users/me/location/resolve', { params: { pincode } })
  return { area: 'Adyar', pincode }
}
