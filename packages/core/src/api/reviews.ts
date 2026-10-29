import { apiClient } from './client'
import { mapReview } from './mappers'
import type { ApiPublicReview, ApiReview, ApiReviewSummary } from './types'
import type { Review } from '@repo/core/types'

export interface SubmitReviewPayload {
  bookingId: string
  rating: number
  comment?: string
}

/** GET /reviews/vendors/:vendorId */
export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  const reviews = await apiClient<ApiPublicReview[]>(`/reviews/vendors/${vendorId}`, {
    auth: false,
  })
  return reviews.map(mapReview)
}

/** GET /reviews/me */
export async function getMyReviews(): Promise<Review[]> {
  const reviews = await apiClient<ApiReview[]>('/reviews/me')
  return reviews.map(mapReview)
}

/** POST /reviews */
export async function submitReview(
  payload: SubmitReviewPayload
): Promise<Review> {
  const review = await apiClient<ApiReview>('/reviews', {
    method: 'POST',
    body: JSON.stringify({
      bookingId: payload.bookingId,
      rating: payload.rating,
      comment: payload.comment,
    }),
  })
  return mapReview(review)
}

/**
 * GET /reviews/vendors/:vendorId/summary (0065): the garage's score as
 * customers see it (none for a new garage), its stars, tags and what it is
 * known for. Public.
 */
export async function getVendorReviewSummary(vendorId: string): Promise<ApiReviewSummary> {
  return apiClient<ApiReviewSummary>(`/reviews/vendors/${vendorId}/summary`, { auth: false })
}

/**
 * POST /reviews/:reviewId/report (0065): any signed-in account reports a
 * review to the team, once. 409 REVIEW_ALREADY_REPORTED, REVIEW_OWN.
 */
export async function reportReview(reviewId: string, reason: string): Promise<{ reported: true }> {
  return apiClient<{ reported: true }>(`/reviews/${reviewId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
