import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  adminLogins,
  bookings,
  bypassReports,
  complaints,
  couponBatches,
  couponCodes,
  couponRedemptions,
  discountRedemptions,
  discounts,
  giftCreditEntries,
  gifts,
  guaranteeClaimPhotos,
  guaranteeClaims,
  jobPhotos,
  notices,
  reviews,
  rewardChallenges,
  rewardVouchers,
  users,
  zoneSignups,
  zones,
} from '../../db/schema.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

/** One audit row: ids, references, numbers and amounts, never a phone number or a customer's words. */
export interface OwnerDeleteAudit {
  action: string
  actorSub: string
  actorName: string
  summary: Record<string, unknown>
  detail?: Record<string, unknown>
}

/**
 * Reads that the sheets ask before a delete (counts of what goes with it),
 * on the plain connection or inside the delete's transaction.
 */
function reads(conn: Conn) {
  return {
    /** A zone's customers' sign-ups, oldest first, for the zone drawer's list. */
    listZoneSignups(zoneId: string) {
      return conn
        .select({
          userId: zoneSignups.userId,
          position: zoneSignups.position,
          freeWash: zoneSignups.freeWash,
          createdAt: zoneSignups.createdAt,
          name: users.name,
          phone: users.phone,
        })
        .from(zoneSignups)
        .innerJoin(users, eq(users.id, zoneSignups.userId))
        .where(eq(zoneSignups.zoneId, zoneId))
        .orderBy(asc(zoneSignups.position), asc(zoneSignups.createdAt))
        .limit(500)
    },

    async findZone(id: string) {
      const [row] = await conn.select({ id: zones.id, name: zones.name }).from(zones).where(eq(zones.id, id)).limit(1)
      return row
    },

    /** How many bookings a promo code was used on: what "Delete anyway" leaves without a link. */
    async discountUse(id: string) {
      const [found] = await conn
        .select({ id: discounts.id, code: discounts.code, source: discounts.source })
        .from(discounts)
        .where(eq(discounts.id, id))
        .limit(1)
      if (!found) return undefined
      const [redemptions] = await conn
        .select({ n: count() })
        .from(discountRedemptions)
        .where(eq(discountRedemptions.discountId, id))
      const [vouchers] = await conn.select({ n: count() }).from(rewardVouchers).where(eq(rewardVouchers.discountId, id))
      return { ...found, redemptions: redemptions?.n ?? 0, vouchers: vouchers?.n ?? 0 }
    },

    /** How many printed codes of a batch were redeemed. */
    async couponBatchUse(id: string) {
      const [found] = await conn
        .select({ id: couponBatches.id, name: couponBatches.name })
        .from(couponBatches)
        .where(eq(couponBatches.id, id))
        .limit(1)
      if (!found) return undefined
      const [redemptions] = await conn
        .select({ n: count() })
        .from(couponRedemptions)
        .where(eq(couponRedemptions.batchId, id))
      return { ...found, redemptions: redemptions?.n ?? 0 }
    },
  }
}

