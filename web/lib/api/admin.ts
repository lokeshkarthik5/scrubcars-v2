import { apiClient } from './client'
import type { ServiceCategory } from '@/lib/types'

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
  serviceCount: number
  owner: {
    id: string
    name: string
    phone: string
  } | null
}

export interface AdminPhoto {
  id: string
  url: string
  sortOrder: number
}

export interface AdminVendorDetail {
  id: string
  logoUrl: string | null
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
  photos: AdminPhoto[]
  services: Array<{
    id: string
    name: string
    description: string | null
    category: ServiceCategory
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price: string
    priceHatchback: string | null
    priceSedan: string | null
    priceSuv: string | null
    durationMins: number
    images: AdminPhoto[]
  }>
}

/** A service in an admin vendor update: `id` present = edit, absent = create. */
export interface UpdateVendorServiceInput {
  id?: string
  name: string
  description?: string
  category: ServiceCategory
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
  durationMins?: number
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
  subtotalAmount: string
  discountAmount: string
  discountCode: string | null
  discountFundedBy: 'platform' | 'vendor' | null
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
    category: ServiceCategory
    pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
    price?: number
    priceHatchback?: number
    priceSedan?: number
    priceSuv?: number
    durationMins?: number
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

// ─── Media ───────────────────────────────────────────────────────────────────
//
// Presign → PUT straight to R2 → register the public URL, the same three steps
// the vendor panel uses. The admin variants name the vendor (or service)
// instead of resolving it from an owner token.

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

async function putToR2(uploadUrl: string, file: File) {
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }
}

/** Upload and set a garage logo. Returns the updated vendor row. */
export async function uploadAdminVendorLogo(vendorId: string, file: File) {
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/vendors/${vendorId}/logo/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type as UploadContentType }),
  })

  await putToR2(uploadUrl, file)

  return apiClient<{ logoUrl: string | null }>(
    `/admin/vendors/${vendorId}/logo`,
    { method: 'PUT', body: JSON.stringify({ url: publicUrl }) }
  )
}

/** DELETE /admin/vendors/:id/logo */
export async function deleteAdminVendorLogo(vendorId: string) {
  return apiClient<{ logoUrl: string | null }>(
    `/admin/vendors/${vendorId}/logo`,
    { method: 'DELETE' }
  )
}

/** Upload and register one gallery photo. Returns the created row. */
export async function uploadAdminVendorPhoto(vendorId: string, file: File) {
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/vendors/${vendorId}/photos/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type as UploadContentType }),
  })

  await putToR2(uploadUrl, file)

  return apiClient<AdminPhoto>(`/admin/vendors/${vendorId}/photos`, {
    method: 'POST',
    body: JSON.stringify({ url: publicUrl }),
  })
}

/** DELETE /admin/vendors/:id/photos/:photoId */
export async function deleteAdminVendorPhoto(
  vendorId: string,
  photoId: string
) {
  return apiClient<AdminPhoto>(
    `/admin/vendors/${vendorId}/photos/${photoId}`,
    { method: 'DELETE' }
  )
}

/** Upload one service image. Returns that service's full image list. */
export async function uploadAdminServiceImage(serviceId: string, file: File) {
  const { uploadUrl, publicUrl } = await apiClient<{
    uploadUrl: string
    publicUrl: string
  }>(`/admin/services/${serviceId}/images/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type as UploadContentType }),
  })

  await putToR2(uploadUrl, file)

  return apiClient<AdminPhoto[]>(`/admin/services/${serviceId}/images`, {
    method: 'POST',
    body: JSON.stringify({ url: publicUrl }),
  })
}

/** DELETE /admin/services/:serviceId/images/:imageId */
export async function deleteAdminServiceImage(
  serviceId: string,
  imageId: string
) {
  return apiClient<AdminPhoto[]>(
    `/admin/services/${serviceId}/images/${imageId}`,
    { method: 'DELETE' }
  )
}

/** GET /admin/bookings */
export async function listAdminBookings(status?: string) {
  return apiClient<AdminBooking[]>('/admin/bookings', {
    params: { status },
  })
}

// ─── Discounts ───────────────────────────────────────────────────────────────
//
// Mounted under /admin/* because the admin session cookie is scoped to
// path=/api/v1/admin — a discount route anywhere else never receives it.

export type DiscountType = 'percentage' | 'fixed'
export type DiscountFundedBy = 'platform' | 'vendor'

export interface AdminDiscount {
  id: string
  code: string
  description: string | null
  discountType: DiscountType
  /** Decimal strings as stored; null when the other effect applies. */
  percentOff: string | null
  amountOff: string | null
  maxDiscountAmount: string | null
  minOrderAmount: string | null
  perUserLimit: number | null
  totalUsageLimit: number | null
  vendorId: string | null
  vendorName: string | null
  fundedBy: DiscountFundedBy
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  createdAt: string
  /** Audit rows — any at all blocks deletion. */
  redemptionCount: number
  /** Live uses, paid or not — this is what the usage limits compare against. */
  heldCount: number
  /** Uses whose money actually landed. */
  realizedCount: number
  /** Rupees saved, realized only. */
  totalSaved: string
}

/** Numbers here are plain units: 20 = 20%, 500 = ₹500. Null = unlimited/none. */
export interface DiscountInput {
  code: string
  description?: string | null
  discountType: DiscountType
  percentOff?: number
  amountOff?: number
  maxDiscountAmount?: number | null
  minOrderAmount?: number | null
  perUserLimit?: number | null
  totalUsageLimit?: number | null
  vendorId?: string | null
  fundedBy: DiscountFundedBy
  startsAt?: string | null
  endsAt?: string | null
  isActive: boolean
}

export interface DiscountVendorOption {
  id: string
  businessName: string
}

/** GET /admin/discounts */
export async function listAdminDiscounts(params?: {
  q?: string
  active?: boolean
}): Promise<AdminDiscount[]> {
  return apiClient<AdminDiscount[]>('/admin/discounts', {
    params: {
      q: params?.q || undefined,
      active: params?.active === undefined ? undefined : String(params.active),
    },
  })
}

/** GET /admin/discounts/:id */
export async function getAdminDiscount(id: string): Promise<AdminDiscount> {
  return apiClient<AdminDiscount>(`/admin/discounts/${id}`)
}

/** POST /admin/discounts */
export async function createAdminDiscount(
  input: DiscountInput
): Promise<AdminDiscount> {
  return apiClient<AdminDiscount>('/admin/discounts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/discounts/:id — also the activate/deactivate path. */
export async function updateAdminDiscount(
  id: string,
  input: Partial<DiscountInput>
): Promise<AdminDiscount> {
  return apiClient<AdminDiscount>(`/admin/discounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** DELETE /admin/discounts/:id — 409 DISCOUNT_IN_USE once redeemed. */
export async function deleteAdminDiscount(id: string): Promise<void> {
  await apiClient(`/admin/discounts/${id}`, { method: 'DELETE' })
}

/** GET /admin/discounts/vendors — the garage picker for vendor-scoped codes. */
export async function listDiscountVendorOptions(): Promise<
  DiscountVendorOption[]
> {
  return apiClient<DiscountVendorOption[]>('/admin/discounts/vendors')
}
