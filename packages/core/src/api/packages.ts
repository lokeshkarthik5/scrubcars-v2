import { apiClient } from './client'
import { mapPackage } from './mappers'
import type { ApiPackage } from './types'
import type { PricingType, ServicePackage } from '@repo/core/types'

export interface PackageMutationInput {
  name: string
  description?: string
  pricingType: PricingType
  price?: number
  priceHatchback?: number | null
  priceSedan?: number | null
  priceSuv?: number | null
  durationMins: number
  serviceIds: string[]
}

// Mirrors pricingPayload in ./services — send only the price fields the chosen
// pricing type uses, so we never post price:0 or leave stray tiers behind.
function pricingPayload(data: PackageMutationInput) {
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
  return { pricingType: data.pricingType, price: positive(data.price) }
}

/** GET /vendors/:vendorId/packages */
export async function getVendorPackages(
  vendorId: string
): Promise<ServicePackage[]> {
  const packages = await apiClient<ApiPackage[]>(
    `/vendors/${vendorId}/packages`,
    { auth: false }
  )
  return packages.map((p) => mapPackage(p, vendorId))
}

/** GET /vendors/me/packages */
export async function getMyPackages(): Promise<ServicePackage[]> {
  const packages = await apiClient<ApiPackage[]>('/vendors/me/packages')
  return packages.map((p) => mapPackage(p, ''))
}

/** POST /vendors/me/packages */
export async function createPackage(
  data: PackageMutationInput
): Promise<ServicePackage> {
  const pkg = await apiClient<ApiPackage>('/vendors/me/packages', {
    method: 'POST',
    body: JSON.stringify({
      name: data.name,
      ...(data.description?.trim() && { description: data.description.trim() }),
      durationMins: data.durationMins,
      serviceIds: data.serviceIds,
      ...pricingPayload(data),
    }),
  })
  return mapPackage(pkg, '')
}

/** PATCH /vendors/me/packages/:id */
export async function updatePackage(
  id: string,
  data: PackageMutationInput
): Promise<ServicePackage> {
  const pkg = await apiClient<ApiPackage>(`/vendors/me/packages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: data.name,
      // Always sent so clearing the field persists (null wipes it).
      description: data.description?.trim() ? data.description.trim() : null,
      durationMins: data.durationMins,
      serviceIds: data.serviceIds,
      ...pricingPayload(data),
    }),
  })
  return mapPackage(pkg, '')
}

/** DELETE /vendors/me/packages/:id */
export async function deletePackage(id: string): Promise<void> {
  await apiClient<ApiPackage>(`/vendors/me/packages/${id}`, {
    method: 'DELETE',
  })
}

// ─── Package photos and video ────────────────────────────────────────────────
//
// A package is a services row, so it shares the services' photo and video
// routes: garageMediaApi in @repo/core/api/service-media.
