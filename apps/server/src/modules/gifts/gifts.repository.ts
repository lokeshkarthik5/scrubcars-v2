import { and, desc, eq, gt, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  giftCodeAttempts,
  giftCreditEntries,
  gifts,
  users,
  type GatewayMode,
} from '../../db/schema.js'
import {
  balanceOf,
  giftExpiresAt,
  paise,
  redeemRefusal,
  rupees,
  withinDailyLimit,
  type GiftDesign,
} from '../../lib/gift-credit.js'
import { lockCredit, listCreditEntries } from '../gift-credit/gift-credit.repository.js'

export type GiftRecord = typeof gifts.$inferSelect

/** A time as a timestamptz parameter in raw SQL. */
const at = (date: Date) => sql`${date.toISOString()}::timestamptz`

/** What redeemGift did. */
export type RedeemResult =
  | { kind: 'redeemed'; gift: GiftRecord; balancePaise: number }
  | { kind: 'refused'; refusal: 'pending' | 'redeemed' | 'expired' | 'cancelled'; gift: GiftRecord }
  | { kind: 'not_found' }

export const giftsRepository = {
  /**
   * A new gift checkout, if it fits the buyer's day: under the buyer's own
   * lock (`gifts-buy:<buyer>`, taken on its own), today's gifts are added up
   * (paid ones, and checkouts opened in the last `pendingSince` that may
   * still be paid) and the new one written only if the total stays within
   * the daily limit. Two tabs buying at once can't both slip under it.
   */
  async createPending(input: {
    buyerId: string
    amount: number
    recipientName: string
    message: string | null
    design: GiftDesign
    dayStart: Date
    pendingSince: Date
    limit: number
  }): Promise<{ kind: 'created'; gift: GiftRecord } | { kind: 'over_limit'; boughtTodayPaise: number }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gifts-buy:${input.buyerId}`})::bigint)`)
      const [row] = await tx
        .select({ total: sql<string | null>`sum(${gifts.amount})::text` })
        .from(gifts)
        .where(
          and(
            eq(gifts.buyerId, input.buyerId),
            gt(gifts.createdAt, input.dayStart),
            or(
              inArray(gifts.status, ['paid', 'redeemed']),
              // A cancelled gift that had been paid still counted that day.
              and(eq(gifts.status, 'cancelled'), isNotNull(gifts.paidAt)),
              and(eq(gifts.status, 'pending'), gt(gifts.createdAt, input.pendingSince))
            )
          )
        )
      const boughtTodayPaise = paise(row?.total)
      if (!withinDailyLimit({ boughtTodayPaise, amount: input.amount, limit: input.limit })) {
        return { kind: 'over_limit' as const, boughtTodayPaise }
      }
      const [gift] = await tx
        .insert(gifts)
        .values({
          buyerId: input.buyerId,
          amount: rupees(input.amount * 100),
          recipientName: input.recipientName,
          message: input.message,
          design: input.design,
        })
        .returning()
      return { kind: 'created' as const, gift }
    })
  },

  setOrder(giftId: string, orderId: string, gatewayMode: GatewayMode) {
    return db.update(gifts).set({ gatewayOrderId: orderId, gatewayMode }).where(eq(gifts.id, giftId))
  },

  findById(id: string) {
    return db.query.gifts.findFirst({ where: eq(gifts.id, id) })
  },

  findByOrderId(orderId: string) {
    return db.query.gifts.findFirst({ where: eq(gifts.gatewayOrderId, orderId) })
  },

  findByCodeHash(codeHash: string) {
    return db.query.gifts.findFirst({ where: eq(gifts.codeHash, codeHash) })
  },

  /**
   * Records the money landing: conditional on `pending`, so the app's verify
   * and the webhook, which both arrive, write it once. The gift's 12 months
   * start now.
   */
  async markPaid(input: { giftId: string; orderId: string | null; paymentId: string; paidAt: Date }) {
    const [row] = await db
      .update(gifts)
      .set({
        status: 'paid',
        gatewayPaymentId: input.paymentId,
        paidAt: input.paidAt,
        expiresAt: giftExpiresAt(input.paidAt),
      })
      .where(
        and(
          eq(gifts.id, input.giftId),
          eq(gifts.status, 'pending'),
          input.orderId ? eq(gifts.gatewayOrderId, input.orderId) : sql`true`
        )
      )
      .returning()
    return row ?? null
  },

  /**
   * A new link for the buyer: the new code's hash replaces the old one, so
   * the old link stops working. Only on the buyer's own gift while it can
   * still be redeemed (paid, not expired).
   */
  async setCode(input: { giftId: string; buyerId: string; codeHash: string; now: Date }) {
    const [row] = await db
      .update(gifts)
      .set({ codeHash: input.codeHash, linksIssued: sql`${gifts.linksIssued} + 1` })
      .where(
        and(
          eq(gifts.id, input.giftId),
          eq(gifts.buyerId, input.buyerId),
          eq(gifts.status, 'paid'),
          gt(gifts.expiresAt, input.now)
        )
      )
      .returning()
    return row ?? null
  },

  /**
   * Turns a gift into credit on the redeemer's account, once. Under the
   * redeemer's credit lock, then the gift's row FOR UPDATE (nothing takes
   * them the other way round), re-checked there; the ledger's unique index
   * on a gift's `redeem` row holds it too. The credit lasts as long as the
   * gift would have: 12 months from when it was paid for.
   */
  async redeemGift(input: { giftId: string; userId: string; now: Date }): Promise<RedeemResult> {
    return db.transaction(async (tx): Promise<RedeemResult> => {
      await lockCredit(tx, input.userId)
      const [gift] = await tx.select().from(gifts).where(eq(gifts.id, input.giftId)).for('update').limit(1)
      if (!gift) return { kind: 'not_found' }
      const refusal = redeemRefusal(gift, input.now)
      if (refusal) return { kind: 'refused', refusal, gift }

      const [redeemed] = await tx
        .update(gifts)
        .set({ status: 'redeemed', redeemedBy: input.userId, redeemedAt: input.now })
        .where(and(eq(gifts.id, gift.id), eq(gifts.status, 'paid')))
        .returning()
      await tx.insert(giftCreditEntries).values({
        userId: input.userId,
        kind: 'redeem',
        amount: gift.amount,
        expiresAt: gift.expiresAt!,
        giftId: gift.id,
      })
      const balancePaise = balanceOf(await listCreditEntries(tx, input.userId), input.now)
      return { kind: 'redeemed', gift: redeemed, balancePaise }
    })
  },

  listForBuyer(buyerId: string, limit: number) {
    return db
      .select()
      .from(gifts)
      .where(and(eq(gifts.buyerId, buyerId), sql`${gifts.status} <> 'pending'`))
      .orderBy(desc(gifts.createdAt))
      .limit(limit)
  },

  findBuyerName(buyerId: string) {
    return db.query.users.findFirst({ where: eq(users.id, buyerId), columns: { name: true } })
  },

  /** Wrong codes in the last hour, by the customer (when signed in) and by network address. */
  async countRecentFailures(input: { userId: string | null; ipKey: string; since: Date }) {
    const [byIp] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(giftCodeAttempts)
      .where(and(eq(giftCodeAttempts.ipKey, input.ipKey), gt(giftCodeAttempts.createdAt, input.since)))
    let byUser: number | null = null
    if (input.userId) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(giftCodeAttempts)
        .where(and(eq(giftCodeAttempts.userId, input.userId), gt(giftCodeAttempts.createdAt, input.since)))
      byUser = row?.count ?? 0
    }
    return { ipFailures: byIp?.count ?? 0, userFailures: byUser }
  },

  async recordFailure(input: { userId: string | null; ipKey: string }) {
    await db.insert(giftCodeAttempts).values({ userId: input.userId, ipKey: input.ipKey })
  },

  /** The cron's clean-up: wrong-code rows older than `before`, a batch at a time. */
  async purgeAttempts(before: Date, limit: number): Promise<number> {
    const rows = await db.execute<{ id: string }>(sql`
      delete from gift_code_attempts
       where id in (select id from gift_code_attempts where created_at < ${before.toISOString()}::timestamptz limit ${limit})
      returning id
    `)
    return rows.length
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** Gifts sold, redeemed, cancelled and still to redeem, added up. */
  async totals(now: Date, soonBy: Date) {
    const [row] = await db
      .select({
        soldCount: sql<number>`count(*) filter (where ${gifts.status} in ('paid', 'redeemed') or (${gifts.status} = 'cancelled' and ${gifts.paidAt} is not null))::int`,
        soldAmount: sql<string | null>`sum(${gifts.amount}) filter (where ${gifts.status} in ('paid', 'redeemed') or (${gifts.status} = 'cancelled' and ${gifts.paidAt} is not null))::text`,
        redeemedCount: sql<number>`count(*) filter (where ${gifts.status} = 'redeemed')::int`,
        redeemedAmount: sql<string | null>`sum(${gifts.amount}) filter (where ${gifts.status} = 'redeemed')::text`,
        unredeemedCount: sql<number>`count(*) filter (where ${gifts.status} = 'paid' and ${gifts.expiresAt} > ${at(now)})::int`,
        unredeemedAmount: sql<string | null>`sum(${gifts.amount}) filter (where ${gifts.status} = 'paid' and ${gifts.expiresAt} > ${at(now)})::text`,
        expiringCount: sql<number>`count(*) filter (where ${gifts.status} = 'paid' and ${gifts.expiresAt} > ${at(now)} and ${gifts.expiresAt} <= ${at(soonBy)})::int`,
        expiringAmount: sql<string | null>`sum(${gifts.amount}) filter (where ${gifts.status} = 'paid' and ${gifts.expiresAt} > ${at(now)} and ${gifts.expiresAt} <= ${at(soonBy)})::text`,
        expiredCount: sql<number>`count(*) filter (where ${gifts.status} = 'paid' and ${gifts.expiresAt} <= ${at(now)})::int`,
        expiredAmount: sql<string | null>`sum(${gifts.amount}) filter (where ${gifts.status} = 'paid' and ${gifts.expiresAt} <= ${at(now)})::text`,
        cancelledCount: sql<number>`count(*) filter (where ${gifts.status} = 'cancelled' and ${gifts.paidAt} is not null)::int`,
        cancelledAmount: sql<string | null>`sum(${gifts.amount}) filter (where ${gifts.status} = 'cancelled' and ${gifts.paidAt} is not null)::text`,
      })
      .from(gifts)
    return row
  },

  /** The latest gifts (not open checkouts), newest first, with who bought and who redeemed. */
  async listForAdmin(input: { status: 'all' | 'available' | 'redeemed' | 'expired' | 'cancelled'; now: Date; limit: number }) {
    const filter = {
      all: sql`${gifts.status} <> 'pending'`,
      available: and(eq(gifts.status, 'paid'), gt(gifts.expiresAt, input.now)),
      redeemed: eq(gifts.status, 'redeemed'),
      expired: and(eq(gifts.status, 'paid'), lt(gifts.expiresAt, input.now)),
      cancelled: eq(gifts.status, 'cancelled'),
    }[input.status]
    const rows = await db
      .select({
        gift: gifts,
        buyerName: sql<string>`(select name from users where id = ${gifts.buyerId})`,
        buyerPhone: sql<string>`(select phone from users where id = ${gifts.buyerId})`,
        redeemerName: sql<string | null>`(select name from users where id = ${gifts.redeemedBy})`,
      })
      .from(gifts)
      .where(filter)
      .orderBy(desc(gifts.createdAt))
      .limit(input.limit)
    return rows
  },

  /**
   * The team cancels a gift nobody has redeemed (it is being refunded by
   * hand in Razorpay), with its audit row in the same transaction. Locks the
   * gift's row first; a redeemed one is refused.
   */
  async cancel(input: { giftId: string; actorName: string; actorSub: string; reason: string; now: Date }) {
    return db.transaction(async (tx) => {
      const [gift] = await tx.select().from(gifts).where(eq(gifts.id, input.giftId)).for('update').limit(1)
      if (!gift) return { kind: 'not_found' as const }
      if (gift.status === 'redeemed' || gift.status === 'cancelled') {
        return { kind: 'refused' as const, status: gift.status }
      }
      const [cancelled] = await tx
        .update(gifts)
        .set({
          status: 'cancelled',
          cancelledAt: input.now,
          cancelledBy: input.actorName,
          cancelReason: input.reason,
          codeHash: null,
        })
        .where(eq(gifts.id, gift.id))
        .returning()
      await tx.insert(adminAuditLog).values({
        action: 'gift_cancelled',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { giftId: gift.id, number: gift.number, amount: gift.amount, wasPaid: gift.paidAt !== null },
        detail: { reason: input.reason, gatewayPaymentId: gift.gatewayPaymentId },
      })
      return { kind: 'cancelled' as const, gift: cancelled }
    })
  },

  /** Whether the account bought or redeemed a gift (DELETE /users/me). */
  /**
   * Paid gifts this customer bought that nobody has redeemed yet and that
   * have not expired (0066: deleting the account waits for them).
   */
  async listUnredeemedBought(userId: string, now: Date) {
    return db
      .select({ number: gifts.number, expiresAt: gifts.expiresAt })
      .from(gifts)
      .where(
        and(
          eq(gifts.buyerId, userId),
          eq(gifts.status, 'paid'),
          or(sql`${gifts.expiresAt} is null`, gt(gifts.expiresAt, now))
        )
      )
      .orderBy(gifts.number)
      .limit(10)
  },

  async hasGifts(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ one: sql`1` })
      .from(gifts)
      .where(or(eq(gifts.buyerId, userId), eq(gifts.redeemedBy, userId)))
      .limit(1)
    return Boolean(row)
  },
}
