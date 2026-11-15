import { apiClient } from '@repo/core/api/client'
import type {
  GaragePickupFee,
  PickupFeeLimitOverrides,
  PickupFeeLimits,
  PickupFeePlan,
  PickupFeeSettings,
  SuggestedFormula,
} from '@repo/core/pickup-fee-maths'
import { signedBody } from './admin-signer'

/**
 * The pickup fee (API 0079, apps/server/src/modules/pickup-fees), typed here
 * by hand from the server's shapes. Customers read Detlio's suggestion and
 * convenience fee (GET /pickup-fee) and each garage's `pickupFee` plan on its
 * card and page; the garage reads and sets its own; admin everything else.
 */

// ─── Customers ───────────────────────────────────────────────────────────────

export interface PickupFeeConfig {
  /** Detlio's suggested fee as a plan: what Ask for pickup suggests. */
  suggested: PickupFeePlan
  /** How far above the suggestion a garage may go, in %. */
  askRaisePct: number
  /** The highest-charge limit (the most anything may come to). */
  maxCharge: number
  /** Detlio's convenience fee per booking; 0 is off and shows nothing. */
  convenienceFee: number
}

/** GET /pickup-fee: public. */
export function getPickupFeeConfig(): Promise<PickupFeeConfig> {
  return apiClient<PickupFeeConfig>('/pickup-fee', { auth: false })
}

// ─── The garage's own ────────────────────────────────────────────────────────

interface FeeView {
  pickupOffered: boolean
  fee: GaragePickupFee
  /** What customers see now (Detlio's suggestion while waiting), held to the limits that apply. */
  livePlan: PickupFeePlan
  detlioPlan: PickupFeePlan
  waiting: { sentAt: string } | null
  /** "Who sets this garage's fee: Detlio": the garage's controls are greyed out. */
  locked: boolean
  /** Who set the stored fee (absent from an older API: the garage). */
  setBy?: 'garage' | 'detlio'
  /** Whether a fee above Detlio's suggestion waits for a check (absent from an older API: yes). */
  needsApproval?: boolean
  /** When the garage may change its fee again; null when it may now. */
  nextChangeAt: string | null
  suggested: SuggestedFormula
  /** The garage's own limits: its overrides over Detlio's defaults. */
  limits: PickupFeeLimits
}

export interface GaragePickupFeeView extends FeeView {
  /** Detlio's latest check of the garage's latest change. */
  decision: { status: 'approved' | 'kept'; at: string; reason: string | null } | null
}

export function getGaragePickupFee(): Promise<GaragePickupFeeView> {
  return apiClient<GaragePickupFeeView>('/vendors/me/pickup-fee')
}

export function setGaragePickupFee(fee: GaragePickupFee): Promise<GaragePickupFeeView> {
  return apiClient<GaragePickupFeeView>('/vendors/me/pickup-fee', { method: 'PUT', body: JSON.stringify(fee) })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type PickupFeeChangeStatus = 'live' | 'waiting' | 'approved' | 'kept' | 'replaced'

export interface PickupFeeChange {
  id: string
  kind: 'fee' | 'locked' | 'unlocked' | 'limits'
  byKind: 'garage' | 'detlio'
  byName: string
  before: GaragePickupFee
  after: GaragePickupFee
  /** A 'limits' row: admin's overrides for the garage before and after. */
  limits?: { before: PickupFeeLimitOverrides; after: PickupFeeLimitOverrides } | null
  status: PickupFeeChangeStatus
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  reason: string | null
}

export interface AdminGaragePickupFee extends FeeView {
  lockedBy: string | null
  waitingChangeId: string | null
  /** Detlio's defaults (Settings → Pickup fee) and this garage's overrides of them. */
  defaultLimits: PickupFeeLimits
  overrides: PickupFeeLimitOverrides
  changes: PickupFeeChange[]
}

export interface PickupFeeCheckItem extends PickupFeeChange {
  garage: { id: string; name: string }
  askedBy: { role: 'owner' | 'team'; phone: string | null }
  pickupsLast30Days: number
}

export interface PickupFeeCheckList {
  counts: { waiting: number; approved: number; kept: number }
  suggested: SuggestedFormula
  items: PickupFeeCheckItem[]
}

export function getAdminPickupFeeSettings(): Promise<PickupFeeSettings> {
  return apiClient<PickupFeeSettings>('/admin/pickup-fees/settings')
}

export function saveAdminPickupFeeSettings(settings: PickupFeeSettings): Promise<PickupFeeSettings> {
  return apiClient<PickupFeeSettings>('/admin/pickup-fees/settings', { method: 'PUT', body: signedBody(settings) })
}

export function getAdminGaragePickupFee(vendorId: string): Promise<AdminGaragePickupFee> {
  return apiClient<AdminGaragePickupFee>(`/admin/pickup-fees/vendors/${vendorId}`)
}

export function setAdminGaragePickupFee(vendorId: string, fee: GaragePickupFee): Promise<AdminGaragePickupFee> {
  return apiClient<AdminGaragePickupFee>(`/admin/pickup-fees/vendors/${vendorId}`, {
    method: 'PUT',
    body: signedBody({ fee }),
  })
}

export function setAdminGaragePickupFeeLock(vendorId: string, locked: boolean): Promise<AdminGaragePickupFee> {
  return apiClient<AdminGaragePickupFee>(`/admin/pickup-fees/vendors/${vendorId}/lock`, {
    method: 'POST',
    body: signedBody({ locked }),
  })
}

export function setAdminGaragePickupFeeLimits(
  vendorId: string,
  limits: PickupFeeLimitOverrides
): Promise<AdminGaragePickupFee> {
  return apiClient<AdminGaragePickupFee>(`/admin/pickup-fees/vendors/${vendorId}/limits`, {
    method: 'PUT',
    body: signedBody({ limits }),
  })
}

export function listPickupFeeChecks(show: 'waiting' | 'approved' | 'kept'): Promise<PickupFeeCheckList> {
  return apiClient<PickupFeeCheckList>('/admin/pickup-fees', { params: { show } })
}

export function decidePickupFee(
  changeId: string,
  input: { decision: 'approved' | 'kept'; reason?: string }
): Promise<PickupFeeChange> {
  return apiClient<PickupFeeChange>(`/admin/pickup-fees/changes/${changeId}/decide`, {
    method: 'POST',
    body: signedBody(input),
  })
}
