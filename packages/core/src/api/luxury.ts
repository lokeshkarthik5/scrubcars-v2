import { apiClient } from '@repo/core/api/client'
import { stripImageMetadata, type UploadImageType } from '@repo/core/image-upload'
import type { LuxuryBrand, LuxuryLimits, LuxuryPhoto, LuxuryStatus } from '@repo/core/luxury'
import type { Tier } from '@repo/core/tiers'
import { signedBody } from './admin-signer'

/**
 * Luxury car specialists (API 0083, apps/server/src/modules/luxury). Typed
 * here by hand from the server's own shapes. Customers get only a garage's
 * `luxury: { brands }` (types.ts Vendor) and the list's `luxury` filter
 * (api/vendors.ts); the garage reads and sends its own application; admin
 * reads it and decides.
 */

/** An application as the garage and admin read it. */
export interface LuxuryApplication {
  status: LuxuryStatus
  brands: LuxuryBrand[]
  photos: LuxuryPhoto[]
  coveredBay: boolean
  products: string | null
  staff: string | null
  /** The team's words on Ask for more, Decline or Remove; null otherwise. */
  teamNote: string | null
  /** Who answered last (the signed-in admin's name) and when. */
  decidedBy: string | null
  decidedAt: string | null
  /** Its place in the queue. */
  sentAt: string
  /** 1 on the first send ("first time"). */
  timesSent: number
  updatedAt: string
}

/** The badge as the garage and admin read it. */
export interface LuxuryBadgeState {
  approvedAt: string
  approvedBy: string | null
  brands: LuxuryBrand[]
  /** Customers see it now: approved, and Silver or Gold held. */
  shown: boolean
}

// ─── The garage's own ────────────────────────────────────────────────────────

export interface GarageLuxury {
  /** The tier the garage holds (whatever customers are shown). */
  tier: Tier | null
  silverOrGold: boolean
  application: LuxuryApplication | null
  badge: LuxuryBadgeState | null
  /** Declined: the IST date key it may apply again, while the wait runs. */
  reapplyOn: string | null
  limits: LuxuryLimits
}

export interface SendLuxuryApplication {
  brands: LuxuryBrand[]
  photos: LuxuryPhoto[]
  coveredBay: boolean
  products: string | null
  staff: string | null
}

/** GET /vendors/me/luxury (owner seat). */
export function getGarageLuxury(): Promise<GarageLuxury> {
  return apiClient<GarageLuxury>('/vendors/me/luxury')
}

/** PUT /vendors/me/luxury: send, or edit while under review. */
export function sendLuxuryApplication(input: SendLuxuryApplication): Promise<GarageLuxury> {
  return apiClient<GarageLuxury>('/vendors/me/luxury', { method: 'PUT', body: JSON.stringify(input) })
}

/** POST /vendors/me/luxury/photos/upload-url: a presigned PUT in the garage's luxury folder. */
export function getLuxuryPhotoUploadUrl(contentType: UploadImageType): Promise<{ uploadUrl: string; publicUrl: string }> {
  return apiClient<{ uploadUrl: string; publicUrl: string }>('/vendors/me/luxury/photos/upload-url', {
    method: 'POST',
    body: JSON.stringify({ contentType }),
  })
}

/**
 * The website's upload of one past-job photo: re-encoded first to drop
 * EXIF/GPS (stripImageMetadata, as every image upload), then PUT to R2.
 * Returns the public URL to send with the application. The native app
 * prepares its own file and uses getLuxuryPhotoUploadUrl.
 */
export async function uploadLuxuryPhoto(file: Blob): Promise<string> {
  const clean = await stripImageMetadata(file)
  const { uploadUrl, publicUrl } = await getLuxuryPhotoUploadUrl(clean.type as UploadImageType)
  const put = await fetch(uploadUrl, { method: 'PUT', body: clean, headers: { 'Content-Type': clean.type } })
  if (!put.ok) throw new Error('Upload failed. Please try again.')
  return publicUrl
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminLuxury {
  garage: { id: string; businessName: string; inBin: boolean }
  tier: Tier | null
  silverOrGold: boolean
  application: LuxuryApplication | null
  badge: LuxuryBadgeState | null
  /** On the Garages list's "Luxury applications": waiting, and Silver or Gold held. */
  onApplicationsList: boolean
}

/** GET /admin/luxury/vendors/:id */
export function getAdminLuxury(vendorId: string): Promise<AdminLuxury> {
  return apiClient<AdminLuxury>(`/admin/luxury/vendors/${vendorId}`)
}

export type LuxuryDecisionAction = 'approve' | 'ask-more' | 'decline' | 'remove'

/** POST /admin/luxury/vendors/:id/{approve,ask-more,decline,remove}: signed; every one but Approve needs a note. */
export function decideLuxury(vendorId: string, action: LuxuryDecisionAction, note?: string): Promise<AdminLuxury> {
  return apiClient<AdminLuxury>(`/admin/luxury/vendors/${vendorId}/${action}`, {
    method: 'POST',
    body: signedBody(action === 'approve' ? {} : { note: note ?? '' }),
  })
}

/** PATCH /admin/luxury/vendors/:id/brands: what customers see on an approved garage. */
export function editLuxuryBrands(vendorId: string, brands: LuxuryBrand[]): Promise<AdminLuxury> {
  return apiClient<AdminLuxury>(`/admin/luxury/vendors/${vendorId}/brands`, {
    method: 'PATCH',
    body: signedBody({ brands }),
  })
}
