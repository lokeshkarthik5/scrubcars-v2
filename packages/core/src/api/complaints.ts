import { apiClient } from './client'
import type { ComplaintCategory, ComplaintStatus } from '@repo/core/complaints'

/**
 * The customer's own complaints. The server only ever reads and writes the
 * signed-in customer's, and only attaches a booking that is theirs.
 */

/** A complaint as its customer sees it: never the team's own note. */
export interface CustomerComplaint {
  id: string
  /** "C-000123". */
  number: string
  status: ComplaintStatus
  category: ComplaintCategory
  /** Their words, as recorded. */
  message: string
  bookingId: string | null
  /** The booking's 8-character reference, kept if the booking goes. */
  bookingRef: string | null
  garageName: string | null
  createdAt: string
  acknowledgedAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  /** What the team wrote back, once resolved or closed. */
  resolutionNote: string | null
}

export interface RaiseComplaintInput {
  category: ComplaintCategory
  message: string
  /** From a booking's Help sheet; left out on the Contact page. */
  bookingId?: string
}

/** POST /users/me/complaints */
export async function raiseComplaint(input: RaiseComplaintInput): Promise<CustomerComplaint> {
  return apiClient<CustomerComplaint>('/users/me/complaints', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** GET /users/me/complaints — newest first. */
export async function getMyComplaints(): Promise<CustomerComplaint[]> {
  return apiClient<CustomerComplaint[]>('/users/me/complaints')
}
