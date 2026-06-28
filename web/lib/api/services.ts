import { apiClient } from './client'
import { MOCK_SERVICES } from '@/lib/mock/data'
import type { Service } from '@/lib/types'

/** GET /vendors/:vendorId/services */
export async function getVendorServices(vendorId: string): Promise<Service[]> {
  // TODO: return apiClient<Service[]>(`/vendors/${vendorId}/services`)
  return MOCK_SERVICES.filter((s) => s.vendorId === vendorId)
}

/** POST /vendors/me/services */
export async function createService(
  data: Omit<Service, 'id' | 'vendorId'>
): Promise<Service> {
  // TODO: return apiClient<Service>('/vendors/me/services', { method: 'POST', body: JSON.stringify(data) })
  return { ...data, id: `svc-${Date.now()}`, vendorId: 'vendor-1' }
}

/** PATCH /vendors/me/services/:id */
export async function updateService(
  id: string,
  data: Partial<Service>
): Promise<Service> {
  // TODO: return apiClient<Service>(`/vendors/me/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  const existing = MOCK_SERVICES.find((s) => s.id === id)
  return { ...existing!, ...data }
}
