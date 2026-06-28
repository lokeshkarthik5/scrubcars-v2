import { apiClient } from './client'
import { MOCK_REVIEWS } from '@/lib/mock/data'
import type { Review } from '@/lib/types'

export interface SubmitReviewPayload {
  bookingId: string
  rating: number
  comment: string
}

/** GET /vendors/:vendorId/reviews */
export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  // TODO: return apiClient<Review[]>(`/vendors/${vendorId}/reviews`)
  void vendorId
  return MOCK_REVIEWS
}

/** POST /bookings/:bookingId/review */
export async function submitReview(
  payload: SubmitReviewPayload
): Promise<Review> {
  // TODO: return apiClient<Review>(`/bookings/${payload.bookingId}/review`, { method: 'POST', body: JSON.stringify(payload) })
  return {
    id: `rev-${Date.now()}`,
    userName: 'You',
    rating: payload.rating,
    comment: payload.comment,
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  }
}
