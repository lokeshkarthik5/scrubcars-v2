import { apiClient } from '@repo/core/api/client'
import type { ClaimStatus, GuaranteeIssue } from '@repo/core/guarantee'
import type { JobPhoto } from '@repo/core/types'
import { prepareCarPhoto } from './job-records'
import { mapSlots } from './mappers'

/**
 * Detlio Guarantee (0051): a free redo claim, from the customer
 * (/users/me/guarantee), the garage (/vendors/me/guarantee, owner seat) and
 * admin (/admin/guarantee, super-admin). Every route but the two /config
 * ones is a 404 while GUARANTEE_ENABLED is off, so the apps read the config
 * first and show nothing while it is off.
 */

export interface GuaranteeConfig {
  enabled: boolean
  claimWindowHours: number
  minPhotos: number
  maxPhotos: number
  garageReviewHours: number
  detlioDecideHours: number
  redoWithinDays: number
  issues: Array<{ key: GuaranteeIssue; label: string }>
}

/** GET /guarantee/config — public. */
export function getGuaranteeConfig() {
  return apiClient<GuaranteeConfig>('/guarantee/config', { auth: false })
}

/** GET /admin/guarantee/config */
export function getAdminGuaranteeConfig() {
  return apiClient<GuaranteeConfig>('/admin/guarantee/config')
}

// ─── The customer ────────────────────────────────────────────────────────────

export interface ClaimPhoto {
  id: string
  url: string
  createdAt: string
}

/** A claim as its customer sees it: never the garage's note or Detlio's internal one. */
export interface CustomerClaim {
  id: string
  bookingId: string
  status: ClaimStatus
  title: string
  body: string | null
  issues: GuaranteeIssue[]
  otherText: string | null
  photos: ClaimPhoto[]
  createdAt: string
  garageRespondBy: string | null
  redoBookBy: string | null
  redoBooking: { id: string; scheduledAt: string; status: string } | null
  canBookRedo: boolean
  /** Why it was not approved; only then. */
  reason: string | null
}

export interface BookingGuarantee {
  /** Whether the "Not happy?" button shows. */
  canClaim: boolean
  /** Until when, while it can. */
  claimBy: string | null
  claim: CustomerClaim | null
}

/** GET /users/me/guarantee/bookings/:bookingId */
export function getBookingGuarantee(bookingId: string) {
  return apiClient<BookingGuarantee>(`/users/me/guarantee/bookings/${bookingId}`)
}

type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * Uploads one photo of the problem: stripped of its metadata in the browser
 * first (prepareCarPhoto → stripImageMetadata, like every image upload), presigned into the
 * job's claim folder, PUT straight to storage. Returns the key the claim
 * names it by, and a local preview URL is the caller's.
 */
export async function uploadClaimPhoto(bookingId: string, file: Blob): Promise<{ key: string; url: string }> {
  // A JPEG, PNG or WebP without its metadata; an iPhone's HEIC re-encoded
  // as a JPEG (the same as the customer's car photos, 0045).
  const clean = await prepareCarPhoto(file)
  const contentType = clean.type as UploadContentType
  const { uploadUrl, key, publicUrl } = await apiClient<{ uploadUrl: string; key: string; publicUrl: string }>(
    `/users/me/guarantee/bookings/${bookingId}/photos/upload-url`,
    { method: 'POST', body: JSON.stringify({ contentType }) }
  )
  const put = await fetch(uploadUrl, { method: 'PUT', body: clean, headers: { 'Content-Type': contentType } })
  if (!put.ok) throw new Error('Upload failed. Please try again.')
  return { key, url: publicUrl }
}

export interface CreateClaimInput {
  bookingId: string
  issues: GuaranteeIssue[]
  otherText?: string
  photoKeys: string[]
}

