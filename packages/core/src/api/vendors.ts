import { apiClient } from './client'
import { stripImageMetadata } from '@repo/core/image-upload'
import { useAuthStore } from '@repo/core/stores/auth-store'
import {
  mapBooking,
  mapPublicVendor,
  mapVendorListItem,
} from './mappers'
import type {
  ApiBooking,
  ApiJustOutsideItem,
  ApiPublicVendor,
  ApiReachFigures,
  ApiServiceArea,
  ApiVendorClosure,
  ApiVendorList,
  ApiVendorProfile,
  ApiWorkingHours,
} from './types'
import type { Booking, BookingType, Vendor } from '@repo/core/types'

export type VendorSort =
  | 'distance'
  | 'rating'
  | 'price_asc'
  | 'price_desc'
  | 'relevance'

export interface VendorListParams {
  q?: string
  bookingType?: BookingType
  category?: string
  /** Customer origin. Both or neither — the server rejects a half-set pair. */
  lat?: number
  lng?: number
  /**
   * Drop-in only, and at most 50. Left out, there is no bound (0062): every
   * garage, nearest first. Doorstep is bounded by each garage's own travel
   * radius, since the question there is "who will come to me", and a typed
   * search (`q`) has no radius at all.
   */
  radiusKm?: number
  /** Viewport for the map view's "search as I move the map". */
  bbox?: string
  sort?: VendorSort
  /**
   * Append garages that have no coordinates yet, after the located ones.
   * Defaults to true server-side — while most garages are still unpinned,
   * hiding them would empty the listing for a city full of them.
   *
   * Pass false where they cannot be used: the map view cannot draw a garage
   * with no coordinates.
   */
  includeUnlocated?: boolean
  /**
   * "Silver & above" (0063): only garages showing a Silver or Gold medal (as
   * admin switched the tiers on). Filtered on the server, so paging holds.
   */
  silverAndAbove?: boolean
  limit?: number
  cursor?: string
}

export interface VendorListResult {
  vendors: Vendor[]
  nextCursor: string | null
  /**
   * How far from the customer the list reached, in km, or null when no radius
   * applied. Set even when nothing was found within it, so a screen can say
   * "No garages within 50 km of you yet." rather than a bare "none".
   */
  radiusKm: number | null
  /** What each tab offers (first page; null otherwise, or from an API before 0062). */
  reach: ApiReachFigures | null
  /** Doorstep and Pickup & drop's "Just outside their area" group (first page, with a location). */
  outside: JustOutsideVendor[] | null
}

/** A garage just outside its own reach: its card, the radius it covers and how far out the customer is. */
export interface JustOutsideVendor {
  vendor: Vendor
  coverKm: number | null
  outsideKm: number
}

function mapJustOutside(item: ApiJustOutsideItem): JustOutsideVendor {
  return { vendor: mapVendorListItem(item), coverKm: item.coverKm, outsideKm: item.outsideKm }
}

