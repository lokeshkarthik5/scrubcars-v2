import { apiClient } from '@repo/core/api/client'
import type { AgreementStatus } from '@repo/core/agreements'
import type { Tier, TierStepAction } from '@repo/core/tiers'
import { signedBody } from './admin-signer'

/**
 * Bronze / Silver / Gold (API 0063, apps/server/src/modules/tiers). Typed
 * here by hand from the server's own shapes. Customers only ever see a
 * garage's `tier` (types.ts Vendor) and which tiers are shown (GET /tiers);
 * the garage reads its own progress; admin reads and switches everything.
 */

export type TierStepKey =
  | 'agreement'
  | 'documents'
  | 'rating'
  | 'completed'
  | 'response'
  | 'no_shows'
  | 'complaints'
  | 'photos'
  | 'bypass'
  | 'quality_check'

/** One step towards a tier: what it is, the garage's figure, the target, where to act. */
export interface TierStep {
  key: TierStepKey
  label: string
  met: boolean
  /** False when there was nothing to measure yet (it then passes). */
  measured: boolean
  value: string
  target: string
  action: TierStepAction
}

export interface AgreementStanding {
  status: AgreementStatus
  bronze: boolean
  latestVersion: number | null
  acceptedVersion: number | null
  /** While in the 30 days: the IST date key by which to accept. */
  acceptBy: string | null
}

export interface TierNext {
  tier: Tier
  steps: TierStep[]
  done: number
  total: number
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface TierConfig {
  shown: Record<Tier, boolean>
  /** Whether "Silver & above" is offered (Silver or Gold shown). */
  silverFilter: boolean
}

/** GET /tiers: public. */
export function getTierConfig(): Promise<TierConfig> {
  return apiClient<TierConfig>('/tiers', { auth: false })
}

// ─── The garage's own ────────────────────────────────────────────────────────

export interface GarageTier {
  tier: Tier | null
  /** "You're Bronze. Next: Silver, 3 of 5 done." */
  line: string
  next: TierNext | null
  /** What the tier held now asks for and is not met (absent from an older API). */
  keep?: TierStep[]
  /** A held tier falling short: the last IST day it is kept. */
  atRisk: { tier: Tier; keepsUntil: string } | null
  agreement: AgreementStanding
  documentsOn: boolean
  graceDays: number
}

export function getGarageTier(): Promise<GarageTier> {
  return apiClient<GarageTier>('/vendors/me/tier')
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface TierSettings {
  tiers: Array<{ tier: Tier; label: string; shown: boolean; updatedAt: string | null; updatedBy: string | null }>
  silverFilter: boolean
}

export function getTierSettings(): Promise<TierSettings> {
  return apiClient<TierSettings>('/admin/tiers/settings')
}

export function setTierSwitch(input: { tier: Tier; shown: boolean }): Promise<TierSettings> {
  return apiClient<TierSettings>('/admin/tiers/settings', { method: 'POST', body: signedBody(input) })
}

export interface AdminTier {
  garage: { id: string; businessName: string; inBin: boolean }
  tier: Tier | null
  line: string
  /** The medal customers see now. */
  shown: Tier | null
  hidden: boolean
  switches: Record<Tier, boolean>
  atRisk: { tier: Tier; keepsUntil: string } | null
  next: TierNext | null
  /** What the tier held now asks for and is not met (absent from an older API). */
  keep?: TierStep[]
  steps: Record<Tier, TierStep[]>
  silver: { since: string | null; lostAt: string | null; lastEvaluatedAt: string | null }
  agreement: AgreementStanding
  acceptances: Array<{ version: number; acceptedAt: string; acceptedBy: string }>
  /** Why the nightly run changes nothing now, or null. */
  runPaused: 'documents_off' | 'no_agreement' | null
}

export function getAdminTier(vendorId: string): Promise<AdminTier> {
  return apiClient<AdminTier>(`/admin/tiers/vendors/${vendorId}`)
}

export function setTierHidden(vendorId: string, hidden: boolean): Promise<AdminTier> {
  return apiClient<AdminTier>(`/admin/tiers/vendors/${vendorId}/hidden`, {
    method: 'POST',
    body: signedBody({ hidden }),
  })
}
