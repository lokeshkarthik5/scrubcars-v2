import { apiClient } from './client'
import type { VendorRole } from './types'

export interface ApiMember {
  id: string
  userId: string
  name: string
  phone: string
  role: VendorRole
  status: 'active' | 'suspended'
  /** The one member nobody can remove, demote or suspend. */
  isOwner: boolean
  createdAt: string
}

/**
 * Every call here acts on the company in `X-Vendor-Id` — the client attaches it,
 * and the server refuses anything the caller has no active seat in. There is
 * deliberately no vendorId parameter to get wrong.
 */

/** GET /vendors/me/members */
export async function getMembers(): Promise<ApiMember[]> {
  return apiClient<ApiMember[]>('/vendors/me/members')
}

/** POST /vendors/me/members — by phone; no account needed yet. */
export async function addMember(input: {
  phone: string
  name?: string
  role: VendorRole
}): Promise<void> {
  await apiClient('/vendors/me/members', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** PATCH /vendors/me/members/:id */
export async function updateMember(
  membershipId: string,
  input: { role?: VendorRole; status?: 'active' | 'suspended' }
): Promise<void> {
  await apiClient(`/vendors/me/members/${membershipId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

/** DELETE /vendors/me/members/:id */
export async function removeMember(membershipId: string): Promise<void> {
  await apiClient(`/vendors/me/members/${membershipId}`, { method: 'DELETE' })
}

/** POST /vendors/me/members/transfer-ownership — owner only. */
export async function transferOwnership(userId: string): Promise<void> {
  await apiClient('/vendors/me/members/transfer-ownership', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}
