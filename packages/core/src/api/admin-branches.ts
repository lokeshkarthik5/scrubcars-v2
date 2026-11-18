import { apiClient } from '@repo/core/api/client'
import type { UpdateVendorServiceInput } from './admin'
import { signedBody } from './admin-signer'

/**
 * Branches (0081): one business, several garages. The garage editor's
 * Branches card, Link an existing garage, Remove from group, and changing
 * services and prices at every branch at once. Admin only.
 */

/** A branch's state, in the editor's words: Live, Paused, Not live yet. */
export type BranchState = 'live' | 'paused' | 'not_live'

export interface AdminBranch {
  id: string
  businessName: string
  /** Its area ("Velachery"), or its name when it has none. */
  label: string
  address: string
  pincode: string
  state: BranchState
  /** The counted reviews' score, null for a new garage (under 3). */
  rating: number | null
  reviewCount: number
  /** The first garage of the group. */
  isMain: boolean
  /** The garage whose page this is. */
  isCurrent: boolean
  createdAt: string
}

export interface AdminBranches {
  /** Null for a garage in no group. */
  group: { id: string; name: string; count: number } | null
  branches: AdminBranch[]
}

/** GET /admin/vendors/:id/branches */
export async function getBranches(vendorId: string) {
  return apiClient<AdminBranches>(`/admin/vendors/${vendorId}/branches`)
}

/** POST /admin/vendors/:id/branches/link — the other garage joins this one's group. */
export async function linkBranch(vendorId: string, otherId: string) {
  return apiClient<AdminBranches>(`/admin/vendors/${vendorId}/branches/link`, {
    method: 'POST',
    body: signedBody({ vendorId: otherId }),
  })
}

/** POST /admin/vendors/:id/branches/remove — the garage leaves the group. */
export async function removeBranch(vendorId: string, otherId: string) {
  return apiClient<AdminBranches>(`/admin/vendors/${vendorId}/branches/remove`, {
    method: 'POST',
    body: signedBody({ vendorId: otherId }),
  })
}

/** What of a saved service changed: only these reach the other branches. */
export type BranchChangeField = 'name' | 'price' | 'duration' | 'description' | 'category' | 'commission'

/** A service as the editor's own save sends it, without its id. The hint is only ever this garage's. */
export type BranchServiceValues = Omit<UpdateVendorServiceInput, 'id'>

export type BranchServicesChange =
  | {
      kind: 'save'
      changed: Array<{ serviceId: string; fields: BranchChangeField[]; service: BranchServiceValues }>
      added: BranchServiceValues[]
    }
  | { kind: 'delete'; serviceId: string }

export interface BranchPriceView {
  pricingType: 'flat' | 'per_vehicle' | 'on_inspection'
  price: number | null
  priceHatchback: number | null
  priceSedan: number | null
  priceSuv: number | null
  approxPrice: number | null
  durationMins: number | null
}

export interface BranchPlanLine {
  vendorId: string
  branch: string
  action: 'update' | 'add' | 'delete' | 'skip'
  serviceIds: string[]
  before: BranchPriceView | null
  after: BranchPriceView | null
  wasDifferent: boolean
  hidden: boolean
}

export interface BranchPlanItem {
  kind: 'change' | 'new' | 'delete'
  name: string
  previousName: string | null
  lines: BranchPlanLine[]
}

export interface BranchServicesPlan {
  branches: Array<{ id: string; label: string }>
  items: BranchPlanItem[]
  /** Sent back with the save: refused when the branches changed since. */
  key: string
}

/** POST /admin/vendors/:id/branches/services/preview — what "All N branches" would do. */
export async function previewBranchServices(vendorId: string, change: BranchServicesChange) {
  return apiClient<BranchServicesPlan>(`/admin/vendors/${vendorId}/branches/services/preview`, {
    method: 'POST',
    body: JSON.stringify({ change }),
  })
}

/** POST /admin/vendors/:id/branches/services — do it, at every branch, in one go. */
export async function applyBranchServices(vendorId: string, change: BranchServicesChange, key: string) {
  return apiClient<BranchServicesPlan>(`/admin/vendors/${vendorId}/branches/services`, {
    method: 'POST',
    body: signedBody({ change, key }),
  })
}
