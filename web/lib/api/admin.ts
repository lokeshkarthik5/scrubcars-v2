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
  service: { id: string; name: string } | null
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

/** PATCH /admin/vendors/:id/verify */
export async function verifyAdminVendor(id: string) {
  return apiClient<AdminVendor>(`/admin/vendors/${id}/verify`, {
    method: 'PATCH',
  })
}

/** GET /admin/bookings */
export async function listAdminBookings(status?: string) {
  return apiClient<AdminBooking[]>('/admin/bookings', {
    params: { status },
  })
}
