import { apiClient } from '@repo/core/api/client'
import type { ShineArea } from '@repo/core/shine-score'
import { signedBody } from './admin-signer'

/**
 * Shine Score (0078): the customer's scans, suggestions and a finished
 * booking's before and after (/users/me/shine), and admin's Shine checks
 * (/admin/shine-checks, super-admin). Every route but /shine/config is a 404
 * while SHINE_SCORE_ENABLED is off, so the apps read the config first and
 * show nothing while it is off.
 */

export interface ShineConfig {
  enabled: boolean
  scansPerDay: number
  keepDays: number
}

/** GET /shine/config — public. */
export function getShineConfig() {
  return apiClient<ShineConfig>('/shine/config', { auth: false })
}

export interface ShineStatus {
  scansLeft: number
  scansPerDay: number
}

export type ShineNeed = 'inside' | 'outside' | 'both' | 'none'

export interface ShineScan {
  id: string
  overall: number
  scores: Record<ShineArea, number>
  findings: Array<{ text: string; area: ShineArea }>
  summary: string
  suggestion: string
  need: ShineNeed
  scoredAt: string
}

export interface ShinePhotoUpload {
  area: ShineArea
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  dataBase64: string
}

/** GET /users/me/shine — free scans left today. */
export function getShineStatus() {
  return apiClient<ShineStatus>('/users/me/shine')
}

/** POST /users/me/shine/scans — the four photos (re-encoded on the device), scored. */
export function createShineScan(photos: ShinePhotoUpload[]) {
  return apiClient<{ scan: ShineScan; scansLeft: number; scansPerDay: number }>('/users/me/shine/scans', {
    method: 'POST',
    body: JSON.stringify({ photos }),
  })
}

/** GET /users/me/shine/scans/:id — one of the customer's own scans. */
export function getShineScan(scanId: string) {
  return apiClient<ShineScan>(`/users/me/shine/scans/${scanId}`)
}

export interface ShineSuggestion {
  vendorId: string
  vendorName: string
  rating: number | null
  reviewCount: number
  distanceKm: number | null
  service: {
    id: string
    name: string
    /** Rupees, "649.00": the flat price, or the cheapest car size. */
    fromPrice: string
    perVehicle: boolean
    durationMins: number | null
  }
}

/** GET /users/me/shine/suggestions — real services at nearby garages for the need. */
export function getShineSuggestions(need: ShineNeed, origin: { lat: number; lng: number } | null) {
  return apiClient<{ suggestions: ShineSuggestion[] }>('/users/me/shine/suggestions', {
    params: { need, ...(origin ? { lat: String(origin.lat), lng: String(origin.lng) } : {}) },
  })
}

export type BookingShine =
  | { state: 'none' }
  | { state: 'pending' }
  | {
      state: 'scored'
      before: number
      after: number
      areas: Array<{ area: ShineArea; before: number; after: number }>
      biggestChange: ShineArea | null
    }

/** GET /users/me/shine/bookings/:id — "Your Shine went 46 → 92", from the garage's photos. */
export function getBookingShine(bookingId: string) {
  return apiClient<BookingShine>(`/users/me/shine/bookings/${bookingId}`)
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type ShineCheckStatus = 'new' | 'looks_fine' | 'followed_up'

export interface ShineCheck {
  id: string
  status: ShineCheckStatus
  scoredAt: string
  beforeScore: number
  afterScore: number
  lowestArea: string | null
  findings: string[]
  garage: { id: string | null; name: string }
  booking: { id: string; reference: string; scheduledAt: string; markedTest: boolean }
  customer: { id: string; name: string | null; phone: string | null } | null
  photos: Array<{ id: string; url: string }>
  reviewedAt: string | null
  reviewedBy: string | null
}

export interface ShineCheckList {
  checks: ShineCheck[]
  counts: Record<ShineCheckStatus, number>
  rules: { lowAfterScore: number }
}

export function listShineChecks(show: ShineCheckStatus) {
  return apiClient<ShineCheckList>('/admin/shine-checks', { params: { show } })
}

export function reviewShineCheck(id: string, outcome: 'looks_fine' | 'followed_up') {
  return apiClient<{ id: string; status: ShineCheckStatus }>(`/admin/shine-checks/${id}/review`, {
    method: 'POST',
    body: signedBody({ outcome }),
  })
}