/** GET /vendors */
export async function getVendors(
  params?: VendorListParams
): Promise<VendorListResult> {
  const result = await apiClient<ApiVendorList>('/vendors', {
    auth: false,
    params: {
      q: params?.q || undefined,
      bookingType: params?.bookingType,
      category: params?.category,
      lat: params?.lat,
      lng: params?.lng,
      radiusKm: params?.radiusKm,
      bbox: params?.bbox,
      sort: params?.sort,
      includeUnlocated: params?.includeUnlocated,
      // Sent only when on: left out, the list is every garage.
      tier: params?.silverAndAbove ? 'silver' : undefined,
      limit: params?.limit,
      cursor: params?.cursor,
    },
  })

  return {
    vendors: result.items.map(mapVendorListItem),
    nextCursor: result.nextCursor,
    // An API from before `radiusKm` sends only the ladder's ring, which was
    // null whenever nothing was found; close enough for the rare deploy gap.
    radiusKm: result.radiusKm !== undefined ? result.radiusKm : (result.appliedRadiusKm ?? null),
    reach: result.reach ?? null,
    outside: result.outside ? result.outside.map(mapJustOutside) : null,
  }
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

export interface VendorProfileInput {
  whatsapp?: string
  email?: string
  yearsInOperation?: string
  mapsUrl?: string
  /**
   * How far this garage will travel for doorstep work. Null clears it, and
   * the garage then covers the default (DEFAULT_DOORSTEP_RADIUS_KM).
   */
  doorstepRadiusKm?: number | null
  /** How the coordinates were arrived at. See plans/geo.md §4. */
  geoSource?: 'gps' | 'map_pin'
  /** Cars at once, 1–20. */
  bays?: number
  /** The most jobs in a day; null clears it (no limit). */
  jobsPerDay?: number | null
  vehicleTypes?: string[]
}

/** POST /vendors */
export async function createVendor(
  data: {
    businessName: string
    phone: string
    address: string
    city: string
    pincode: string
    lat: number
    lng: number
  } & VendorProfileInput
): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors', {
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
  /**
   * How far the garage goes, sent with doorstepEnabled so the two land
   * together. Optional: without one (or a drawn area) the garage covers
   * DEFAULT_DOORSTEP_RADIUS_KM from its pin.
   */
  doorstepRadiusKm?: number
  /**
   * Pickup & drop. Turning it on needs `pickupTermsAccepted: true`, the
   * owner's tick (PICKUP_TERMS_GARAGE); off never does. A null radius is the
   * 10 km default.
   */
  pickupEnabled?: boolean
  pickupRadiusKm?: number | null
  pickupTermsAccepted?: boolean
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

/** GET /vendors/:id/working-hours (public) */
export async function getVendorWorkingHours(id: string): Promise<ApiWorkingHours[]> {
  return apiClient<ApiWorkingHours[]>(`/vendors/${id}/working-hours`, {
    auth: false,
  })
}

/** GET /vendors/:id/closures (public) — upcoming holidays as IST dates */
export async function getVendorClosures(id: string): Promise<string[]> {
  return apiClient<string[]>(`/vendors/${id}/closures`, { auth: false })
}

/** GET /vendors/me/closures — today's and later holidays */
export async function getMyClosures(): Promise<ApiVendorClosure[]> {
  return apiClient<ApiVendorClosure[]>('/vendors/me/closures')
}

/**
 * POST /vendors/me/closures. Comes back with the bookings already on that
 * day: marking a holiday leaves them in place, and the owner has to sort them
 * out with the customers.
 */
export async function addClosure(data: {
  date: string
  reason?: string
}): Promise<{ closure: ApiVendorClosure; bookings: Booking[] }> {
  const result = await apiClient<{
    closure: ApiVendorClosure
    bookings: ApiBooking[]
  }>('/vendors/me/closures', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return { closure: result.closure, bookings: result.bookings.map(mapBooking) }
}

/** DELETE /vendors/me/closures/:id */
export async function removeClosure(id: string): Promise<ApiVendorClosure> {
  return apiClient<ApiVendorClosure>(`/vendors/me/closures/${id}`, {
    method: 'DELETE',
  })
}

/** POST /vendors/me/pause — stop taking new bookings */
export async function pauseBookings(reason?: string): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me/pause', {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  })
}

/** POST /vendors/me/resume */
export async function resumeBookings(): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me/resume', { method: 'POST' })
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

/** PUT /vendors/me/working-hours — open on the selected days, closed on the rest */
export async function setWorkingHoursForDays(
  openDays: number[],
  openTime: string,
  closeTime: string
): Promise<void> {
  const open = openDays.length ? new Set(openDays) : new Set([0, 1, 2, 3, 4, 5, 6])
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: openTime.length === 5 ? `${openTime}:00` : openTime,
    closeTime: closeTime.length === 5 ? `${closeTime}:00` : closeTime,
    isClosed: !open.has(dayOfWeek),
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

export interface ApiVendorPhoto {
  id: string
  url: string
  sortOrder: number
  createdAt: string
}

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

/** POST /vendors/me/logo/upload-url — presigned R2 PUT URL for the logo */
export async function getLogoUploadUrl(
  contentType: UploadContentType
): Promise<{ uploadUrl: string; publicUrl: string }> {
  return apiClient<{ uploadUrl: string; publicUrl: string }>(
    '/vendors/me/logo/upload-url',
    { method: 'POST', body: JSON.stringify({ contentType }) }
  )
}

/** PUT /vendors/me/logo — set the vendor logo URL */
export async function setVendorLogo(url: string): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me/logo', {
    method: 'PUT',
    body: JSON.stringify({ url }),
  })
}

/** DELETE /vendors/me/logo */
export async function deleteVendorLogo(): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me/logo', { method: 'DELETE' })
}

/**
 * Full logo upload flow: strip the image's metadata → presign → PUT to R2 →
 * save URL on the vendor.
 */
export async function uploadVendorLogo(file: File): Promise<ApiVendorProfile> {
  const clean = await stripImageMetadata(file)
  const contentType = clean.type as UploadContentType
  const { uploadUrl, publicUrl } = await getLogoUploadUrl(contentType)

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: clean,
    headers: { 'Content-Type': contentType },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }

  return setVendorLogo(publicUrl)
}

