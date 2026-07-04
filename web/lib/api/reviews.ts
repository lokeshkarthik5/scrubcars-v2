import { apiClient } from './client'
import { mapReview } from './mappers'
import type { ApiReview } from './types'
import type { Review } from '@/lib/types'

export interface SubmitReviewPayload {
  bookingId: string
  rating: number
  comment?: string
}

/** GET /reviews/vendors/:vendorId */
export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  const reviews = await apiClient<ApiReview[]>(`/reviews/vendors/${vendorId}`, {
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
