import { apiClient } from './client'
import type { ApiMember } from './members'
import type { VendorRole } from './types'
import type { ServiceCategory } from '@repo/core/types'

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
  /** Null until someone pins the garage. Blocks verification while unset. */
  lat: number | null
  lng: number | null
  geoSource: 'unset' | 'gps' | 'map_pin' | 'geocoded' | 'admin'
  geoConfirmedAt: string | null
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
  doorstepRadiusKm: number | null
  /** Null until someone pins the garage. A vendor cannot be verified without it. */
  lat: number | null
  lng: number | null
  geoSource: 'unset' | 'gps' | 'map_pin' | 'geocoded' | 'admin'
  geoConfirmedAt: string | null
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
  doorstepRadiusKm?: number | null
  /** Both or neither — the server rejects a half-set pair. */
  lat?: number
  lng?: number
  /**
   * "I looked at this pin and it is right." Stamps `geoConfirmedAt` without
   * moving anything — the only way to confirm a pin on an already-verified
   * vendor, since verification is the other writer and cannot run twice.
   */
  confirmLocation?: true
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

export type BookingParty = 'customer' | 'garage'
export type CancelledOnBehalfOf = BookingParty | 'detlio'

/**
 * One row of the admin bookings list — what ops needs to answer a call about
 * a booking without opening it.
 */
export interface AdminBooking {
  id: string
  /** "3F2A9C1B": the number customers and garages read out. */
  reference: string
  status: string
  bookingType: string
  scheduledAt: string
  createdAt: string
  /**
   * Minutes a pending booking has waited for its garage, counted from the
   * later of creation and payment. Null for every other status.
   */
  waitingMins: number | null
  durationMins: number
  amount: string
  subtotalAmount: string
  discountAmount: string
  discountCode: string | null
  discountFundedBy: 'platform' | 'vendor' | null
  paymentMethod: string
  payment: {
    status: string
    /** The Razorpay payment id — what ops searches the dashboard for to refund. */
    gatewayTxnId: string | null
    paidAt: string | null
  } | null
  garage: { id: string; name: string; phone: string } | null
  customer: { id: string; name: string; phone: string } | null
  /** Where a doorstep job happens. Null for a job at the garage. */
  address: string | null
  vehicle: { id: string; make: string; model: string; plate: string | null } | null
  /** Every service on the booking, priced as sold. */
  items: Array<{
    id: string
    serviceId: string
    name: string
    amount: string
    durationMins: number
  }>
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  /** Only on a Detlio cancellation: whose call it was. */
  cancelledOnBehalfOf: CancelledOnBehalfOf | null
  cancellationReason: string | null
  cancelledAt: string | null
  noShow: BookingParty | null
  noShowMarkedAt: string | null
  notesCount: number
  rescheduledFromId: string | null
}

/** An ops-team note. Never shown to customers or garages. */
export interface AdminBookingNote {
  id: string
  author: string
  body: string
  createdAt: string
}

export interface AdminBookingDetail extends AdminBooking {
  lat: number | null
  lng: number | null
  garageAddress: string | null
  /** Who at the garage accepted / completed it, when the garage recorded it. */
  acceptedByName: string | null
  completedByName: string | null
  originalBookingId: string | null
  /** The booking this one was moved to, when the customer rescheduled it. */
  rescheduledToId: string | null
  rescheduleCount: number
  /** Newest first. */
  notes: AdminBookingNote[]
}