/** GET /vendors/me/photos */
export async function getMyPhotos(): Promise<ApiVendorPhoto[]> {
  return apiClient<ApiVendorPhoto[]>('/vendors/me/photos')
}

/** POST /vendors/me/photos/upload-url — presigned R2 PUT URL */
export async function getPhotoUploadUrl(
  contentType: UploadContentType
): Promise<{ uploadUrl: string; publicUrl: string }> {
  return apiClient<{ uploadUrl: string; publicUrl: string }>(
    '/vendors/me/photos/upload-url',
    { method: 'POST', body: JSON.stringify({ contentType }) }
  )
}

/** POST /vendors/me/photos — register an uploaded photo */
export async function addVendorPhoto(url: string): Promise<ApiVendorPhoto> {
  return apiClient<ApiVendorPhoto>('/vendors/me/photos', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

/** DELETE /vendors/me/photos/:id */
export async function deleteVendorPhoto(id: string): Promise<ApiVendorPhoto> {
  return apiClient<ApiVendorPhoto>(`/vendors/me/photos/${id}`, {
    method: 'DELETE',
  })
}

/**
 * Full upload flow: strip the photo's location metadata, get a presigned URL,
 * PUT the file straight to R2, then register the resulting public URL.
 * Returns the created photo record.
 */
export async function uploadVendorPhoto(file: File): Promise<ApiVendorPhoto> {
  const clean = await stripImageMetadata(file)
  const contentType = clean.type as UploadContentType
  const { uploadUrl, publicUrl } = await getPhotoUploadUrl(contentType)

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: clean,
    headers: { 'Content-Type': contentType },
  })
  if (!put.ok) {
    throw new Error('Upload failed. Please try again.')
  }

  return addVendorPhoto(publicUrl)
}

/** Vendor onboarding step handler */
export async function submitVendorOnboarding(
  step: number,
  data: Record<string, unknown>
): Promise<void> {
  if (step === 2) {
    const vendor = await createVendor({
      businessName: data.businessName as string,
      phone: data.phone as string,
      address: data.address as string,
      city: data.city as string,
      pincode: data.pincode as string,
      lat: data.lat as number,
      lng: data.lng as number,
      geoSource: (data.geoSource as 'gps' | 'map_pin') || undefined,
      whatsapp: (data.whatsapp as string) || undefined,
      email: (data.email as string) || undefined,
      yearsInOperation: (data.yearsInOperation as string) || undefined,
      mapsUrl: (data.mapsUrl as string) || undefined,
    })

    // Steps 3 and 4 configure "the company I am acting as", so the new one has
    // to become active before they run. Without this, someone onboarding a
    // second garage would silently rewrite the first one's hours and services —
    // the client would still be sending the previous company's id.
    const auth = useAuthStore.getState()
    await auth.refreshVendors()
    auth.setActiveVendor(vendor.id)
    return
  }

  if (step === 3) {
    // Every field on this call is optional on the screen, so leaving them all
    // blank is a normal way to finish the step. PATCH /vendors/me rejects an
    // empty body ("At least one field must be provided"), which turned that
    // into a Bad Request the vendor could not get past — so only send it when
    // there is something to send.
    const settings = {
      ...(data.bays != null ? { bays: data.bays as number } : {}),
      ...(data.jobsPerDay != null
        ? { jobsPerDay: data.jobsPerDay as number }
        : {}),
      ...((data.vehicleTypes as string[])?.length
        ? { vehicleTypes: data.vehicleTypes as string[] }
        : {}),
    }

    await Promise.all([
      // Doorstep and its distance in one call, so the two land together. The
      // distance is optional: left out, the garage covers the default 10 km
      // (DEFAULT_DOORSTEP_RADIUS_KM).
      updateVendorJobTypes({
        dropinEnabled: data.dropin as boolean,
        doorstepEnabled: data.doorstep as boolean,
        ...(data.doorstep && data.doorstepRadiusKm != null
          ? { doorstepRadiusKm: data.doorstepRadiusKm as number }
          : {}),
      }),
      updateSlotInterval(data.slotInterval as 30 | 45 | 60),
      setWorkingHoursForDays(
        data.workingDays as number[],
        data.openTime as string,
        data.closeTime as string
      ),
      ...(Object.keys(settings).length > 0 ? [updateVendorSettings(settings)] : []),
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
    pincode: string
    lat: number
    lng: number
  }> &
    VendorProfileInput
): Promise<ApiVendorProfile> {
  return apiClient<ApiVendorProfile>('/vendors/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
