import { apiClient } from '@repo/core/api/client';
import { getVendorReviewSummary } from '@repo/core/api/reviews';
import type { ApiPublicReview } from '@repo/core/api/types';

import {
  fromGarageList,
  fromPublicList,
  type GarageReviewsApi,
  type ReviewReply,
  type ReviewsData,
} from './reviews-view';

/**
 * The garage's own side of the reviews API (apps/server/src/modules/reviews/reviews.routes.ts,
 * garageReviewRoutes), which packages/core has no client for. The owner seat reads its list
 * with reply and report state; an operator, whom those routes refuse, reads the public feed
 * the web page reads, with nothing to act on.
 */

/** GET /vendors/me/reviews: the owner seat's counted reviews and the score. */
export async function getOwnerReviews(): Promise<ReviewsData> {
  return fromGarageList(await apiClient<GarageReviewsApi>('/vendors/me/reviews'));
}

/** GET /reviews/vendors/:id, and its summary for the tags: what an operator reads. */
export async function getPublicReviews(vendorId: string): Promise<ReviewsData> {
  const [list, summary] = await Promise.all([
    apiClient<ApiPublicReview[]>(`/reviews/vendors/${vendorId}`, { auth: false }),
    // The tags are an extra: the list is what the screen is for.
    getVendorReviewSummary(vendorId).catch(() => null),
  ]);
  return fromPublicList(list, summary);
}

export const getReviewsFor = (vendorId: string, isOwner: boolean) =>
  isOwner ? getOwnerReviews() : getPublicReviews(vendorId);

/**
 * PUT /vendors/me/reviews/:id/reply: the garage's one public reply, 1 to 1000 characters.
 * Posted any time, changed for 24 hours from the first post. 409 REVIEW_HIDDEN, REPLY_LOCKED,
 * REVIEW_CHANGED; 403 REVIEWS_SUPPORT_SESSION.
 */
export async function replyToReview(reviewId: string, text: string): Promise<ReviewReply> {
  const data = await apiClient<{ reply: ReviewReply & { updatedAt?: string | null } }>(
    `/vendors/me/reviews/${reviewId}/reply`,
    { method: 'PUT', body: JSON.stringify({ text }) }
  );
  const { reply } = data;
  return { text: reply.text, repliedAt: reply.repliedAt, editableUntil: reply.editableUntil, editable: reply.editable };
}

/**
 * POST /vendors/me/reviews/:id/report: tells Detlio what is wrong with a review, once,
 * 3 to 500 characters. 409 REVIEW_ALREADY_REPORTED; 404 for a hidden review.
 */
export async function reportReviewAsGarage(reviewId: string, reason: string): Promise<{ reported: true }> {
  return apiClient<{ reported: true }>(`/vendors/me/reviews/${reviewId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
