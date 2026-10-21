import { apiClient } from '@repo/core/api/client'

/**
 * Gift a wash (0049): Detlio gifts and Detlio credit. Behind GIFTS_ENABLED
 * on the API (default off): every call but the two `config` ones is a 404
 * while it is off, so the apps ask `getGiftsConfig` first and hide every
 * entry point when `enabled` is false.
 *
 * A gift code always travels in the request body, never an API URL.
 */

export type GiftDesign = 'shine' | 'midnight' | 'fresh'

/** What a gift is now. */
export type GiftState = 'pending' | 'available' | 'redeemed' | 'expired' | 'cancelled'

export interface GiftsConfig {
  enabled: boolean
  /** The three amounts offered as buttons, in rupees: 500, 1000, 2000. */
  presets: number[]
  /** A custom amount: whole rupees from `min` to `max` (300–5000). */
  min: number
  max: number
  /** The most one buyer can spend on gifts in a day, in rupees (10000). */
  dailyLimit: number
  /** Gift and credit last this many months from the gift's payment (12). */
  validMonths: number
  designs: GiftDesign[]
}

/** A gift the customer bought, as they see it. The code is never in it. */
export interface SentGift {
  id: string
  /** "G-000123": the purchase's reference, for support and the receipt line. */
  number: string
  /** Rupees, decimal string. */
  amount: string
  recipientName: string
  message: string | null
  design: GiftDesign
  state: GiftState
  paidAt: string | null
  expiresAt: string | null
  redeemedAt: string | null
  /** A link has been made at least once. */
  linkMade: boolean
  /** "Get the link" is possible now (paid, not redeemed, not expired). */
  canMakeLink: boolean
  /** The Razorpay payment id: evidence of the purchase. */
  paymentId: string | null
}

/** What the gift page shows to whoever holds the code. */
export interface PublicGift {
  amount: string
  recipientName: string
  message: string | null
  design: GiftDesign
  /** The buyer's first name only. */
  fromName: string
  state: Exclude<GiftState, 'pending'>
  expiresAt: string | null
  /** "ABCD-EFGH-JKMN-PQRS", for printing. */
  code: string
}

export interface GiftOrder {
  giftId: string
  orderId: string
  /** Paise. */
  amount: number
  currency: string
  keyId: string
}

export interface GiftLink {
  /** "ABCD-EFGH-JKMN-PQRS": shown once; a new link ends the old one. */
  code: string
  /** "/gift/ABCDEFGHJKMNPQRS": prefix with the site's origin to share. */
  path: string
}

export type CreditEntryKind = 'redeem' | 'debit' | 'refund' | 'expiry' | 'adjustment' | 'report_reward'

export interface CreditView {
  /** What can be spent now, rupees as a decimal string. */
  balance: string
  /** The credit that runs out first, and when (ISO). */
  nextExpiry: { amount: string; at: string } | null
  /** Credit that runs out within 30 days. */
  expiringSoon: string
  /** The latest rows, newest first. `amount` is signed: + in, − out. */
  entries: Array<{
    id: string
    kind: CreditEntryKind
    label: string
    amount: string
    at: string
    expiresAt: string | null
    bookingId: string | null
    /** Admin only: an adjustment's reason. */
    reason?: string | null
  }>
}

export interface RedeemResult {
  amount: string
  balance: string
  expiresAt: string | null
}

/** GET /gifts/config: always answers. */
export function getGiftsConfig() {
  return apiClient<GiftsConfig>('/gifts/config', { auth: false })
}

