import { apiClient } from './client'
import {
  mapPublicVendor,
  mapVendorListItem,
} from './mappers'
import type {
  ApiPublicVendor,
  ApiServiceArea,
  ApiVendorListItem,
  ApiVendorProfile,
  ApiWorkingHours,
} from './types'
import type { BookingType, Vendor } from '@/lib/types'

export interface VendorListParams {
  q?: string
  bookingType?: BookingType
  category?: string
  pincode?: string
}

/** GET /vendors */
export async function getVendors(params?: VendorListParams): Promise<Vendor[]> {
  const vendors = await apiClient<ApiVendorListItem[]>('/vendors', {
    auth: false,
    params: {
      q: params?.q || undefined,
      booking_type: params?.bookingType,
      category: params?.category,
      pincode: params?.pincode,
    },
  })
  return vendors.map(mapVendorListItem)
}

/** GET /vendors/:id */
export async function getVendor(id: string): Promise<Vendor | undefined> {
  try {
    const vendor = await apiClient<ApiPublicVendor>(`/vendors/${id}`, {
      auth: false,
    })
    return mapPublicVendor(vendor)
  } catch {
    return undefined
  }
}

/** GET /vendors/:id (raw with services) */
export async function getPublicVendor(id: string): Promise<ApiPublicVendor> {
  return apiClient<ApiPublicVendor>(`/vendors/${id}`, { auth: false })
}

/** POST /vendors */
export async function createVendor(data: {
  businessName: string
  phone: string
  address: string
  city: string
  lat: number
  lng: number
}): Promise<void> {
  await apiClient('/vendors', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** GET /vendors/me */
export async function getMyVendor(): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me')
}

/** PATCH /vendors/me/job-types */
export async function updateVendorJobTypes(data: {
  dropinEnabled?: boolean
  doorstepEnabled?: boolean
}): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me/job-types', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/** PATCH /vendors/me/slot-interval */
export async function updateSlotInterval(slotIntervalMins: 30 | 45 | 60): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me/slot-interval', {
    method: 'PATCH',
    body: JSON.stringify({ slotIntervalMins }),
  })
}

/** GET /vendors/me/working-hours */
export async function getWorkingHours(): Promise<ApiWorkingHours[]> {
  return apiClient<ApiWorkingHours[]>('/vendors/me/working-hours')
}

/** PUT /vendors/me/working-hours */
export async function setVendorWorkingHours(
  days: Array<{
    dayOfWeek: number
    openTime: string
    closeTime: string
    isClosed: boolean
  }>
): Promise<ApiWorkingHours[]> {
  return apiClient<ApiWorkingHours[]>('/vendors/me/working-hours', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  })
}

/** PUT /vendors/me/working-hours */
export async function setWorkingHours(
  openTime: string,
  closeTime: string
): Promise<void> {
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: openTime.length === 5 ? `${openTime}:00` : openTime,
    closeTime: closeTime.length === 5 ? `${closeTime}:00` : closeTime,
    isClosed: false,
  }))

  await setVendorWorkingHours(days)
}

/** GET /vendors/me/service-areas */
export async function getServiceAreas(): Promise<ApiServiceArea[]> {
  return apiClient<ApiServiceArea[]>('/vendors/me/service-areas')
}

/** POST /vendors/me/service-areas */
export async function createServiceArea(data: {
  areaName: string
  pincode: string
  radiusKm?: number
}): Promise<ApiServiceArea> {
  return apiClient<ApiServiceArea>('/vendors/me/service-areas', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** DELETE /vendors/me/service-areas/:id */
export async function deleteServiceArea(id: string): Promise<ApiServiceArea> {
  return apiClient<ApiServiceArea>(`/vendors/me/service-areas/${id}`, {
    method: 'DELETE',
  })
}

/** Vendor onboarding step handler */
export async function submitVendorOnboarding(
  step: number,
  data: Record<string, unknown>
): Promise<void> {
  if (step === 2) {
    await createVendor({
      businessName: data.businessName as string,
      phone: data.phone as string,
      address: data.address as string,
      city: data.city as string,
      lat: data.lat as number,
      lng: data.lng as number,
    })
    return
  }

  if (step === 3) {
    await Promise.all([
      updateVendorJobTypes({ dropinEnabled: data.dropin as boolean }),
      updateSlotInterval(data.slotInterval as 30 | 45 | 60),
      setWorkingHours(data.openTime as string, data.closeTime as string),
    ])

    const areas = data.areas as Array<{ pincode: string; name: string }>
    for (const area of areas) {
      await createServiceArea({
        areaName: area.name,
        pincode: area.pincode,
      })
    }
  }
}

/** PATCH /vendors/me */
export async function updateVendorSettings(
  data: Partial<{
    businessName: string
    phone: string
    address: string
    city: string
    lat: number
    lng: number
  }>
): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