export interface AdminBookingFilters {
  /** A booking reference, a customer phone or name, or a garage name. */
  q?: string
  status?: string
  vendorId?: string
  /** IST calendar dates (YYYY-MM-DD) on the scheduled time, both inclusive. */
  from?: string
  to?: string
  limit?: number
  /** Older paging; the panel uses `cursor`. */
  page?: number
  /**
   * Continue after this row: "<scheduledAt ISO>_<id>" of the last row of the
   * previous page (see adminBookingsCursor).
   */
  cursor?: string
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
  doorstepRadiusKm?: number
  lat?: number
  lng?: number
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
  return apiClient<{ isSuperAdmin: boolean }>('/admin/login', {
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
  return apiClient<{ isSuperAdmin: boolean }>('/admin/me')
}

/** GET /admin/vendors */
export async function listAdminVendors() {
  return apiClient<AdminVendor[]>('/admin/vendors')
}

/** One garage on the pilot leaderboard. */
export interface PilotGarage {
  vendorId: string
  name: string
  paidBookings: number
  revenue: number
}

/** GET /admin/stats/pilot — see apps/server/src/lib/pilot-stats.ts. */
export interface PilotStats {
  days: 7 | 30
  /** ISO start of the rolling window. */
  since: string
  checkoutsStarted: number
  paid: number
  paidNoBooking: number
  accepted: number
  completed: number
  cancelledByCustomer: number
  cancelledByGarage: number
  cancelledByDetlio: number
  customerNoShows: number
  garageNoShows: number
  revenue: number
  rates: {
    paidOfStarted: number | null
    acceptedOfPaid: number | null
    completedOfAccepted: number | null
  }
  topGarages: PilotGarage[]
}

/** GET /admin/stats/pilot?days=7|30 */
export async function getPilotStats(days: 7 | 30) {
  return apiClient<PilotStats>('/admin/stats/pilot', { params: { days } })
}

export interface DemandSupplyCell {
  lat: number
  lng: number
  vendorCount: number
  bookingCount: number
  /** bookings − garages. Positive means demand this cell cannot serve locally. */
  gap: number
}

/** GET /admin/demand-supply */
export async function getDemandSupply() {
  return apiClient<DemandSupplyCell[]>('/admin/demand-supply')
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

/** GET /admin/bookings — one page, newest scheduled first. */
export async function listAdminBookings(filters: AdminBookingFilters = {}) {
  return apiClient<AdminBooking[]>('/admin/bookings', {
    params: {
      q: filters.q || undefined,
      status: filters.status || undefined,
      vendorId: filters.vendorId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      limit: filters.limit,
      page: filters.page,
      cursor: filters.cursor,
    },
  })
}

/** GET /admin/bookings/:id */
export async function getAdminBooking(id: string) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}`)
}

/** POST /admin/bookings/:id/cancel — returns the updated booking. */
export async function cancelAdminBooking(
  id: string,
  input: { onBehalfOf: CancelledOnBehalfOf; reason: string }
) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * POST /admin/bookings/:id/no-show — returns the updated booking. Refused with
 * 400 NO_SHOW_TOO_EARLY before the start time.
 */
export async function markAdminBookingNoShow(
  id: string,
  input: { party: BookingParty; note?: string }
) {
  return apiClient<AdminBookingDetail>(`/admin/bookings/${id}/no-show`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** POST /admin/bookings/:id/notes */
export async function addAdminBookingNote(id: string, body: string) {
  return apiClient<AdminBookingNote>(`/admin/bookings/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
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

// ─── Vendor team ─────────────────────────────────────────────────────────────
//
// The admin panel edits a *named* vendor's team, so these take an explicit
// vendorId — unlike the vendor-facing `/lib/api/members`, where the company is
// whichever one the caller is acting as. Same service behind both, so the
// owner-immutability rules are identical.

/** GET /admin/vendors/:id/members */
export async function listAdminVendorMembers(
  vendorId: string
): Promise<ApiMember[]> {
  return apiClient<ApiMember[]>(`/admin/vendors/${vendorId}/members`)
}

/** POST /admin/vendors/:id/members */
export async function addAdminVendorMember(
  vendorId: string,
  input: { phone: string; name?: string; role: VendorRole }
): Promise<void> {
  await apiClient(`/admin/vendors/${vendorId}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** PATCH /admin/vendors/:id/members/:memberId */
export async function updateAdminVendorMember(
  vendorId: string,
  memberId: string,
  input: { role?: VendorRole; status?: 'active' | 'suspended' }
): Promise<void> {
  await apiClient(`/admin/vendors/${vendorId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** DELETE /admin/vendors/:id/members/:memberId */
export async function removeAdminVendorMember(
  vendorId: string,
  memberId: string
): Promise<void> {
  await apiClient(`/admin/vendors/${vendorId}/members/${memberId}`, {
    method: 'DELETE',
  })
}
