'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { listMyCoupons } from '@repo/core/api/coupons'

export const couponKeys = {
  all: ['coupons'] as const,
  mine: ['coupons', 'mine'] as const,
}

/** The signed-in customer's coupons, newest first (Profile → Coupons, checkout's chips). */
export function useMyCoupons(enabled: boolean) {
  return useQuery({
    queryKey: couponKeys.mine,
    queryFn: async () => (await listMyCoupons()).coupons,
    enabled,
    staleTime: 30_000,
  })
}

/** After a coupon is added, or a booking used or gave back a voucher. */
export function invalidateCoupons(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: couponKeys.all })
}