/** The deletes, each row locked FOR UPDATE first, and the audit row, in the caller's transaction. */
function writes(tx: Tx) {
  return {
    async audit(entry: OwnerDeleteAudit) {
      await tx.insert(adminAuditLog).values({
        action: entry.action,
        actorSub: entry.actorSub,
        actorName: entry.actorName,
        summary: entry.summary,
        detail: entry.detail ?? {},
      })
    },

    async lockReview(id: string) {
      const [row] = await tx
        .select({ id: reviews.id, bookingId: reviews.bookingId, vendorId: reviews.vendorId, rating: reviews.rating, hiddenAt: reviews.hiddenAt })
        .from(reviews)
        .where(eq(reviews.id, id))
        .for('update')
      return row
    },
    /** The review, and its reports with it (ON DELETE CASCADE). */
    async deleteReview(id: string) {
      await tx.delete(reviews).where(eq(reviews.id, id))
    },

    async lockComplaint(id: string) {
      const [row] = await tx
        .select({
          id: complaints.id,
          number: complaints.number,
          status: complaints.status,
          source: complaints.source,
          bookingId: complaints.bookingId,
          bookingRef: complaints.bookingRef,
          vendorId: complaints.vendorId,
          userId: complaints.userId,
        })
        .from(complaints)
        .where(eq(complaints.id, id))
        .for('update')
      return row
    },
    async deleteComplaint(id: string) {
      await tx.delete(complaints).where(eq(complaints.id, id))
    },

    async lockBypassReport(id: string) {
      const [row] = await tx
        .select({
          id: bypassReports.id,
          bookingRef: bypassReports.bookingRef,
          vendorId: bypassReports.vendorId,
          status: bypassReports.status,
          rewardStatus: bypassReports.rewardStatus,
          rewardEntryId: bypassReports.rewardEntryId,
        })
        .from(bypassReports)
        .where(eq(bypassReports.id, id))
        .for('update')
      return row
    },
    /** The report only: a reward it paid stays in the customer's credit. */
    async deleteBypassReport(id: string) {
      await tx.delete(bypassReports).where(eq(bypassReports.id, id))
    },

    async lockClaim(id: string) {
      const [row] = await tx
        .select({
          id: guaranteeClaims.id,
          bookingId: guaranteeClaims.bookingId,
          vendorId: guaranteeClaims.vendorId,
          status: guaranteeClaims.status,
          redoBookingId: guaranteeClaims.redoBookingId,
        })
        .from(guaranteeClaims)
        .where(eq(guaranteeClaims.id, id))
        .for('update')
      return row
    },
    /** The claim, and its photos' rows with it (ON DELETE CASCADE). Their files: the caller. */
    async deleteClaim(id: string) {
      await tx.delete(guaranteeClaims).where(eq(guaranteeClaims.id, id))
    },

    async lockDiscount(id: string) {
      const [row] = await tx
        .select({ id: discounts.id, code: discounts.code, source: discounts.source, vendorId: discounts.vendorId })
        .from(discounts)
        .where(eq(discounts.id, id))
        .for('update')
      return row
    },
    /**
     * A code in use (the owner's "Delete anyway"): its redemption rows go
     * (they name it ON DELETE RESTRICT), then the code. Bookings and
     * checkouts keep what they were charged and their discount figures;
     * their link to the code is set null by the foreign keys. Returns the
     * redemption count.
     */
    async deleteDiscountAnyway(id: string) {
      const gone = await tx
        .delete(discountRedemptions)
        .where(eq(discountRedemptions.discountId, id))
        .returning({ bookingId: discountRedemptions.bookingId })
      await tx.delete(discounts).where(eq(discounts.id, id))
      return gone.map((row) => row.bookingId)
    },

    async lockCouponBatch(id: string) {
      const [row] = await tx
        .select({ id: couponBatches.id, name: couponBatches.name, codeCount: couponBatches.codeCount, voidedAt: couponBatches.voidedAt })
        .from(couponBatches)
        .where(eq(couponBatches.id, id))
        .for('update')
      return row
    },
    /** The batch, with its codes, redemptions and their bonus stamps (ON DELETE CASCADE). */
    async deleteCouponBatch(id: string) {
      await tx.delete(couponBatches).where(eq(couponBatches.id, id))
    },

    /** A batch's code, found by its hash (the code itself is never stored). */
    async lockCouponCode(batchId: string, codeHash: string) {
      const [row] = await tx
        .select({
          id: couponCodes.id,
          seq: couponCodes.seq,
          suffix: couponCodes.suffix,
          redeemedAt: couponCodes.redeemedAt,
          voidedAt: couponCodes.voidedAt,
        })
        .from(couponCodes)
        .where(and(eq(couponCodes.batchId, batchId), eq(couponCodes.codeHash, codeHash)))
        .for('update')
      return row
    },
    /** The code, with its redemptions and their bonus stamps (ON DELETE CASCADE). */
    async deleteCouponCode(id: string) {
      await tx.delete(couponCodes).where(eq(couponCodes.id, id))
    },

    async lockNotice(id: string) {
      const [row] = await tx
        .select({ id: notices.id, title: notices.title, vendorId: notices.vendorId })
        .from(notices)
        .where(eq(notices.id, id))
        .for('update')
      return row
    },
    /** The notice, and who dismissed it (ON DELETE CASCADE). */
    async deleteNotice(id: string) {
      await tx.delete(notices).where(eq(notices.id, id))
    },

    async lockGift(id: string) {
      const [row] = await tx
        .select({
          id: gifts.id,
          number: gifts.number,
          amount: gifts.amount,
          status: gifts.status,
          buyerId: gifts.buyerId,
          gatewayOrderId: gifts.gatewayOrderId,
          gatewayPaymentId: gifts.gatewayPaymentId,
          paidAt: gifts.paidAt,
          redeemedAt: gifts.redeemedAt,
        })
        .from(gifts)
        .where(eq(gifts.id, id))
        .for('update')
      return row
    },
    /** Whether any credit entry names the gift (a redeemed one's lot): then it stays. */
    async giftHasCredit(id: string) {
      const [row] = await tx
        .select({ id: giftCreditEntries.id })
        .from(giftCreditEntries)
        .where(eq(giftCreditEntries.giftId, id))
        .limit(1)
      return Boolean(row)
    },
    async deleteGift(id: string) {
      await tx.delete(gifts).where(and(eq(gifts.id, id), isNull(gifts.redeemedAt)))
    },

    async lockChallenge(id: string) {
      const [row] = await tx
        .select({ id: rewardChallenges.id, title: rewardChallenges.title, publishedAt: rewardChallenges.publishedAt })
        .from(rewardChallenges)
        .where(eq(rewardChallenges.id, id))
        .for('update')
      return row
    },
    /** The challenge, with its progress, winners and the stamps it gave (ON DELETE CASCADE). */
    async deleteChallenge(id: string) {
      await tx.delete(rewardChallenges).where(eq(rewardChallenges.id, id))
    },

    /** A customer's sign-up to a zone's list; with it, a free wash it held (the code stays, unlinked). */
    async deleteZoneSignup(zoneId: string, userId: string) {
      const rows = await tx
        .delete(zoneSignups)
        .where(and(eq(zoneSignups.zoneId, zoneId), eq(zoneSignups.userId, userId)))
        .returning({ position: zoneSignups.position, freeWash: zoneSignups.freeWash })
      return rows[0]
    },

    async lockAdminLogin(id: string) {
      const [row] = await tx
        .select({ id: adminLogins.id, username: adminLogins.username, name: adminLogins.name, isOwner: adminLogins.isOwner })
        .from(adminLogins)
        .where(eq(adminLogins.id, id))
        .for('update')
      return row
    },
    /**
     * The login. Collection lists and leads assigned to it keep the name
     * they were given (their link is set null), and every record it signed
     * keeps its name as text; its sessions end at the next request.
     */
    async deleteAdminLogin(id: string) {
      await tx.delete(adminLogins).where(eq(adminLogins.id, id))
    },

    async lockJobPhoto(id: string) {
      const [row] = await tx
        .select({
          id: jobPhotos.id,
          bookingId: jobPhotos.bookingId,
          stage: jobPhotos.stage,
          storageKey: jobPhotos.storageKey,
          uploadedByRole: jobPhotos.uploadedByRole,
          vendorId: bookings.vendorId,
        })
        .from(jobPhotos)
        .innerJoin(bookings, eq(bookings.id, jobPhotos.bookingId))
        .where(eq(jobPhotos.id, id))
        .for('update', { of: jobPhotos })
      return row
    },
    async deleteJobPhoto(id: string) {
      await tx.delete(jobPhotos).where(eq(jobPhotos.id, id))
    },

    /** A claim's photos' storage keys, read before the claim goes (its files are removed after). */
    async claimPhotoKeys(claimId: string): Promise<string[]> {
      const rows = await tx
        .select({ storageKey: guaranteeClaimPhotos.storageKey })
        .from(guaranteeClaimPhotos)
        .where(eq(guaranteeClaimPhotos.claimId, claimId))
      return rows.map((row) => row.storageKey)
    },
  }
}

export type OwnerDeleteWork = ReturnType<typeof reads> & ReturnType<typeof writes>

export const ownerDeleteRepository = {
  ...reads(db),

  /** Runs the work in one transaction; everything rolls back together on any throw. */
  transaction<T>(work: (repo: OwnerDeleteWork) => Promise<T>): Promise<T> {
    return db.transaction((tx) => work({ ...reads(tx), ...writes(tx) }))
  },
}
