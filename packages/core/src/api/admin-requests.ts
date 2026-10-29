import { apiClient } from '@repo/core/api/client'
import type { RequestMode, WindowPart } from '@repo/core/booking-requests'
import { signedBody } from './admin-signer'

/**
 * The admin Requests list (0064): customers' "Request a visit" / "Request a
 * pickup", one entry per request. Read-only but for Cancel. New with this
 * release: the panel reads a 404 from an older API as "not there yet".
 */

/** Open: waiting for a garage or for the customer; Accepted: a yes that ended (booked or lapsed); Failed: nobody accepted. */
export type AdminRequestFilter = 'open' | 'accepted' | 'failed' | 'all'

export type AdminRequestState =
  'waiting' | 'accepted' | 'no_garage' | 'lapsed' | 'cancelled' | 'booked'

export interface AdminRequest {
  /** The latest row's id: what Cancel acts on. */
  id: string
  rootId: string
  state: AdminRequestState
  filter: Exclude<AdminRequestFilter, 'all'> | null
  status: string
  bookingType: RequestMode
  /** Only the last four digits of the customer's phone. */
  customer: { id: string; name: string | null; phone: string }
  /** The garage asked now, with its business phone. */
  garage: { id: string; name: string; phone: string | null }
  chain: Array<{
    id: string
    garage: { id: string; name: string }
    status: string
    reply: 'accepted' | 'declined' | null
    repliedAt: string | null
  }>
  zone: { slug: string; name: string } | null
  items: Array<{ name: string; amount: string }>
  subtotal: string
  window: {
    date: string
    part: WindowPart
    label: string
    start: string
    end: string
  }
  createdAt: string
  sentAt: string
  respondBy: string
  travelFee: number | null
  acceptedStartAt: string | null
  confirmBy: string | null
  bookingId: string | null
  closedAt: string | null
  cancelledBy: 'customer' | 'detlio' | null
  cancelledByName: string | null
  cancelReason: string | null
}

export interface AdminRequestList {
  items: AdminRequest[]
  counts: Record<AdminRequestFilter, number>
  /** The zone the list is kept to, when one is. */
  zone: { slug: string; name: string } | null
  /** How many days back the list reaches (older open ones too). */
  days: number
}

/** GET /admin/requests */
export async function getAdminRequests(query: {
  filter: AdminRequestFilter
  zone?: string | null
}) {
  const params = new URLSearchParams({ filter: query.filter })
  if (query.zone) params.set('zone', query.zone)
  return apiClient<AdminRequestList>(`/admin/requests?${params.toString()}`)
}

/** POST /admin/requests/:id/cancel — 409 REQUEST_CHECKOUT_OPEN while the customer is paying, REQUEST_STATE_CHANGED once it is not open. */
export async function cancelAdminRequest(id: string, reason: string) {
  return apiClient<{ id: string; status: 'cancelled' }>(
    `/admin/requests/${id}/cancel`,
    { method: 'POST', body: signedBody({ reason }) }
  )
}
