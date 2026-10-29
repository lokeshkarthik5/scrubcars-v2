import { apiClient } from '@repo/core/api/client'
import { AGREEMENT_CONTENT_TYPE } from '@repo/core/agreements'
import { signedBody } from './admin-signer'
import type { AgreementStanding } from './tiers'

/**
 * The Detlio garage agreement, click to agree (API 0063,
 * apps/server/src/modules/agreements). The garage's owner seat reads the
 * latest version and accepts it; admin uploads each version as a PDF.
 */

export interface AgreementVersion {
  id: string
  version: number
  /** "Detlio garage agreement v2". */
  title: string
  /** The PDF, in the public bucket. */
  url: string
  sizeBytes: number
  note: string | null
  publishedAt: string
}

// ─── The garage's own ────────────────────────────────────────────────────────

export interface GarageAgreement {
  latest: AgreementVersion | null
  standing: AgreementStanding
  /** When the latest version was accepted, and by whom; null while not. */
  accepted: { at: string; by: string } | null
}

export function getGarageAgreement(): Promise<GarageAgreement> {
  return apiClient<GarageAgreement>('/vendors/me/agreement')
}

/** The owner ticked "I agree to the terms" on `version` and pressed Confirm. */
export function acceptAgreement(version: number): Promise<GarageAgreement> {
  return apiClient<GarageAgreement>('/vendors/me/agreement/accept', {
    method: 'POST',
    body: JSON.stringify({ version, agreed: true }),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminAgreements {
  storageReady: boolean
  maxBytes: number
  versions: Array<AgreementVersion & { publishedBy: string; acceptances: number; sha256: string }>
}

export function getAdminAgreements(): Promise<AdminAgreements> {
  return apiClient<AdminAgreements>('/admin/agreements')
}

/**
 * Uploads a PDF and publishes it as the next version: a link for its exact
 * size, PUT straight to the bucket, then publish by key (the server checks it
 * is there and is a PDF).
 */
export async function publishAgreement(file: File, note: string | null): Promise<AgreementVersion> {
  const { uploadUrl, key } = await apiClient<{ uploadUrl: string; key: string; version: number }>(
    '/admin/agreements/upload-url',
    { method: 'POST', body: JSON.stringify({ contentType: AGREEMENT_CONTENT_TYPE, sizeBytes: file.size }) }
  )
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': AGREEMENT_CONTENT_TYPE },
  })
  if (!put.ok) throw new Error('Upload failed. Please try again.')
  return apiClient<AgreementVersion>('/admin/agreements', {
    method: 'POST',
    body: signedBody({ key, note }),
  })
}
