import { apiClient } from '@repo/core/api/client'
import type { QualityCheckKind, QualityCheckStatus } from '@repo/core/certification'

/**
 * Detlio Certified (0048): the garage's own standing (its portal, owner
 * seat) and admin's Certification tab (super-admin). Customers only ever see
 * `certified` on a garage (types.ts Vendor).
 */

export type CertificationRuleKey =
  | 'documents'
  | 'rating'
  | 'completed'
  | 'response'
  | 'complaints'
  | 'no_shows'
  | 'photos'

/** One standard, measured: what it is, the garage's figure, the target. */
export interface CertificationRule {
  key: CertificationRuleKey
  label: string
  met: boolean
  /** False when there was nothing to measure yet (it then passes). */
  measured: boolean
  value: string
  target: string
}

interface Lifecycle {
  certified: boolean
  certifiedAt: string | null
  /** While certified and falling short: since when, and the last IST day it keeps the seal. */
  atRisk: { since: string; keepsUntil: string } | null
  /** How the last certification ended, while not certified. */
  ended: { at: string; kind: 'revoked' | 'lapsed' } | null
}

// ─── The garage's own ────────────────────────────────────────────────────────

export interface GarageCertification extends Lifecycle {
  eligible: boolean
  rules: CertificationRule[]
  qualityCheck: { status: QualityCheckStatus; passedOn: string | null; validUntil: string | null }
  windowDays: number
  graceDays: number
}

export function getGarageCertification(): Promise<GarageCertification> {
  return apiClient<GarageCertification>('/vendors/me/certification')
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface QualityCheck {
  id: string
  /** IST date of the visit, YYYY-MM-DD. */
  checkedOn: string
  kind: QualityCheckKind
  kindLabel: string
  checkerName: string
  result: 'pass' | 'fail'
  notes: string | null
  recordedBy: string
  createdAt: string
}

export type CertifyBlockedBy = 'in_bin' | 'already_certified' | 'not_eligible' | 'no_passing_check'

export interface AdminCertification extends Lifecycle {
  garage: { id: string; businessName: string; inBin: boolean }
  certifiedBy: string | null
  revoked: { at: string; by: string | null; reason: string | null; kind: 'revoked' | 'lapsed' } | null
  /** Measured when asked, not the nightly snapshot. */
  eligibility: { eligible: boolean; rules: CertificationRule[]; measuredAt: string }
  lastEvaluatedAt: string | null
  qualityCheck: { valid: boolean; status: QualityCheckStatus; validUntil: string | null; latestId: string | null }
  checks: QualityCheck[]
  certifyBlockedBy: CertifyBlockedBy | null
  rules: { windowDays: number; graceDays: number; qualityCheckMonths: number }
}

export interface QualityCheckInput {
  checkedOn: string
  kind: QualityCheckKind
  checkerName: string
  result: 'pass' | 'fail'
  notes: string | null
  actorName: string
}

const adminBase = (vendorId: string) => `/admin/certification/vendors/${vendorId}`

export function getAdminCertification(vendorId: string): Promise<AdminCertification> {
  return apiClient<AdminCertification>(adminBase(vendorId))
}

export function recordQualityCheck(vendorId: string, input: QualityCheckInput): Promise<AdminCertification> {
  return apiClient<AdminCertification>(`${adminBase(vendorId)}/checks`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function certifyGarage(vendorId: string, actorName: string): Promise<AdminCertification> {
  return apiClient<AdminCertification>(`${adminBase(vendorId)}/certify`, {
    method: 'POST',
    body: JSON.stringify({ actorName }),
  })
}

export function revokeCertification(vendorId: string, input: { actorName: string; reason: string }): Promise<AdminCertification> {
  return apiClient<AdminCertification>(`${adminBase(vendorId)}/revoke`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
