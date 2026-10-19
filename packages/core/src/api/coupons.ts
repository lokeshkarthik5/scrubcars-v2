import { apiClient } from '@repo/core/api/client'
import type { CouponKind, CouponReward, RedeemChannel } from '@repo/core/coupons'
import type { ServiceCategory } from '@repo/core/types'

/**
 * Printed coupons with QR codes (0056). A code always travels in a request
 * body, never an API URL. The words (`title`, `conditions`) come from the
 * server, generated from the batch's columns.
 */

interface OfferView {
  reward: CouponReward
  /** "₹100 off", "20% off, up to ₹200", "A free car wash, up to ₹299", "2 bonus Shine stamps". */
  title: string
  /** One condition a line. */
  conditions: string[]
  /** For the ticket's figure: ₹ off (or a free wash's ceiling), % off. */
  offAmount: number | null
  offPercent: number | null
  stamps: number | null
  validFrom: string
  validUntil: string
}

export type PublicCouponState = 'available' | 'added' | 'redeemed' | 'used_up' | 'expired' | 'not_started' | 'void'

/** What the /c/<code> page shows. Never the campaign's name or location. */
export interface PublicCoupon extends OfferView {
  /** "DTL-7K4QM-92MXA". */
  code: string
  newCustomersOnly: boolean
  state: PublicCouponState
}

/** A coupon the customer added. */
export interface MyCoupon extends OfferView {
  id: string
  kind: 'voucher' | 'stamps'
  /** The garage a voucher is limited to, if any. */
  vendorId: string | null
  /** Stamps are simply added; a voucher is ready, used (a live booking holds it), expired or cancelled. */
  state: 'added' | 'ready' | 'used' | 'expired' | 'cancelled'
  /** The voucher's own promo code, only while it is ready: applied at checkout like any code. */
  code: string | null
  expiresAt: string | null
  addedAt: string
}

/** POST /coupons/lookup: the coupon page. Signed in or not; each look is a scan. */
export function lookupCoupon(code: string) {
  return apiClient<{ coupon: PublicCoupon }>('/coupons/lookup', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

/** GET /users/me/coupons */
export function listMyCoupons() {
  return apiClient<{ coupons: MyCoupon[] }>('/users/me/coupons')
}

/** POST /users/me/coupons/redeem: adds the coupon to the signed-in customer. */
export function redeemCoupon(code: string, channel: RedeemChannel) {
  return apiClient<{ coupon: MyCoupon | null }>('/users/me/coupons/redeem', {
    method: 'POST',
    body: JSON.stringify({ code, channel }),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface CouponFigures {
  codes: number
  scannedCodes: number
  scans: number
  voidedCodes: number
  redeemed: number
  cancelled: number
  stampsGiven: number
  usedAtCheckout: number
  bookings: number
  revenue: string
  cost: string
  newCustomers: number
}

export interface AdminCouponBatch extends OfferView {
  id: string
  name: string
  location: string
  kind: CouponKind
  amountOff: string | null
  percentOff: string | null
  maxDiscount: string | null
  minOrder: string | null
  serviceCategory: ServiceCategory | null
  vendor: { id: string; name: string } | null
  newCustomersOnly: boolean
  /** IST dates, both included. */
  validFromDate: string
  validToDate: string
  codeCount: number
  maxRedemptions: number | null
  createdBy: string
  createdAt: string
  voided: { at: string; by: string | null; reason: string | null } | null
  /** False when the coupon secret changed since: the sheet can't be printed again. */
  canReprint: boolean
  figures: CouponFigures
}

export interface AdminCouponConfig {
  rewardsLive: boolean
  limits: {
    maxCodes: number
    maxSharedRedemptions: number
    maxAmount: number
    maxPercent: number
    maxStamps: number
    maxMinOrder: number
    maxValidDays: number
  }
  siteUrl: string
  ownSecret: boolean
}

export interface PrintedCode {
  seq: number
  code: string
  link: string
  scans: number
  state: 'new' | 'scanned' | 'redeemed' | 'void'
}

export interface CouponRedemption {
  id: string
  addedAt: string
  channel: RedeemChannel
  kind: 'voucher' | 'stamps'
  stamps: number | null
  codeSuffix: string
  /** Null once the account was deleted. The phone is masked. */
  customer: { id: string; name: string | null; phone: string | null } | null
  state: 'added' | 'ready' | 'used' | 'expired' | 'cancelled'
  cancelledBy: string | null
  /** The kept, paid booking that used the voucher, if any. */
  booking: { id: string; amount: string; discount: string; at: string } | null
}

export interface CreateCouponBatchPayload {
  name: string
  location: string
  kind: CouponKind
  count: number
  maxRedemptions: number | null
  reward: CouponReward
  amountOff: number | null
  percentOff: number | null
  maxDiscount: number | null
  stamps: number | null
  minOrder: number | null
  serviceCategory: ServiceCategory | null
  vendorId: string | null
  newCustomersOnly: boolean
  validFrom: string
  validTo: string
}

export function getAdminCouponConfig() {
  return apiClient<AdminCouponConfig>('/admin/coupons/config')
}

export function listCouponBatches() {
  return apiClient<{ batches: AdminCouponBatch[] }>('/admin/coupons/batches')
}

export function getCouponBatch(batchId: string) {
  return apiClient<{ batch: AdminCouponBatch; channels: Partial<Record<RedeemChannel, number>> }>(`/admin/coupons/batches/${batchId}`)
}

export function createCouponBatch(payload: CreateCouponBatchPayload) {
  return apiClient<{ batch: AdminCouponBatch }>('/admin/coupons/batches', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Every code of the batch, for the print sheet and the CSV. Never cached. */
export function listCouponCodes(batchId: string) {
  return apiClient<{ batch: AdminCouponBatch; codes: PrintedCode[] }>(`/admin/coupons/batches/${batchId}/codes`)
}

export function listCouponRedemptions(batchId: string) {
  return apiClient<{ redemptions: CouponRedemption[]; location: string }>(`/admin/coupons/batches/${batchId}/redemptions`)
}

export function voidCouponBatch(batchId: string, payload: { reason: string; cancelUnspent: boolean }) {
  return apiClient<{ batch: AdminCouponBatch; cancelledVouchers: number }>(`/admin/coupons/batches/${batchId}/void`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function voidCouponCode(batchId: string, payload: { code: string; reason: string }) {
  return apiClient<{ suffix: string; cancelledVouchers: number }>(`/admin/coupons/batches/${batchId}/codes/void`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
