import type { GoogleRating } from '../ratings'
import { apiClient } from './client'
import { signedBody } from './admin-signer'
import type { NextFree } from '@repo/core/next-free'
import type { RepairQuoteState, RepairRequestState } from '@repo/core/repair-quotes'
import type { VehicleType } from '@repo/core/types'

/**
 * Repair & bodywork quotes (0076). The customer's own requests at
 * /users/me/repair-quotes; the garage's at /vendors/me/repair-quotes (the
 * garage the session resolved, X-Vendor-Id); admin's at /admin/repair-quotes.
 */

export interface RepairQuotesConfig {
  enabled: boolean
  /** Whether Detlio can write the brief (an AI key is set). */
  ai: boolean
  maxGarages: number
  answerHours: number
  openHours: number
  videoMinSecs: number
  videoMaxSecs: number
  videoMaxBytes: number
  maxPhotos: number
  maxFrames: number
}

export interface RepairBox {
  /** Which picture, counting from 0 in the order sent. */
  image: number
  x: number
  y: number
  w: number
  h: number
}

/** What Detlio wrote from the pictures, before the customer sends it. */
export interface RepairBrief {
  text: string
  area: string | null
  damage: string | null
  box: RepairBox | null
  unclear: boolean
  angleHint: string | null
}

export type BriefSource = 'ai' | 'ai_edited' | 'customer'

interface SentBrief {
  text: string
  area: string | null
  damage: string | null
  box: RepairBox | null
  source: BriefSource
}

interface RepairMedia {
  video: { url: string; secs: number | null } | null
  photos: Array<{ url: string; kind: 'photo' | 'frame' }>
}

export interface CustomerRepairQuote {
  id: string
  garage: {
    id: string
    name: string
    rating: number | null
    reviewCount: number
    isNew: boolean
    /**
     * Google's rating while it is the main one (Google rating for new
     * garages, 21 Nov 2026): shown in place of Detlio's, named as Google's.
     * Absent from an older API.
     */
    google?: GoogleRating | null
  }
  distanceKm: number
  state: RepairQuoteState
  respondBy: string
  priceFrom: number | null
  priceTo: number | null
  days: number | null
  needsInspection: boolean | null
  note: string | null
  declineReason: string | null
  billsMatchQuotes: boolean
  bookingId: string | null
}

export interface CustomerRepairRequest extends RepairMedia {
  id: string
  state: RepairRequestState
  vehicle: { id: string | null; label: string; type: VehicleType }
  area: string | null
  title: string
  note: string
  brief: SentBrief
  createdAt: string
  closesAt: string
  /** The latest any garage still in time has to answer; null when none is waiting. */
  answerBy: string | null
  answerWindowMins: number
  sentTo: number
  quotes: CustomerRepairQuote[]
  bookingId: string | null
}

export interface CreateRepairRequestInput {
  vehicleId: string
  lat: number
  lng: number
  note: string
  brief: SentBrief
  video: { key: string; secs: number } | null
  photos: Array<{ key: string; kind: 'photo' | 'frame' }>
}

export interface GarageRepairQuote extends RepairMedia {
  id: string
  state: RepairQuoteState
  requestState: RepairRequestState
  title: string
  vehicle: { label: string; type: VehicleType }
  area: string | null
  distanceKm: number
  note: string
  brief: SentBrief
  createdAt: string
  respondBy: string
  answerWindowMins: number
  priceFrom: number | null
  priceTo: number | null
  days: number | null
  needsInspection: boolean | null
  answerNote: string | null
  declineReason: string | null
  answeredAt: string | null
  bookingId: string | null
}

export type RepairAnswer =
  | { canDo: true; priceFrom: number; priceTo: number; days: number; needsInspection: boolean; note?: string }
  | { canDo: false; reason?: string }

export type AdminRepairFilter = 'all' | 'open' | 'booked' | 'no_quote' | 'expired'

export interface AdminRepairRequest extends RepairMedia {
  id: string
  ref: string
  state: RepairRequestState
  filter: Exclude<AdminRepairFilter, 'all'> | null
  title: string
  vehicle: string
  area: string | null
  customer: { name: string | null; phone: string | null }
  brief: SentBrief
  note: string
  createdAt: string
  closesAt: string
  answerBy: string | null
  quotes: Array<{
    id: string
    garage: { id: string; name: string; phone: string | null }
    state: RepairQuoteState
    respondBy: string
    priceFrom: number | null
    priceTo: number | null
    days: number | null
    needsInspection: boolean | null
    declineReason: string | null
    bookingId: string | null
  }>
}

