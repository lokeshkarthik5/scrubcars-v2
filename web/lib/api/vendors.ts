import { apiClient } from './client'
import { MOCK_VENDORS } from '@/lib/mock/data'
import type { BookingType, Vendor } from '@/lib/types'

export interface VendorListParams {
  q?: string
  bookingType?: BookingType
  category?: string
  sort?: 'distance' | 'rating' | 'price'
}

/** GET /vendors */
export async function getVendors(params?: VendorListParams): Promise<Vendor[]> {
  // TODO: return apiClient<Vendor[]>('/vendors', { params })
  void params
  return MOCK_VENDORS
}

/** GET /vendors/:id */
export async function getVendor(id: string): Promise<Vendor | undefined> {
  // TODO: return apiClient<Vendor>(`/vendors/${id}`)
  return MOCK_VENDORS.find((v) => v.id === id)
}

/** POST /vendors/onboarding — step submissions */
export async function submitVendorOnboarding(
  step: number,
  data: Record<string, unknown>
): Promise<void> {
  // TODO: await apiClient(`/vendors/onboarding/step-${step}`, { method: 'POST', body: JSON.stringify(data) })
  void step
  void data
  return Promise.resolve()
}

/** PATCH /vendors/me */
export async function updateVendorSettings(
  data: Record<string, unknown>
): Promise<void> {
  // TODO: await apiClient('/vendors/me', { method: 'PATCH', body: JSON.stringify(data) })
  void data
  return Promise.resolve()
}