/** POST /users/me/guarantee/claims */
export function createClaim(input: CreateClaimInput) {
  return apiClient<CustomerClaim>('/users/me/guarantee/claims', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface RedoSlots {
  date: string
  isClosed: boolean
  paused: boolean
  slots: ReturnType<typeof mapSlots>
  /** The last moment the redo can be. */
  bookBy: string
  /** The IST days on offer, today first. */
  days: string[]
}

/** GET /users/me/guarantee/claims/:id/slots?date= */
export async function getRedoSlots(claimId: string, date: string): Promise<RedoSlots> {
  const data = await apiClient<{
    date: string
    isClosed: boolean
    paused: boolean
    slots: string[]
    bookBy: string
    days: string[]
  }>(`/users/me/guarantee/claims/${claimId}/slots`, { params: { date } })
  return { ...data, slots: mapSlots(data.slots) }
}

/** POST /users/me/guarantee/claims/:id/redo — books the free redo at that time. */
export function bookRedo(claimId: string, scheduledAt: string) {
  return apiClient<{ bookingId: string; claim: CustomerClaim }>(`/users/me/guarantee/claims/${claimId}/redo`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  })
}

// ─── The garage ──────────────────────────────────────────────────────────────

export interface GarageClaim {
  id: string
  bookingId: string
  bookingRef: string
  status: ClaimStatus
  route: 'garage' | 'detlio' | 'auto'
  issues: Array<{ key: GuaranteeIssue; label: string }>
  otherText: string | null
  customerFirstName: string
  service: string
  scheduledAt: string | null
  completedAt: string | null
  customerPhotos: ClaimPhoto[]
  garagePhotos: JobPhoto[]
  createdAt: string
  garageRespondBy: string | null
  canAnswer: boolean
  canDispute: boolean
  garageResponse: 'accepted' | 'disputed' | 'timed_out' | null
  garageNote: string | null
  decision: 'redo' | 'refund' | 'reject' | null
  decisionReason: string | null
  redoBookBy: string | null
  redoBooking: { id: string; scheduledAt: string; status: string } | null
  closeReason: string | null
}

/** GET /vendors/me/guarantee/claims?scope= */
export function getGarageClaims(scope: 'open' | 'closed') {
  return apiClient<{ items: GarageClaim[]; reviewHours: number }>('/vendors/me/guarantee/claims', {
    params: { scope },
  })
}

/** POST /vendors/me/guarantee/claims/:id/accept */
export function acceptClaim(claimId: string) {
  return apiClient<GarageClaim>(`/vendors/me/guarantee/claims/${claimId}/accept`, { method: 'POST' })
}

/** POST /vendors/me/guarantee/claims/:id/dispute */
export function disputeClaim(claimId: string, note: string) {
  return apiClient<GarageClaim>(`/vendors/me/guarantee/claims/${claimId}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type AdminClaimTab = 'needs_decision' | 'open' | 'closed'

export interface AdminClaim {
  id: string
  bookingId: string
  bookingRef: string
  vendorId: string
  garageName: string
  customer: { name: string; phone: string }
  status: ClaimStatus
  closed: boolean
  route: 'garage' | 'detlio' | 'auto'
  routeReasons: Array<{ key: string; label: string }>
  issues: Array<{ key: GuaranteeIssue; label: string }>
  otherText: string | null
  createdAt: string
  garageRespondBy: string | null
  detlioDecideBy: string | null
  overdue: boolean
  garageResponse: 'accepted' | 'disputed' | 'timed_out' | null
  garageNote: string | null
  garageRespondedAt: string | null
  decision: 'redo' | 'refund' | 'reject' | null
  decidedBy: string | null
  decidedAt: string | null
  decisionReason: string | null
  adminNote: string | null
  approvedAt: string | null
  redoBookBy: string | null
  redoBookingId: string | null
  closedAt: string | null
  closeReason: string | null
  /** Admin only: never shown to the customer. */
  customerFigures: {
    completedBookings: number
    claims: number
    approvedLast6Months: number
    waiting: number
    claimsLeft: number
    claimRate: number | null
    firstBooking: boolean
    claimsOften: boolean
  }
}

export interface AdminClaimDetail extends AdminClaim {
  customerPhotos: ClaimPhoto[]
  garagePhotos: JobPhoto[]
  booking: {
    id: string
    service: string
    bookingType: string
    scheduledAt: string
    completedAt: string | null
    car: string | null
    paid: string | null
    photosWaived: boolean
    refundApprovedAt: string | null
  } | null
  redoBooking: { id: string; scheduledAt: string; status: string } | null
  otherClaims: Array<{ id: string; bookingId: string; status: ClaimStatus; garageName: string; createdAt: string; approved: boolean }>
  allowed: { redo: boolean; refund: boolean; reject: boolean }
}

/** GET /admin/guarantee/claims?tab= */
export function getAdminClaims(tab: AdminClaimTab) {
  return apiClient<{ items: AdminClaim[]; counts: Record<AdminClaimTab, number> }>('/admin/guarantee/claims', {
    params: { tab },
  })
}

/** GET /admin/guarantee/claims/:id */
export function getAdminClaim(id: string) {
  return apiClient<AdminClaimDetail>(`/admin/guarantee/claims/${id}`)
}

export interface DecideClaimInput {
  decision: 'redo' | 'refund' | 'reject'
  actorName: string
  reason?: string
  note?: string
}

/** POST /admin/guarantee/claims/:id/decide */
export function decideClaim(id: string, input: DecideClaimInput) {
  return apiClient<AdminClaimDetail>(`/admin/guarantee/claims/${id}/decide`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