export interface AdminGarageRepairSetting {
  enabled: boolean
  /** It has a free "price on inspection" service, which a visit books. */
  bookable: boolean
  maxGarages: number
  asked: number
  answeredInTime: number
  billsInside: number
  billsTotal: number
  billsMatchQuotes: boolean
}

// ─── Public ──────────────────────────────────────────────────────────────────

export function getRepairQuotesConfig() {
  return apiClient<RepairQuotesConfig>('/repair-quotes/config', { auth: false })
}

// ─── The customer ────────────────────────────────────────────────────────────

/**
 * Uploads one video or picture straight to the private bucket on a link
 * whose size is signed (so the file must be exactly the size declared) and
 * returns its key. Pictures must already be re-encoded without their
 * metadata (prepareCarPhoto), a video already wiped of its place
 * (wipeVideoLocation).
 */
export async function uploadRepairMedia(kind: 'video' | 'photo', file: Blob): Promise<string> {
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string }>('/users/me/repair-quotes/upload-url', {
    method: 'POST',
    body: JSON.stringify({ kind, contentType: file.type, sizeBytes: file.size }),
  })
  const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
  if (!put.ok) throw new Error('Upload failed. Please try again.')
  return key
}

/** POST /users/me/repair-quotes/brief: the pictures (base64, no metadata) and the line, nothing else. */
export function writeRepairBrief(input: { note: string; images: Array<{ mimeType: string; dataBase64: string }> }) {
  return apiClient<RepairBrief>('/users/me/repair-quotes/brief', { method: 'POST', body: JSON.stringify(input) })
}

export function createRepairRequest(input: CreateRepairRequestInput) {
  return apiClient<CustomerRepairRequest>('/users/me/repair-quotes', { method: 'POST', body: JSON.stringify(input) })
}

export function listMyRepairRequests() {
  return apiClient<{ items: CustomerRepairRequest[] }>('/users/me/repair-quotes')
}

export function getMyRepairRequest(id: string) {
  return apiClient<CustomerRepairRequest>(`/users/me/repair-quotes/${id}`)
}

export function cancelMyRepairRequest(id: string) {
  return apiClient<CustomerRepairRequest>(`/users/me/repair-quotes/${id}/cancel`, { method: 'POST' })
}

export function getRepairVisitTimes(id: string, quoteId: string) {
  return apiClient<NextFree | null>(`/users/me/repair-quotes/${id}/quotes/${quoteId}/next-free`)
}

export function bookRepairVisit(id: string, quoteId: string, scheduledAt: string) {
  return apiClient<{ bookingId: string }>(`/users/me/repair-quotes/${id}/quotes/${quoteId}/book`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  })
}

// ─── The garage ──────────────────────────────────────────────────────────────

export function listGarageRepairQuotes(scope: 'open' | 'closed') {
  return apiClient<{ items: GarageRepairQuote[]; waiting: number }>('/vendors/me/repair-quotes', { params: { scope } })
}

export function getGarageRepairQuoteCount() {
  return apiClient<{ waiting: number }>('/vendors/me/repair-quotes/count')
}

export function answerRepairQuote(quoteId: string, answer: RepairAnswer) {
  return apiClient<GarageRepairQuote>(`/vendors/me/repair-quotes/${quoteId}/answer`, {
    method: 'POST',
    body: JSON.stringify(answer),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function listAdminRepairRequests(filter: AdminRepairFilter) {
  return apiClient<{ items: AdminRepairRequest[]; counts: Record<AdminRepairFilter, number>; days: number }>(
    '/admin/repair-quotes',
    { params: { filter } }
  )
}

export function getAdminGarageRepairSetting(vendorId: string) {
  return apiClient<AdminGarageRepairSetting>(`/admin/repair-quotes/vendors/${vendorId}`)
}

export function setAdminGarageRepairSetting(vendorId: string, enabled: boolean) {
  return apiClient<AdminGarageRepairSetting>(`/admin/repair-quotes/vendors/${vendorId}`, {
    method: 'PUT',
    body: signedBody({ enabled }),
  })
}
