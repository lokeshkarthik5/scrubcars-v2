import { apiClient } from './client'
import { mapService } from './mappers'
import type { ApiService } from './types'
import type { PricingType, Service, ServiceCategory } from '@repo/core/types'

export interface ServiceMutationInput {
  name: string
  description?: string
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
      ...(data.description?.trim() && { description: data.description.trim() }),
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
      // Always sent so clearing the field persists (null wipes the description).
      description: data.description?.trim() ? data.description.trim() : null,
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

// ─── Service images ──────────────────────────────────────────────────────────
//
// Mirrors the vendor photo flow: presign → PUT straight to R2 → register the
// public URL. Both mutations return the whole service, so callers swap one
// object into their list instead of patching a sub-array.

/** Server-enforced cap; the UI hides the add button once it is reached. */
export const MAX_IMAGES_PER_SERVICE = 3

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

/** POST /vendors/me/services/:id/images/upload-url */
async function getServiceImageUploadUrl(
  serviceId: string,
  contentType: UploadContentType
): Promise<{ uploadUrl: string; publicUrl: string }> {
  return apiClient<{ uploadUrl: string; publicUrl: string }>(
    `/vendors/me/services/${serviceId}/images/upload-url`,
    { method: 'POST', body: JSON.stringify({ contentType }) }
  )
}

/** Full upload flow. Returns the service with its new image attached. */
export async function uploadServiceImage(
  serviceId: string,
  file: File
): Promise<Service> {
  const contentType = file.type as UploadContentType
  const { uploadUrl, publicUrl } = await getServiceImageUploadUrl(
    serviceId,
    contentType
  )

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }

  const service = await apiClient<ApiService>(
    `/vendors/me/services/${serviceId}/images`,
    { method: 'POST', body: JSON.stringify({ url: publicUrl }) }
  )
  return mapService(service, '')
}

/** DELETE /vendors/me/services/:id/images/:imageId */
export async function deleteServiceImage(
  serviceId: string,
  imageId: string
): Promise<Service> {
  const service = await apiClient<ApiService>(
    `/vendors/me/services/${serviceId}/images/${imageId}`,
    { method: 'DELETE' }
  )
  return mapService(service, '')
}
