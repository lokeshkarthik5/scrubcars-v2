import { apiClient } from './client'
import { mapService } from './mappers'
import type { ApiService } from './types'
import type { Service } from '@/lib/types'

/** GET /vendors/:vendorId/services */
export async function getVendorServices(vendorId: string): Promise<Service[]> {
  const services = await apiClient<ApiService[]>(`/vendors/${vendorId}/services`, {
    auth: false,
  })
  return services.map((s) => mapService(s, vendorId))
}

/** POST /vendors/me/services */
export async function createService(
  data: Omit<Service, 'id' | 'vendorId'>
): Promise<Service> {
  const service = await apiClient<ApiService>('/vendors/me/services', {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      category: data.category,
      price: data.price,
      durationMins: data.durationMins,
    }),
  })
  return mapService(service, '')
}

/** PATCH /vendors/me/services/:id */
export async function updateService(
  id: string,
  data: Partial<Service>
): Promise<Service> {
  const service = await apiClient<ApiService>(`/vendors/me/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: data.name,
      category: data.category,
      price: data.price,
      durationMins: data.durationMins,
    }),
  })
  return mapService(service, '')
}
