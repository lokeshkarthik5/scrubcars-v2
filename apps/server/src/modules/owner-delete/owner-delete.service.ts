import { runInBackground } from '../../lib/background.js'
import { bookingReference } from '../../lib/booking-ops.js'
import { formatComplaintNumber } from '../../lib/complaints.js'
import { AppError } from '../../lib/errors.js'
import { removeJobPhotoObjects } from '../../lib/job-photo-storage.js'
import { logger } from '../../lib/logger.js'
import {
  adminLoginDeleteRefusal,
  claimDeleteRefusal,
  giftDeleteRefusal,
  maskedPhone,
  typedConfirmMatches,
  type OwnerDeleteRefusal,
} from '../../lib/owner-delete.js'
import { couponLookupHash } from '../coupons/coupons.service.js'
import { formatGiftNumber } from '../gifts/gifts.service.js'
import { ownerDeleteRepository } from './owner-delete.repository.js'

const log = logger.child({ module: 'owner-delete' })

/** Who is deleting: the session and the name it signs with. */
export interface OwnerActor {
  sub: string
  name: string
  /** The personal login's id, so no one deletes their own. */
  loginId: string | null
}

function notFound(what: string, code: string) {
  return new AppError(404, `${what} not found`, code)
}

function refused(refusal: OwnerDeleteRefusal) {
  return new AppError(refusal.status, refusal.message, refusal.code)
}

/** The typed name or number did not match: nothing was deleted. */
function wrongConfirm(expected: string) {
  return new AppError(400, `Type ${expected} exactly as shown to confirm.`, 'CONFIRM_TEXT_MISMATCH')
}

function confirmTyped(typed: string, expected: string) {
  if (!typedConfirmMatches(typed, expected)) throw wrongConfirm(expected)
}

/** Files of deleted photos, from storage after the commit, best effort. */
function removePhotoFiles(keys: string[], why: string) {
  if (keys.length === 0) return
  runInBackground(`owner_delete_${why}`, () => removeJobPhotoObjects(keys, why))
}

/**
 * The owner's hard deletes (10 Nov 2026), each beside the soft action the
 * rest of the team has. Each one: the row locked FOR UPDATE, 404 when it is
 * not there, its own refusals, then the delete and an admin_audit_log row,
 * in one transaction. Only reached behind requireOwner.
 */
