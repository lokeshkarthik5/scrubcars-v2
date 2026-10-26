import { apiClient } from '@repo/core/api/client'
import type { MarkKind, MarkStatus, MissingKey } from '@repo/core/onboarding-marks'
import { signedBody } from './admin-signer'

/**
 * Onboarding marks (0059): the team's notes on what to ask a garage's owner
 * for, To ask → Asked → Received. Super-admin only. The routes are new with
 * this release, so the panel treats a 404 as "not there yet".
 */

export interface OnboardingMark {
  id: string
  vendorId: string
  kind: MarkKind
  /** Never empty: its own label, or its missing key's (markLabel). */
  label: string
  note: string | null
  status: MarkStatus
  askedAt: string | null
  askedByName: string | null
  receivedAt: string | null
  createdByName: string
  createdAt: string
  updatedByName: string | null
  updatedAt: string
}

/** A garage's open marks on the Garages list (AdminVendor.openMarks). */
export type OnboardingMarkBrief = Pick<OnboardingMark, 'id' | 'kind' | 'label' | 'status' | 'askedAt'>

/**
 * A new mark. `label` is required for 'custom' (at most 60 characters) and
 * optional for a missing key. Status 'asked' stamps today. 409 MARK_EXISTS
 * when the garage already has an open mark of that missing key.
 */
export interface CreateMarkInput {
  kind: MarkKind
  label?: string
  note?: string | null
  status?: MarkStatus
}

/**
 * A change to a mark. Moving to 'asked' stamps asked_at and who; to
 * 'received' stamps received_at. A missing key's mark keeps its kind.
 */
export interface UpdateMarkInput {
  status?: MarkStatus
  note?: string | null
  label?: string
}

/**
 * "Mark these as Asked today", after Ask on WhatsApp: per garage, each
 * missing key's open mark moves to Asked (one is made, as Asked, where there
 * is none), and so do the marks named in `markIds`. At most 50 garages.
 */
export interface MarkAskedInput {
  garages: Array<{ vendorId: string; kinds: MissingKey[]; markIds?: string[] }>
}

const marksBase = (vendorId: string) => `/admin/vendors/${vendorId}/marks`

/** GET /admin/vendors/:id/marks — every mark, open ones first, newest first. */
export async function listVendorMarks(vendorId: string) {
  return apiClient<OnboardingMark[]>(marksBase(vendorId))
}

/** POST /admin/vendors/:id/marks — 409 MARK_EXISTS for a second open mark of a missing key. */
export async function createVendorMark(vendorId: string, input: CreateMarkInput) {
  return apiClient<OnboardingMark>(marksBase(vendorId), {
    method: 'POST',
    body: signedBody(input),
  })
}

/** PATCH /admin/vendors/:id/marks/:markId */
export async function updateVendorMark(vendorId: string, markId: string, input: UpdateMarkInput) {
  return apiClient<OnboardingMark>(`${marksBase(vendorId)}/${markId}`, {
    method: 'PATCH',
    body: signedBody(input),
  })
}

/** DELETE /admin/vendors/:id/marks/:markId */
export async function deleteVendorMark(vendorId: string, markId: string) {
  return apiClient<void>(`${marksBase(vendorId)}/${markId}`, {
    method: 'DELETE',
    body: signedBody({}),
  })
}

/** POST /admin/onboarding-marks/asked — the marks now Asked, made or moved. */
export async function markGaragesAsked(input: MarkAskedInput) {
  return apiClient<{ marks: OnboardingMark[] }>('/admin/onboarding-marks/asked', {
    method: 'POST',
    body: signedBody(input),
  })
}
