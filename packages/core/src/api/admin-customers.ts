import { signedBody } from './admin-signer'
import { apiClient } from './client'

/**
 * The Customers page (owner, 10 Nov 2026): find a customer by phone or name,
 * see what they have with Detlio, and (the owner only) delete their account.
 */

export interface AdminCustomerRow {
  id: string
  name: string
  phone: string
  joinedAt: string
}

export interface AdminCustomer extends AdminCustomerRow {
  /** Every booking they ever made, cancelled ones included. */
  bookings: number
  /** Detlio credit they can still spend, in rupees ("200.00"). */
  credit: string
  rewards: { stamps: number; vouchers: number }
}

/** What Delete customer account would do. */
export interface AdminCustomerDeletion {
  canDelete: boolean
  /** Owning a garage: still refused, even for the owner. */
  block: { code: string; message: string } | null
  /** Everything else open, and what the delete does with it. */
  warnings: Array<{ code: string; message: string }>
}

/** GET /admin/customers?q= — by phone (any part of it) or name; the newest without q. */
export function searchAdminCustomers(q: string) {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  return apiClient<{ customers: AdminCustomerRow[] }>(`/admin/customers${query}`)
}

/** GET /admin/customers/:id */
export function getAdminCustomer(id: string) {
  return apiClient<AdminCustomer>(`/admin/customers/${id}`)
}

/** GET /admin/customers/:id/deletion */
export function getAdminCustomerDeletion(id: string) {
  return apiClient<AdminCustomerDeletion>(`/admin/customers/${id}/deletion`)
}

/**
 * DELETE /admin/customers/:id — the owner only, with the customer's phone
 * typed. 409 VENDOR_OWNER_ACCOUNT for a garage owner.
 */
export function deleteAdminCustomer(id: string, confirmText: string) {
  return apiClient<{ id: string; deleted: true; endedBookings: number }>(`/admin/customers/${id}`, {
    method: 'DELETE',
    body: signedBody({ confirmText }),
  })
}