export const ownerDeleteService = {
  /**
   * A review, outright (Hide keeps it in the record). The garage's rating is
   * worked out from the reviews on every read, so it moves at once; the
   * review's reports go with it.
   */
  async deleteReview(actor: OwnerActor, id: string) {
    const review = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockReview(id)
      if (!row) throw notFound('Review', 'REVIEW_NOT_FOUND')
      await repo.deleteReview(id)
      await repo.audit({
        action: 'review_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { reviewId: id, bookingId: row.bookingId, vendorId: row.vendorId, rating: row.rating },
        detail: { wasHidden: row.hiddenAt !== null },
      })
      return row
    })
    log.warn({ reviewId: id, vendorId: review.vendorId, by: actor.name }, 'owner_delete:review')
    return { id, deleted: true as const }
  },

  /**
   * A complaint, outright ("Logged in error" keeps it). Numbering carries
   * on from the last one: a complaint's number is a sequence, never reused.
   */
  async deleteComplaint(actor: OwnerActor, id: string, confirmText: string) {
    const complaint = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockComplaint(id)
      if (!row) throw notFound('Complaint', 'COMPLAINT_NOT_FOUND')
      confirmTyped(confirmText, formatComplaintNumber(row.number))
      await repo.deleteComplaint(id)
      await repo.audit({
        action: 'complaint_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { complaintId: id, number: formatComplaintNumber(row.number), status: row.status },
        // Ids only: the customer's words and phone are not copied here.
        detail: { source: row.source, bookingId: row.bookingId, bookingRef: row.bookingRef, vendorId: row.vendorId, userId: row.userId },
      })
      return row
    })
    log.warn({ complaintId: id, by: actor.name }, 'owner_delete:complaint')
    return { id, number: formatComplaintNumber(complaint.number), deleted: true as const }
  },

  /**
   * A "book directly" report, outright (Dismiss keeps it). A confirmed one
   * no longer counts as the garage's strike; a reward it paid stays in the
   * customer's credit.
   */
  async deleteBypassReport(actor: OwnerActor, id: string) {
    await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockBypassReport(id)
      if (!row) throw notFound('Report', 'BYPASS_REPORT_NOT_FOUND')
      await repo.deleteBypassReport(id)
      await repo.audit({
        action: 'bypass_report_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { reportId: id, bookingRef: row.bookingRef, vendorId: row.vendorId, status: row.status },
        detail: { rewardStatus: row.rewardStatus, rewardEntryId: row.rewardEntryId },
      })
    })
    log.warn({ reportId: id, by: actor.name }, 'owner_delete:bypass_report')
    return { id, deleted: true as const }
  },

  /**
   * A redo claim, only once its free redo booking is gone or never made
   * (409 GUARANTEE_REDO_EXISTS otherwise). Its photos go too.
   */
  async deleteClaim(actor: OwnerActor, id: string, confirmText: string) {
    const photoKeys = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockClaim(id)
      if (!row) throw notFound('Claim', 'GUARANTEE_CLAIM_NOT_FOUND')
      const refusal = claimDeleteRefusal(row)
      if (refusal) throw refused(refusal)
      confirmTyped(confirmText, bookingReference(row.bookingId))
      const keys = await repo.claimPhotoKeys(id)
      await repo.deleteClaim(id)
      await repo.audit({
        action: 'guarantee_claim_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { claimId: id, bookingId: row.bookingId, reference: bookingReference(row.bookingId), status: row.status },
        detail: { vendorId: row.vendorId, photos: keys.length },
      })
      return keys
    })
    removePhotoFiles(photoKeys, 'guarantee_claim')
    log.warn({ claimId: id, by: actor.name }, 'owner_delete:guarantee_claim')
    return { id, deleted: true as const }
  },

  /** What "Delete anyway" on a promo code would leave: the bookings it was used on. */
  async discountPreview(id: string) {
    const use = await ownerDeleteRepository.discountUse(id)
    if (!use || use.source === 'reward') throw notFound('Discount', 'DISCOUNT_NOT_FOUND')
    return { id, code: use.code, redemptions: use.redemptions }
  },

  /**
   * A promo code even once used (the team's Delete refuses then, 409
   * DISCOUNT_IN_USE). Its redemption rows go; bookings keep the amounts they
   * were charged and their discount figures. A customer's reward voucher is
   * the rewards' own, never deleted here (404, as the team's Delete).
   */
  async deleteDiscountAnyway(actor: OwnerActor, id: string, confirmText: string) {
    const result = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockDiscount(id)
      if (!row || row.source === 'reward') throw notFound('Discount', 'DISCOUNT_NOT_FOUND')
      const use = await repo.discountUse(id)
      if ((use?.vouchers ?? 0) > 0) throw notFound('Discount', 'DISCOUNT_NOT_FOUND')
      confirmTyped(confirmText, row.code)
      const bookingIds = await repo.deleteDiscountAnyway(id)
      await repo.audit({
        action: 'discount_deleted_in_use',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { discountId: id, code: row.code, source: row.source, redemptions: bookingIds.length },
        detail: { vendorId: row.vendorId, bookingIds },
      })
      return { code: row.code, redemptions: bookingIds.length }
    })
    log.warn({ discountId: id, redemptions: result.redemptions, by: actor.name }, 'owner_delete:discount')
    return { id, ...result, deleted: true as const }
  },

  /** What deleting a printed coupon batch takes: how many of its codes were redeemed. */
  async couponBatchPreview(id: string) {
    const use = await ownerDeleteRepository.couponBatchUse(id)
    if (!use) throw notFound('Batch', 'COUPON_BATCH_NOT_FOUND')
    return use
  },

  /**
   * A printed coupon batch outright (Void keeps it), with its codes and
   * redemptions. A personal code a redemption gave a customer stays theirs
   * (its link is set null); bonus stamps it gave go with it.
   */
  async deleteCouponBatch(actor: OwnerActor, id: string, confirmText: string) {
    await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockCouponBatch(id)
      if (!row) throw notFound('Batch', 'COUPON_BATCH_NOT_FOUND')
      confirmTyped(confirmText, row.name)
      const use = await repo.couponBatchUse(id)
      await repo.deleteCouponBatch(id)
      await repo.audit({
        action: 'coupon_batch_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { batchId: id, name: row.name, codes: row.codeCount, redemptions: use?.redemptions ?? 0 },
        detail: { voidedAt: row.voidedAt?.toISOString() ?? null },
      })
    })
    log.warn({ batchId: id, by: actor.name }, 'owner_delete:coupon_batch')
    return { id, deleted: true as const }
  },

  /**
   * One printed code outright (Void keeps it), with its redemption and the
   * stamps it gave. Typed in full, as Void asks: the panel never sees a
   * code's id, only the code on the card, and only its hash is stored.
   * Same answers as Void for a typo or a code from another batch.
   */
  async deleteCouponCode(actor: OwnerActor, batchId: string, typed: string) {
    const codeHash = couponLookupHash(typed)
    if (!codeHash) throw new AppError(400, "That code doesn't look right. Check each character.", 'COUPON_CODE_TYPO')
    const row = await ownerDeleteRepository.transaction(async (repo) => {
      const code = await repo.lockCouponCode(batchId, codeHash)
      if (!code) throw new AppError(404, "That code isn't in this batch.", 'COUPON_CODE_NOT_IN_BATCH')
      await repo.deleteCouponCode(code.id)
      await repo.audit({
        action: 'coupon_code_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { codeId: code.id, batchId, seq: code.seq, suffix: code.suffix },
        detail: { redeemed: code.redeemedAt !== null, voided: code.voidedAt !== null },
      })
      return code
    })
    log.warn({ codeId: row.id, batchId, by: actor.name }, 'owner_delete:coupon_code')
    return { id: row.id, suffix: row.suffix, deleted: true as const }
  },

  /** A notice outright (End keeps it), with who dismissed it. */
  async deleteNotice(actor: OwnerActor, id: string) {
    await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockNotice(id)
      if (!row) throw notFound('Notice', 'NOTICE_NOT_FOUND')
      await repo.deleteNotice(id)
      await repo.audit({
        action: 'notice_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { noticeId: id, title: row.title, vendorId: row.vendorId },
      })
    })
    log.warn({ noticeId: id, by: actor.name }, 'owner_delete:notice')
    return { id, deleted: true as const }
  },

  /**
   * A gift nobody has redeemed (409 GIFT_REDEEMED once someone has: its
   * credit is real money in their balance). Nothing is refunded: a paid one
   * is refunded in Razorpay first if the money should go back, and the audit
   * row keeps its amount and Razorpay ids.
   */
  async deleteGift(actor: OwnerActor, id: string, confirmText: string) {
    const gift = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockGift(id)
      if (!row) throw notFound('Gift', 'GIFT_NOT_FOUND')
      const refusal =
        giftDeleteRefusal(row) ??
        ((await repo.giftHasCredit(id)) ? giftDeleteRefusal({ status: 'redeemed', redeemedAt: row.redeemedAt }) : null)
      if (refusal) throw refused(refusal)
      confirmTyped(confirmText, formatGiftNumber(row.number))
      await repo.deleteGift(id)
      await repo.audit({
        action: 'gift_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { giftId: id, number: formatGiftNumber(row.number), amount: row.amount, status: row.status },
        detail: {
          buyerId: row.buyerId,
          gatewayOrderId: row.gatewayOrderId,
          gatewayPaymentId: row.gatewayPaymentId,
          paidAt: row.paidAt?.toISOString() ?? null,
        },
      })
      return row
    })
    log.warn({ giftId: id, status: gift.status, by: actor.name }, 'owner_delete:gift')
    return { id, number: formatGiftNumber(gift.number), deleted: true as const }
  },

  /**
   * A reward challenge outright (End keeps it), with everyone's progress,
   * its winners and the stamps it gave.
   */
  async deleteChallenge(actor: OwnerActor, id: string, confirmText: string) {
    await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockChallenge(id)
      if (!row) throw notFound('Challenge', 'CHALLENGE_NOT_FOUND')
      confirmTyped(confirmText, row.title)
      await repo.deleteChallenge(id)
      await repo.audit({
        action: 'reward_challenge_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { challengeId: id, title: row.title, published: row.publishedAt !== null },
      })
    })
    log.warn({ challengeId: id, by: actor.name }, 'owner_delete:challenge')
    return { id, deleted: true as const }
  },

  /**
   * A zone's sign-up list, for the zone drawer: the customer's name and the
   * last four digits of their phone only, as Requests lists them.
   */
  async listZoneSignups(zoneId: string) {
    const zone = await ownerDeleteRepository.findZone(zoneId)
    if (!zone) throw notFound('Zone', 'ZONE_NOT_FOUND')
    const rows = await ownerDeleteRepository.listZoneSignups(zoneId)
    return {
      zone: { id: zone.id, name: zone.name },
      signups: rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        phone: maskedPhone(row.phone),
        position: row.position,
        freeWash: row.freeWash,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  },

  /** Removes one customer from a zone's list, with a free wash it held. */
  async removeZoneSignup(actor: OwnerActor, zoneId: string, userId: string) {
    await ownerDeleteRepository.transaction(async (repo) => {
      const zone = await repo.findZone(zoneId)
      if (!zone) throw notFound('Zone', 'ZONE_NOT_FOUND')
      const gone = await repo.deleteZoneSignup(zoneId, userId)
      if (!gone) throw notFound('Sign-up', 'ZONE_SIGNUP_NOT_FOUND')
      await repo.audit({
        action: 'zone_signup_removed',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { zoneId, zone: zone.name, userId, position: gone.position, freeWash: gone.freeWash },
      })
    })
    log.warn({ zoneId, by: actor.name }, 'owner_delete:zone_signup')
    return { zoneId, userId, removed: true as const }
  },

  /**
   * A team login outright (Turn off keeps it): never your own, never the
   * owner's. What it signed keeps the name as text.
   */
  async deleteAdminLogin(actor: OwnerActor, id: string, confirmText: string) {
    const login = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockAdminLogin(id)
      if (!row) throw notFound('Login', 'ADMIN_LOGIN_NOT_FOUND')
      const refusal = adminLoginDeleteRefusal({ target: row, actorLoginId: actor.loginId })
      if (refusal) throw refused(refusal)
      confirmTyped(confirmText, row.username)
      await repo.deleteAdminLogin(id)
      await repo.audit({
        action: 'admin_login_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { loginId: id, username: row.username, name: row.name },
      })
      return row
    })
    log.warn({ loginId: id, by: actor.name }, 'owner_delete:admin_login')
    return { id, username: login.username, deleted: true as const }
  },

  /** One job photo of a booking, its file removed from storage after the commit. */
  async deleteJobPhoto(actor: OwnerActor, id: string) {
    const photo = await ownerDeleteRepository.transaction(async (repo) => {
      const row = await repo.lockJobPhoto(id)
      if (!row) throw notFound('Photo', 'PHOTO_NOT_FOUND')
      await repo.deleteJobPhoto(id)
      await repo.audit({
        action: 'job_photo_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { photoId: id, bookingId: row.bookingId, reference: bookingReference(row.bookingId), stage: row.stage },
        detail: { vendorId: row.vendorId, uploadedBy: row.uploadedByRole },
      })
      return row
    })
    removePhotoFiles([photo.storageKey], 'job_photo')
    log.warn({ photoId: id, bookingId: photo.bookingId, by: actor.name }, 'owner_delete:job_photo')
    return { id, bookingId: photo.bookingId, deleted: true as const }
  },
}
