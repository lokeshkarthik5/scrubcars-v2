'use client'

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  getOwnerCouponBatchUse,
  getOwnerDiscountUse,
  getZoneSignups,
  getZoneUse,
  ownerDeleteAdminLogin,
  ownerDeleteBypassReport,
  ownerDeleteChallenge,
  ownerDeleteComplaint,
  ownerDeleteCouponBatch,
  ownerDeleteCouponCode,
  ownerDeleteDiscount,
  ownerDeleteGift,
  ownerDeleteGuaranteeClaim,
  ownerDeleteJobPhoto,
  ownerDeleteNotice,
  ownerDeleteReview,
  ownerDeleteZone,
  ownerRemoveZoneSignup,
} from '@repo/core/api/admin-owner-delete'
import { adminBookingKeys } from './use-admin-bookings'
import { adminComplaintKeys } from './use-admin-complaints'
import { adminCouponKeys } from './use-admin-coupons'
import { coverageKeys } from './use-admin-coverage'
import { adminGiftKeys } from './use-admin-gifts'
import { adminLoginKeys } from './use-admin-logins'
import { adminReviewKeys } from './use-admin-reviews'
import { adminRewardExtrasKeys } from './use-admin-reward-extras'
import { adminBypassKeys } from './use-bypass-reports'
import { discountKeys } from './use-discounts'
import { guaranteeKeys } from './use-guarantee'
import { noticeKeys } from './use-notices'

/** The owner's deletes (10 Nov 2026): each reads its list again once it is done, worked or not. */
export const ownerDeleteKeys = {
  discountUse: (id: string) => ['owner-delete', 'discount', id] as const,
  couponBatchUse: (id: string) => ['owner-delete', 'coupon-batch', id] as const,
  zoneUse: (id: string) => ['owner-delete', 'zone', id] as const,
  zoneSignups: (id: string) => ['owner-delete', 'zone-signups', id] as const,
}

function useOwnerDelete<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, keys: QueryKey[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  })
}

export function useOwnerDeleteReview() {
  return useOwnerDelete((id: string) => ownerDeleteReview(id), [adminReviewKeys.all])
}

export function useOwnerDeleteComplaint() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteComplaint(id, confirmText),
    [adminComplaintKeys.all]
  )
}

export function useOwnerDeleteBypassReport() {
  return useOwnerDelete((id: string) => ownerDeleteBypassReport(id), [adminBypassKeys.all])
}

export function useOwnerDeleteGuaranteeClaim() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteGuaranteeClaim(id, confirmText),
    [guaranteeKeys.adminAll]
  )
}

/** What Delete anyway on a code leaves; read when its sheet opens. */
export function useOwnerDiscountUse(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ownerDeleteKeys.discountUse(id),
    queryFn: () => getOwnerDiscountUse(id),
    enabled: enabled && Boolean(id),
    staleTime: 0,
  })
}

export function useOwnerDeleteDiscount() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteDiscount(id, confirmText),
    [discountKeys.all]
  )
}

export function useOwnerCouponBatchUse(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ownerDeleteKeys.couponBatchUse(id),
    queryFn: () => getOwnerCouponBatchUse(id),
    enabled: enabled && Boolean(id),
    staleTime: 0,
  })
}

export function useOwnerDeleteCouponBatch() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteCouponBatch(id, confirmText),
    [adminCouponKeys.all]
  )
}

export function useOwnerDeleteCouponCode() {
  return useOwnerDelete(
    ({ batchId, code }: { batchId: string; code: string }) => ownerDeleteCouponCode(batchId, code),
    [adminCouponKeys.all]
  )
}

export function useOwnerDeleteNotice() {
  return useOwnerDelete((id: string) => ownerDeleteNotice(id), [noticeKeys.all])
}

export function useOwnerDeleteGift() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteGift(id, confirmText),
    [adminGiftKeys.all]
  )
}

export function useOwnerDeleteChallenge() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteChallenge(id, confirmText),
    [adminRewardExtrasKeys.challenges]
  )
}

/** A zone's free-wash list, for the zone drawer (the owner's). */
export function useZoneSignups(zoneId: string, enabled: boolean) {
  return useQuery({
    queryKey: ownerDeleteKeys.zoneSignups(zoneId),
    queryFn: () => getZoneSignups(zoneId),
    enabled: enabled && Boolean(zoneId),
  })
}

export function useOwnerRemoveZoneSignup(zoneId: string) {
  return useOwnerDelete((userId: string) => ownerRemoveZoneSignup(zoneId, userId), [
    ownerDeleteKeys.zoneSignups(zoneId),
    coverageKeys.all,
  ])
}

export function useZoneUse(zoneId: string, enabled: boolean) {
  return useQuery({
    queryKey: ownerDeleteKeys.zoneUse(zoneId),
    queryFn: () => getZoneUse(zoneId),
    enabled: enabled && Boolean(zoneId),
    staleTime: 0,
  })
}

export function useOwnerDeleteZone() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteZone(id, confirmText),
    [coverageKeys.all]
  )
}

export function useOwnerDeleteAdminLogin() {
  return useOwnerDelete(
    ({ id, confirmText }: { id: string; confirmText: string }) => ownerDeleteAdminLogin(id, confirmText),
    [adminLoginKeys.list]
  )
}

export function useOwnerDeleteJobPhoto() {
  return useOwnerDelete((id: string) => ownerDeleteJobPhoto(id), [adminBookingKeys.details()])
}