/** POST /gifts/lookup: the gift page. Signed in or not. */
export function lookupGift(code: string) {
  return apiClient<{ gift: PublicGift }>('/gifts/lookup', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

/** GET /users/me/credit */
export function getMyCredit() {
  return apiClient<CreditView>('/users/me/credit')
}

/** GET /users/me/gifts: the gifts the customer bought, newest first. */
export function listMyGifts() {
  return apiClient<{ gifts: SentGift[] }>('/users/me/gifts')
}

export function getMyGift(giftId: string) {
  return apiClient<{ gift: SentGift }>(`/users/me/gifts/${giftId}`)
}

export interface BuyGiftPayload {
  /** Whole rupees, 300–5000. */
  amount: number
  recipientName: string
  message?: string
  design: GiftDesign
}

/** POST /users/me/gifts: opens a Razorpay order for the gift. */
export function buyGift(payload: BuyGiftPayload) {
  return apiClient<GiftOrder>('/users/me/gifts', { method: 'POST', body: JSON.stringify(payload) })
}

/** POST /users/me/gifts/:id/verify: after the Razorpay sheet's success. */
export function verifyGiftPayment(
  giftId: string,
  payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
) {
  return apiClient<{ gift: SentGift }>(`/users/me/gifts/${giftId}/verify`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** POST /users/me/gifts/:id/link: a new code; the previous link stops working. */
export function makeGiftLink(giftId: string) {
  return apiClient<GiftLink>(`/users/me/gifts/${giftId}/link`, { method: 'POST' })
}

/** POST /users/me/gifts/redeem: the gift's value becomes the customer's credit. */
export function redeemGift(code: string) {
  return apiClient<RedeemResult>('/users/me/gifts/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminGiftsSummary {
  sold: { count: number; amount: string }
  redeemed: { count: number; amount: string }
  unredeemed: { count: number; amount: string }
  expiringSoon: { gifts: { count: number; amount: string }; credit: string; days: number }
  expired: { count: number; amount: string }
  cancelled: { count: number; amount: string }
  credit: {
    /** Credit customers can still spend. */
    balance: string
    expiringSoon: string
    customers: number
    /** Credit spent on bookings in all. */
    spent: string
    /** Credit given back from cancelled bookings in all. */
    returned: string
    expired: string
    /** Team adjustments, net. */
    adjusted: string
    /** Rewards for confirmed bypass reports (0052), Detlio's own money. Absent from older servers. */
    rewarded?: string
  }
  /** What Detlio still owes: unredeemed gifts plus credit balances. */
  liability: string
}

export interface AdminGift {
  id: string
  number: string
  amount: string
  state: GiftState
  design: GiftDesign
  recipientName: string
  buyer: { id: string; name: string; phone: string }
  redeemer: { id: string; name: string | null } | null
  createdAt: string
  paidAt: string | null
  expiresAt: string | null
  redeemedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelReason: string | null
  paymentId: string | null
  gatewayMode: 'live' | 'test' | 'fake' | null
}

export type AdminGiftFilter = 'all' | 'available' | 'redeemed' | 'expired' | 'cancelled'

export interface AdminCustomerCredit {
  customer: { id: string; name: string; phone: string }
  credit: CreditView
}

export interface AdminCreditBalance {
  userId: string
  name: string
  phone: string
  balance: string
  nextExpiry: string | null
}

export function getAdminGiftsConfig() {
  return apiClient<GiftsConfig>('/admin/gifts/config')
}

export function getAdminGiftsSummary() {
  return apiClient<AdminGiftsSummary>('/admin/gifts/summary')
}

export function listAdminGifts(status: AdminGiftFilter = 'all') {
  return apiClient<{ gifts: AdminGift[] }>(`/admin/gifts?status=${status}`)
}

export function cancelAdminGift(giftId: string, payload: { actorName: string; reason: string }) {
  return apiClient<{ gift: SentGift }>(`/admin/gifts/${giftId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listCreditBalances() {
  return apiClient<{ customers: AdminCreditBalance[] }>('/admin/gifts/credit/balances')
}

/** Finds a customer by their 10-digit phone (in the body, never the URL). */
export function findCustomerCredit(phone: string) {
  return apiClient<AdminCustomerCredit>('/admin/gifts/credit/find', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export function getCustomerCredit(userId: string) {
  return apiClient<AdminCustomerCredit>(`/admin/gifts/credit/customers/${userId}`)
}

/** A manual adjustment: signed rupees, why, and the name of who made it (audit log). */
export function adjustCustomerCredit(userId: string, payload: { amount: number; reason: string; actorName: string }) {
  return apiClient<AdminCustomerCredit>(`/admin/gifts/credit/customers/${userId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
