import { apiClient } from './client'

/**
 * "Close my garage" (0066): the garage's owner asks Detlio to close it, and
 * can take it back until the team acts (by moving the garage to the Bin).
 */
export interface ClosureRequest {
  id: string
  status: 'open' | 'cancelled' | 'confirmed'
  reason: string
  requestedByName: string
  createdAt: string
}

/** GET /vendors/me/closure — the open request, or null. Owner seat. */
export function getMyClosureRequest() {
  return apiClient<ClosureRequest | null>('/vendors/me/closure')
}

/** POST /vendors/me/closure — the garage's owner only. */
export function requestGarageClosure(reason: string) {
  return apiClient<ClosureRequest>('/vendors/me/closure', { method: 'POST', body: JSON.stringify({ reason }) })
}

/** POST /vendors/me/closure/cancel */
export function cancelGarageClosure() {
  return apiClient<ClosureRequest>('/vendors/me/closure/cancel', { method: 'POST' })
}

/** Admin: every open request, oldest first. */
export interface AdminClosureRequest extends ClosureRequest {
  vendorId: string
  garageName: string
}

/** GET /admin/garage-closures */
export function getOpenClosureRequests() {
  return apiClient<AdminClosureRequest[]>('/admin/garage-closures')
}

/** GET /admin/vendors/:id/closure-request — the garage's open request, or null. */
export function getGarageClosureRequest(vendorId: string) {
  return apiClient<ClosureRequest | null>(`/admin/vendors/${vendorId}/closure-request`)
}
