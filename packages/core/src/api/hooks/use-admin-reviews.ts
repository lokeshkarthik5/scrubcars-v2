'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminGarageReviews, hideAdminReview, showAdminReview } from '@repo/core/api/admin-reviews'

/** One garage's reviews in admin (0065). */
export const adminReviewKeys = {
  all: ['admin-reviews'] as const,
  garage: (vendorId: string) => [...adminReviewKeys.all, 'garage', vendorId] as const,
}

export function useAdminGarageReviews(vendorId: string, enabled = true) {
  return useQuery({
    queryKey: adminReviewKeys.garage(vendorId),
    queryFn: () => getAdminGarageReviews(vendorId),
    enabled: Boolean(vendorId) && enabled,
  })
}

/** Hide… and Show again: either way the garage's list and score are read again. */
export function useHideReview(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason: string }) => hideAdminReview(reviewId, reason),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminReviewKeys.garage(vendorId) }),
  })
}

export function useShowReview(vendorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: string) => showAdminReview(reviewId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminReviewKeys.garage(vendorId) }),
  })
}
