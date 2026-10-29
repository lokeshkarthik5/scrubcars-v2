import { signedBody } from './admin-signer'
import { apiClient } from './client'

/**
 * A garage's reviews in admin (0065, mockup frame F): every review, Test
 * bookings' and hidden ones included, each saying whether it counts.
 */
export interface AdminReviewTag {
  tag: string
  label: string
}

export interface AdminReview {
  id: string
  rating: number
  comment: string | null
  tags: AdminReviewTag[]
  createdAt: string
  reviewer: string | null
  booking: { id: string; reference: string; scheduledAt: string; serviceNames: string[] } | null
  /** Counts toward every score: not a Test booking's, not hidden. */
  counts: boolean
  /** A Test booking's: never counts. */
  test: boolean
  hidden: { at: string; by: string | null; reason: string | null } | null
  reply: { text: string; repliedAt: string; updatedAt: string | null; editableUntil: string; editable: boolean } | null
  reports: Array<{ id: string; reporter: 'customer' | 'garage'; reason: string; at: string }>
}

export interface AdminReviewSummary {
  /** Null for a new garage (fewer than 3 counted reviews). */
  rating: number | null
  reviewCount: number
  isNew: boolean
  tags: Array<{ tag: string; label: string; count: number; positive: boolean }>
  knownFor: AdminReviewTag | null
}

export interface AdminGarageReviews {
  summary: AdminReviewSummary
  reviews: AdminReview[]
}

/** GET /admin/vendors/:vendorId/reviews */
export async function getAdminGarageReviews(vendorId: string) {
  return apiClient<AdminGarageReviews>(`/admin/vendors/${vendorId}/reviews`)
}

/**
 * POST /admin/reviews/:id/hide — out of every score and list, kept in the
 * record with the reason; signed with the session. 409 REVIEW_ALREADY_HIDDEN,
 * VENDOR_IN_BIN.
 */
export async function hideAdminReview(reviewId: string, reason: string) {
  return apiClient<{ id: string; hidden: true }>(`/admin/reviews/${reviewId}/hide`, {
    method: 'POST',
    body: signedBody({ reason }),
  })
}

/** POST /admin/reviews/:id/show — Show again. 409 REVIEW_NOT_HIDDEN. */
export async function showAdminReview(reviewId: string) {
  return apiClient<{ id: string; hidden: false }>(`/admin/reviews/${reviewId}/show`, {
    method: 'POST',
    body: signedBody({}),
  })
}
