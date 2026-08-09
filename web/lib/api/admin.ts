import { apiClient } from './client'

export interface AdminVendor {
  id: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email: string | null
  whatsapp: string | null
  isVerified: boolean
  status: string
  createdAt: string
  owner: {
    id: string
    name: string
    phone: string
  } | null
}

export interface AdminVendorDetail {
  id: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email: string | null
  whatsapp: string | null
  yearsInOperation: string | null
  mapsUrl: string | null
  pickup: 'yes' | 'nearby' | 'no' | null
  pickupRadiusKm: number | null
  dropinEnabled: boolean
  doorstepEnabled: boolean
  slotIntervalMins: number
  bays: number | null
  jobsPerDay: number | null
  vehicleTypes: string[]
  notes: string | null
  isVerified: boolean
  status: string
  createdAt: string
  owner: {
    id: string
    name: string
    phone: string
  } | null
  workingHours: Array<{
    dayOfWeek: number
    openTime: string
    closeTime: string
    isClosed: boolean
  }>
  services: Array<{
    id: string
    name: string
    category: 'car_wash' | 'detailing' | 'coating' | 'scratch_removal' | 'others'
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price: string
    priceHatchback: string | null
    priceSedan: string | null
    priceSuv: string | null
    durationMins: number
  }>
}

/** A service in an admin vendor update: `id` present = edit, absent = create. */
export interface UpdateVendorServiceInput {
  id?: string
  name: string
  category: 'car_wash' | 'detailing' | 'coating' | 'scratch_removal' | 'others'
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
  durationMins: number
}

export interface UpdateVendorInput {
  ownerName?: string
  ownerPhone?: string
  businessName?: string
  phone?: string
  address?: string
  city?: string
  pincode?: string
  email?: string | null
  whatsapp?: string | null
  yearsInOperation?: string | null
  mapsUrl?: string | null
  pickup?: 'yes' | 'nearby' | 'no' | null
  pickupRadiusKm?: number | null
  dropinEnabled?: boolean
  doorstepEnabled?: boolean
  slotIntervalMins?: 30 | 45 | 60
  bays?: number | null
  jobsPerDay?: number | null
  vehicleTypes?: string[]
  workingDays?: number[]
  openTime?: string
  closeTime?: string
  status?: 'pending' | 'active' | 'suspended' | 'archived'
  isVerified?: boolean
  notes?: string | null
  services?: UpdateVendorServiceInput[]
}

export interface AdminBooking {
  id: string
  bookingType: string
  scheduledAt: string
  status: string
  amount: string
  paymentMethod: string
  createdAt: string
  vendor: { id: string; businessName: string; phone: string } | null
  user: { id: string; name: string; phone: string } | null
  service: {
    id: string
    name: string
    pricingType?: 'flat' | 'per_vehicle' | 'on_inspection'
  } | null
  vehicle: { id: string; make: string; model: string } | null
  payment: { status: string } | null
}

export interface CreateVendorInput {
  ownerName: string
  ownerPhone: string
  businessName: string
  phone: string
  address: string
  city: string
  pincode: string
  email?: string
  whatsapp?: string
  yearsInOperation?: string
  mapsUrl?: string
  pickup?: 'yes' | 'nearby' | 'no'
  pickupRadiusKm?: number
  dropinEnabled?: boolean
  doorstepEnabled?: boolean
  slotIntervalMins?: 30 | 45 | 60
  bays?: number
  jobsPerDay?: number
  vehicleTypes?: string[]
  workingDays?: number[]
  openTime?: string
  closeTime?: string
  status?: 'pending' | 'active' | 'suspended' | 'archived'
  isVerified?: boolean
  notes?: string
  services?: Array<{
    name: string
    description?: string
    category: 'car_wash' | 'detailing' | 'coating' | 'scratch_removal' | 'others'
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price?: number
    priceHatchback?: number
    priceSedan?: number
    priceSuv?: number
    durationMins: number
  }>
}

/** POST /admin/login */
export async function adminLogin(username: string, password: string) {
  return apiClient<{ isAdmin: boolean }>('/admin/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ username, password }),
  })
}

/** POST /admin/logout */
export async function adminLogout() {
  return apiClient<void>('/admin/logout', { method: 'POST', auth: false })
}

/** GET /admin/me — session check */
export async function getAdminMe() {
  return apiClient<{ isAdmin: boolean }>('/admin/me')
}

/** GET /admin/vendors */
export async function listAdminVendors() {
  return apiClient<AdminVendor[]>('/admin/vendors')
}

/** POST /admin/vendors */
export async function createAdminVendor(input: CreateVendorInput) {
  return apiClient<AdminVendor>('/admin/vendors', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** GET /admin/vendors/:id — full detail for editing */
export async function getAdminVendor(id: string) {
  return apiClient<AdminVendorDetail>(`/admin/vendors/${id}`)
}

/** PATCH /admin/vendors/:id — update vendor details */
export async function updateAdminVendor(id: string, input: UpdateVendorInput) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/vendors/:id/verify */
export async function verifyAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/verify`, {
    method: 'PATCH',
  })
}

/** PATCH /admin/vendors/:id/archive — hide from customers, keep data */
export async function archiveAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/archive`, {
    method: 'PATCH',
  })
}

/** PATCH /admin/vendors/:id/unarchive — restore visibility */
export async function unarchiveAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/unarchive`, {
    method: 'PATCH',
  })
}

/** DELETE /admin/vendors/:id — permanent hard delete */
export async function deleteAdminVendor(id: string) {
  return apiClient<void>(`/admin/vendors/${id}`, {
    method: 'DELETE',
  })
}

/** GET /admin/bookings */
export async function listAdminBookings(status?: string) {
  return apiClient<AdminBooking[]>('/admin/bookings', {
    params: { status },
  })
}
