import type { AdminReview } from '@repo/core/api/admin-reviews'

/**
 * Whether a review counts, as the garage's Reviews tab says it (0065): a
 * Test booking's never does, a hidden one is out until shown again.
 */
export function reviewCountsLabel(
  review: Pick<AdminReview, 'counts' | 'test' | 'hidden'>
): string {
  if (review.test) return 'Test: never counts'
  if (review.hidden) return 'Hidden'
  return review.counts ? 'Counts' : 'Does not count'
}
