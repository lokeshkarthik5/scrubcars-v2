import { signedBody } from './admin-signer'
import { apiClient } from './client'

/**
 * The owner deletes anything (owner, 10 Nov 2026): hard deletes beside the
 * soft actions the rest of the team has. Owner only on the API (403
 * ADMIN_OWNER_ONLY for anyone else); the panel shows the buttons only when
 * GET /admin/me says `canDeleteAnything`. A delete that touches money or a
 * customer sends the name or number typed to confirm (400
 * CONFIRM_TEXT_MISMATCH otherwise). A missing row is a 404.
 */

export interface OwnerDeleteResult {
  id: string
  deleted: true
}

function remove<T = OwnerDeleteResult>(path: string, body: object = {}) {
  return apiClient<T>(`/admin/owner-delete/${path}`, { method: 'DELETE', body: signedBody(body) })
}

/** A review, outright: the garage's rating moves at once. */
export function ownerDeleteReview(id: string) {
  return remove(`reviews/${id}`)
}

/** A complaint, outright, with its number typed ("C-000123"). Numbering carries on. */
export function ownerDeleteComplaint(id: string, confirmText: string) {
  return remove(`complaints/${id}`, { confirmText })
}

/** A "book directly" report, outright. A reward it paid stays the customer's. */
export function ownerDeleteBypassReport(id: string) {
  return remove(`bypass-reports/${id}`)
}

/** A redo claim, with its booking's reference typed. 409 GUARANTEE_REDO_EXISTS while its redo booking is there. */
export function ownerDeleteGuaranteeClaim(id: string, confirmText: string) {
  return remove(`guarantee-claims/${id}`, { confirmText })
}

/** What "Delete anyway" on a promo code leaves: the bookings it was used on. */
export function getOwnerDiscountUse(id: string) {
  return apiClient<{ id: string; code: string; redemptions: number }>(`/admin/owner-delete/discounts/${id}`)
}

/** A promo code even once used, with the code typed. Bookings keep their amounts. */
export function ownerDeleteDiscount(id: string, confirmText: string) {
  return remove<OwnerDeleteResult & { code: string; redemptions: number }>(`discounts/${id}`, { confirmText })
}

/** How many printed codes of a batch were redeemed. */
export function getOwnerCouponBatchUse(id: string) {
  return apiClient<{ id: string; name: string; redemptions: number }>(`/admin/owner-delete/coupon-batches/${id}`)
}

/** A printed coupon batch with its codes, with the batch name typed. */
export function ownerDeleteCouponBatch(id: string, confirmText: string) {
  return remove(`coupon-batches/${id}`, { confirmText })
}

/**
 * One printed code of a batch, typed in full as for Void (only its hash is
 * stored). 400 COUPON_CODE_TYPO, 404 COUPON_CODE_NOT_IN_BATCH.
 */
export function ownerDeleteCouponCode(batchId: string, code: string) {
  return remove<OwnerDeleteResult & { suffix: string }>(`coupon-batches/${batchId}/codes`, { code })
}

/** A notice, outright. */
export function ownerDeleteNotice(id: string) {
  return remove(`notices/${id}`)
}

/** A gift nobody has redeemed, with its number typed ("G-000123"). 409 GIFT_REDEEMED. */
export function ownerDeleteGift(id: string, confirmText: string) {
  return remove(`gifts/${id}`, { confirmText })
}

/** A reward challenge, with its title typed. */
export function ownerDeleteChallenge(id: string, confirmText: string) {
  return remove(`reward-challenges/${id}`, { confirmText })
}

/** A customer on a zone's free-wash list, as the zone drawer lists them. */
export interface ZoneSignupRow {
  userId: string
  name: string
  /** The last four digits only ("••••3210"); null for a deleted account. */
  phone: string | null
  position: number
  freeWash: boolean
  createdAt: string
}

/** GET /admin/owner-delete/zones/:id/signups — a zone's list, for removing one. */
export function getZoneSignups(zoneId: string) {
  return apiClient<{ zone: { id: string; name: string }; signups: ZoneSignupRow[] }>(
    `/admin/owner-delete/zones/${zoneId}/signups`
  )
}

/** Removes one customer from a zone's list, with a free wash it held. */
export function ownerRemoveZoneSignup(zoneId: string, userId: string) {
  return remove<{ zoneId: string; userId: string; removed: true }>(`zones/${zoneId}/signups/${userId}`)
}

/** A team login, with its username typed. Never your own, never the owner's. */
export function ownerDeleteAdminLogin(id: string, confirmText: string) {
  return remove<OwnerDeleteResult & { username: string }>(`admin-logins/${id}`, { confirmText })
}

/** One job photo of a booking. */
export function ownerDeleteJobPhoto(id: string) {
  return remove<OwnerDeleteResult & { bookingId: string }>(`job-photos/${id}`)
}

/** What a zone in use holds, for the owner's "Delete anyway" sheet. */
export interface ZoneUse {
  zone: { id: string; name: string }
  use: { leads: number; signups: number; requests: number; recommendations: number }
  /** What happens to each, a line each, zeros left out. */
  lines: string[]
}

/** GET /admin/coverage/zones/:id/use — owner only. */
export function getZoneUse(zoneId: string) {
  return apiClient<ZoneUse>(`/admin/coverage/zones/${zoneId}/use`)
}

/** DELETE /admin/coverage/zones/:id/anyway — the owner's Delete anyway, with the zone's name typed. */
export function ownerDeleteZone(zoneId: string, confirmText: string) {
  return apiClient<{ removed: true }>(`/admin/coverage/zones/${zoneId}/anyway`, {
    method: 'DELETE',
    body: signedBody({ confirmText }),
  })
}
