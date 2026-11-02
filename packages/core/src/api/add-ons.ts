import { apiClient } from './client'
import type { AddOn, ApiAddOn } from './types'

export type { AddOn } from './types'

/** What the garage's form (and the admin editor's) sends. */
export interface AddOnInput {
  name: string
  pricingType: 'flat' | 'per_vehicle'
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
  /** Blank is no extra time. */
  extraMins?: number | null
  isActive?: boolean
}

export function mapAddOn(row: ApiAddOn): AddOn {
  const tier = (value: string | null) => (value === null ? null : Number(value))
  return {
    id: row.id,
    name: row.name,
    pricingType: row.pricingType,
    price: Number(row.price),
    priceHatchback: tier(row.priceHatchback),
    priceSedan: tier(row.priceSedan),
    priceSuv: tier(row.priceSuv),
    extraMins: row.extraMins,
    isActive: row.isActive,
  }
}

// Only the price fields matching the pricing type: the server's refinement
// requires exactly those, and would refuse a stray price of 0.
function body(input: Partial<AddOnInput>) {
  const { price, priceHatchback, priceSedan, priceSuv, pricingType, ...rest } =
    input
  return JSON.stringify({
    ...rest,
    ...(pricingType === 'flat' ? { pricingType, price } : {}),
    ...(pricingType === 'per_vehicle'
      ? { pricingType, priceHatchback, priceSedan, priceSuv }
      : {}),
  })
}

/** GET /vendors/:vendorId/add-ons: what a customer can add, live ones only. */
export async function getVendorAddOns(vendorId: string): Promise<AddOn[]> {
  const rows = await apiClient<ApiAddOn[]>(`/vendors/${vendorId}/add-ons`, {
    auth: false,
  })
  return rows.map(mapAddOn)
}

/** The same four calls on the garage's own routes or on admin's for one garage. */
function managedAddOns(base: () => string) {
  return {
    list: async () => (await apiClient<ApiAddOn[]>(base())).map(mapAddOn),
    create: async (input: AddOnInput) =>
      mapAddOn(
        await apiClient<ApiAddOn>(base(), { method: 'POST', body: body(input) })
      ),
    update: async (id: string, input: Partial<AddOnInput>) =>
      mapAddOn(
        await apiClient<ApiAddOn>(`${base()}/${id}`, {
          method: 'PATCH',
          body: body(input),
        })
      ),
    remove: async (id: string) => {
      await apiClient<ApiAddOn>(`${base()}/${id}`, { method: 'DELETE' })
    },
  }
}

export type AddOnsApi = ReturnType<typeof managedAddOns>

export const garageAddOnsApi: AddOnsApi = managedAddOns(
  () => '/vendors/me/add-ons'
)

export const adminAddOnsApi = (vendorId: string): AddOnsApi =>
  managedAddOns(() => `/admin/vendors/${vendorId}/add-ons`)
