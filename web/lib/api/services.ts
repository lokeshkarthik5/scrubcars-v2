import { apiClient } from './client'
import { mapService } from './mappers'
import type { ApiService } from './types'
import type { PricingType, Service, ServiceCategory } from '@/lib/types'

export interface ServiceMutationInput {
  name: string
  category: ServiceCategory
  pricingType: PricingType
  price?: number
  priceHatchback?: number | null
  priceSedan?: number | null
  priceSuv?: number | null
  durationMins: number
}

// Build a payload carrying only the price fields that match the pricing type,
// so we never send price:0 (the server requires positive) or stray tiers.
function pricingPayload(data: ServiceMutationInput) {
  const positive = (v: number | null | undefined) =>
    typeof v === 'number' && v > 0 ? v : undefined

  if (data.pricingType === 'per_vehicle') {
    return {
      pricingType: data.pricingType,
      priceHatchback: positive(data.priceHatchback),
      priceSedan: positive(data.priceSedan),
      priceSuv: positive(data.priceSuv),
    }
  }
  // flat | on_inspection both carry a single positive price.
  return { pricingType: data.pricingType, price: positive(data.price) }
}

/** GET /vendors/:vendorId/services */
export async function getVendorServices(vendorId: string): Promise<Service[]> {
  const services = await apiClient<ApiService[]>(`/vendors/${vendorId}/services`, {
    auth: false,
  })
  return services.map((s) => mapService(s, vendorId))
}

/** GET /vendors/me/services */
export async function getMyServices(): Promise<Service[]> {
  const services = await apiClient<ApiService[]>('/vendors/me/services')
  return services.map((s) => mapService(s, ''))
}

/** POST /vendors/me/services */
export async function createService(
  data: ServiceMutationInput
): Promise<Service> {
  const service = await apiClient<ApiService>('/vendors/me/services', {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      category: data.category,
      durationMins: data.durationMins,
      ...pricingPayload(data),
    }),
  })
  return mapService(service, '')
}

/** PATCH /vendors/me/services/:id */
export async function updateService(
  id: string,
  data: ServiceMutationInput
): Promise<Service> {
  const service = await apiClient<ApiService>(`/vendors/me/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: data.name,
      category: data.category,
      durationMins: data.durationMins,
      ...pricingPayload(data),
    }),
  })
  return mapService(service, '')
}

/** PATCH /vendors/me/services/:id/active */
export async function toggleServiceActive(
  id: string,
  isActive: boolean
): Promise<Service> {
  const service = await apiClient<ApiService>(`/vendors/me/services/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
  return mapService(service, '')
}

/** DELETE /vendors/me/services/:id */
export async function deleteService(id: string): Promise<Service> {
  const service = await apiClient<ApiService>(`/vendors/me/services/${id}`, {
    method: 'DELETE',
  })
  return mapService(service, '')
}
