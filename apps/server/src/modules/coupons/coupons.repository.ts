import { and, asc, desc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  couponBatches,
  couponCodeAttempts,
  couponCodes,
  couponRedemptions,
  discounts,
  rewardStamps,
  users,
  vendors,
} from '../../db/schema.js'
import {
  redeemRefusal,
  voucherDiscountValues,
  type RedeemChannel,
  type RedeemRefusal,
} from '../../lib/coupons.js'
import { stampExpiresAt, type RewardsSettings } from '../../lib/rewards.js'
import { DISCOUNT_HELD, DISCOUNT_REALIZED } from '../discounts/discounts.predicates.js'
import { rewardsTx, type IssuedVoucher } from '../rewards/rewards.repository.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = PgTransaction<any, any, any>

export type BatchRow = typeof couponBatches.$inferSelect
export type CodeRow = typeof couponCodes.$inferSelect

// ─── Locks ───────────────────────────────────────────────────────────────────
//
// Redeeming takes the code's own row FOR UPDATE first: one unique code is
// added once however many phones race for it, and one customer tapping
// twice adds a shared code once (the unique indexes back both). Then the
// batch row FOR SHARE (so a void of the batch is never half-seen). Then, for
// bonus stamps only, the customer's rewards lock (`rewards:<userId>`, via
// rewardsTx) and the budget check after it. Taken on its own, never
// alongside the booking-write locks. Voiding takes the batch row (or the
// code row) FOR UPDATE, then the redemption rows it cancels.

/**
 * The booking that holds a coupon's voucher now (a live booking, or a
 * customer no-show), by DISCOUNT_HELD: checkout's own rule. A cancelled
 * booking gives the voucher back. Over a discount id column.
 */
function heldBookingOf(discountIdColumn: SQL | typeof couponRedemptions.discountId): SQL<string | null> {
  return sql<string | null>`(select dr.booking_id
                from discount_redemptions dr
                join bookings on bookings.id = dr.booking_id
                join payments on payments.booking_id = bookings.id
               where dr.discount_id = ${discountIdColumn} and ${DISCOUNT_HELD}
               limit 1)`
}

/** Bookings a redemption is used on, kept and paid, Test-marked left out (Statistics' rule). */
const KEPT_USE = sql`${DISCOUNT_REALIZED} and bookings.marked_test_at is null`

/**
 * The chain's first row made it: a customer's first kept booking anywhere.
 * Over `bookings` (the redemption's booking): no other kept chain of the
 * customer started earlier.
 */
const FIRST_BOOKING = sql`not exists (
  select 1 from bookings b2
    join payments p2 on p2.booking_id = b2.id
   where b2.user_id = bookings.user_id
     and coalesce(b2.original_booking_id, b2.id) <> coalesce(bookings.original_booking_id, bookings.id)
     and (b2.status <> 'cancelled' or b2.no_show = 'customer')
     and p2.status in ('paid', 'collected')
     and (select r2.created_at from bookings r2 where r2.id = coalesce(b2.original_booking_id, b2.id))
       < (select r1.created_at from bookings r1 where r1.id = coalesce(bookings.original_booking_id, bookings.id))
)`

export interface BatchFigures {
  codes: number
  scannedCodes: number
  scans: number
  voidedCodes: number
  redeemed: number
  cancelled: number
  stampsGiven: number
  /** Vouchers a live booking (or a customer no-show) holds now. */
  usedAtCheckout: number
  /** Kept, paid bookings with one of the batch's vouchers (Test-marked left out). */
  bookings: number
  /** What those bookings' customers paid, rupees. */
  revenue: string
  /** What Detlio gave on them, rupees. */
  cost: string
  /** Of those, the customer's first kept booking on Detlio. */
  newCustomers: number
}

const emptyFigures = (): BatchFigures => ({
  codes: 0,
  scannedCodes: 0,
  scans: 0,
  voidedCodes: 0,
  redeemed: 0,
  cancelled: 0,
  stampsGiven: 0,
  usedAtCheckout: 0,
  bookings: 0,
  revenue: '0.00',
  cost: '0.00',
  newCustomers: 0,
})

/** Three grouped reads, never one per batch. */
async function figuresFor(batchIds: string[] | null): Promise<Map<string, BatchFigures>> {
  const out = new Map<string, BatchFigures>()
  const get = (id: string) => {
    let row = out.get(id)
    if (!row) out.set(id, (row = emptyFigures()))
    return row
  }
  if (batchIds !== null && batchIds.length === 0) return out

  const codes = await db
    .select({
      batchId: couponCodes.batchId,
      codes: sql<number>`count(*)::int`,
      scannedCodes: sql<number>`count(*) filter (where ${couponCodes.scanCount} > 0)::int`,
      scans: sql<number>`coalesce(sum(${couponCodes.scanCount}), 0)::int`,
      voided: sql<number>`count(*) filter (where ${couponCodes.voidedAt} is not null)::int`,
    })
    .from(couponCodes)
    .where(batchIds ? inArray(couponCodes.batchId, batchIds) : undefined)
    .groupBy(couponCodes.batchId)
  for (const row of codes) {
    Object.assign(get(row.batchId), {
      codes: row.codes,
      scannedCodes: row.scannedCodes,
      scans: row.scans,
      voidedCodes: row.voided,
    })
  }

  const redemptions = await db
    .select({
      batchId: couponRedemptions.batchId,
      redeemed: sql<number>`count(*)::int`,
      cancelled: sql<number>`count(*) filter (where ${couponRedemptions.cancelledAt} is not null)::int`,
      stamps: sql<number>`coalesce(sum(${couponRedemptions.stamps}), 0)::int`,
    })
    .from(couponRedemptions)
    .where(batchIds ? inArray(couponRedemptions.batchId, batchIds) : undefined)
    .groupBy(couponRedemptions.batchId)
  for (const row of redemptions) {
    Object.assign(get(row.batchId), { redeemed: row.redeemed, cancelled: row.cancelled, stampsGiven: row.stamps })
  }

  const filter = batchIds ? sql`and cr.batch_id in (${sql.join(batchIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``
  const uses = await db.execute<{
    batch_id: string
    used: number
    bookings: number
    revenue: string | null
    cost: string | null
    new_customers: number
  }>(sql`
    select cr.batch_id,
           count(distinct cr.id) filter (where ${DISCOUNT_HELD})::int as used,
           count(*) filter (where ${KEPT_USE})::int as bookings,
           sum(bookings.amount) filter (where ${KEPT_USE})::text as revenue,
           sum(dr.discount_amount) filter (where ${KEPT_USE})::text as cost,
           count(*) filter (where ${KEPT_USE} and ${FIRST_BOOKING})::int as new_customers
      from coupon_redemptions cr
      join discount_redemptions dr on dr.discount_id = cr.discount_id
      join bookings on bookings.id = dr.booking_id
      join payments on payments.booking_id = bookings.id
     where cr.discount_id is not null ${filter}
     group by cr.batch_id
  `)
  for (const row of uses) {
    Object.assign(get(row.batch_id), {
      usedAtCheckout: Number(row.used),
      bookings: Number(row.bookings),
      revenue: Number(row.revenue ?? 0).toFixed(2),
      cost: Number(row.cost ?? 0).toFixed(2),
      newCustomers: Number(row.new_customers),
    })
  }
  return out
}

export type RedeemResult =
  | { kind: 'not_found' }
  | { kind: 'refused'; refusal: RedeemRefusal }
  | {
      kind: 'redeemed'
      redemptionId: string
      batch: BatchRow
      voucher: { discountId: string; code: string } | null
      stamps: number | null
      issued: IssuedVoucher[]
      capAlert: { month: string; issuedPaise: number } | null
    }

export const couponsRepository = {
  // ─── Codes ─────────────────────────────────────────────────────────────────

  /** A code by its hash, with its batch and the batch's garage name. */
  async findByHash(codeHash: string) {
    const [row] = await db
      .select({ code: couponCodes, batch: couponBatches, vendorName: vendors.businessName })
      .from(couponCodes)
      .innerJoin(couponBatches, eq(couponBatches.id, couponCodes.batchId))
      .leftJoin(vendors, eq(vendors.id, couponBatches.vendorId))
      .where(eq(couponCodes.codeHash, codeHash))
      .limit(1)
    return row
  },

  /** The /c page opened: one more scan. */
  async recordScan(codeId: string, now: Date) {
    await db
      .update(couponCodes)
      .set({
        scanCount: sql`${couponCodes.scanCount} + 1`,
        firstScannedAt: sql`coalesce(${couponCodes.firstScannedAt}, ${now.toISOString()}::timestamptz)`,
        lastScannedAt: now,
      })
      .where(eq(couponCodes.id, codeId))
  },

  /** Whether the viewer added this code, and how many customers did. */
  async codeFacts(codeId: string, userId: string | null) {
    const [row] = await db
      .select({
        redemptions: sql<number>`count(*)::int`,
        mine: userId
          ? sql<number>`count(*) filter (where ${couponRedemptions.userId} = ${userId})::int`
          : sql<number>`0`,
      })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.codeId, codeId))
    return { redemptions: Number(row?.redemptions ?? 0), viewerAdded: Number(row?.mine ?? 0) > 0 }
  },

  /**
   * Adds a coupon to a customer's account, once. Under the code's row lock
   * the batch and the counts are read afresh and the rules judged again
   * (lib/coupons.ts redeemRefusal); then the voucher's discounts row (or
   * the stamps), the redemption, and for a unique code its `redeemed_at`.
   */
  async redeem(input: {
    codeId: string
    userId: string
    channel: RedeemChannel
    now: Date
    rewardsLive: boolean
    hasPaidBooking: boolean
    settings: RewardsSettings | null
    makeVoucherCode: () => string
  }): Promise<RedeemResult> {
    const { now, userId } = input
    return db.transaction(async (tx) => {
      const [code] = await tx.select().from(couponCodes).where(eq(couponCodes.id, input.codeId)).for('update')
      if (!code) return { kind: 'not_found' as const }
      // FOR SHARE: a void of the batch (FOR UPDATE) waits for this add to
      // commit, or this add sees the void; so voiding with "cancel unspent"
      // never misses a coupon added at the same moment. Adds don't wait on
      // each other.
      const [batch] = await tx.select().from(couponBatches).where(eq(couponBatches.id, code.batchId)).for('share')
      if (!batch) return { kind: 'not_found' as const }
      const [counts] = await tx
        .select({
          redemptions: sql<number>`count(*)::int`,
          mine: sql<number>`count(*) filter (where ${couponRedemptions.userId} = ${userId})::int`,
        })
        .from(couponRedemptions)
        .where(eq(couponRedemptions.codeId, code.id))

      const refusal = redeemRefusal({
        batch,
        code,
        userId,
        addedByUser: Number(counts?.mine ?? 0) > 0,
        redemptions: Number(counts?.redemptions ?? 0),
        hasPaidBooking: input.hasPaidBooking,
        rewardsLive: input.rewardsLive,
        now,
      })
      if (refusal) return { kind: 'refused' as const, refusal }

      let voucher: { discountId: string; code: string } | null = null
      const values = voucherDiscountValues(batch, now)
      if (values) {
        for (let attempt = 0; attempt < 5 && !voucher; attempt += 1) {
          const voucherCode = input.makeVoucherCode()
          const [row] = await tx
            .insert(discounts)
            .values({ ...values, code: voucherCode, description: `Printed coupon: ${batch.name}`.slice(0, 200) })
            .onConflictDoNothing()
            .returning({ id: discounts.id })
          if (row) voucher = { discountId: row.id, code: voucherCode }
        }
        if (!voucher) throw new Error('coupon voucher: no free code after 5 tries')
      }

      const [redemption] = await tx
        .insert(couponRedemptions)
        .values({
          batchId: batch.id,
          codeId: code.id,
          codeKind: batch.kind,
          userId,
          kind: values ? 'voucher' : 'stamps',
          discountId: voucher?.discountId ?? null,
          stamps: values ? null : batch.stamps,
          channel: input.channel,
          createdAt: now,
        })
        .returning({ id: couponRedemptions.id })

      if (batch.kind === 'unique') {
        const marked = await tx
          .update(couponCodes)
          .set({ redeemedAt: now, redeemedBy: userId })
          .where(and(eq(couponCodes.id, code.id), isNull(couponCodes.redeemedAt)))
          .returning({ id: couponCodes.id })
        // The row lock makes this impossible; never add a unique code twice.
        if (marked.length !== 1) throw new Error('coupon code: redeemed under the lock')
      }

      let issued: IssuedVoucher[] = []
      let capAlert: { month: string; issuedPaise: number } | null = null
      if (!values) {
        const settings = input.settings
        if (!settings || !batch.stamps) throw new Error('coupon stamps: no rewards settings')
        await rewardsTx.lockRewards(tx, userId)
        await tx.insert(rewardStamps).values(
          Array.from({ length: batch.stamps }, () => ({
            userId,
            source: 'coupon' as const,
            couponRedemptionId: redemption!.id,
            earnedAt: now,
            expiresAt: stampExpiresAt(now, settings),
          }))
        )
        issued = await rewardsTx.convertFullCards(tx, { userId, now, settings })
        capAlert = issued.length > 0 ? await rewardsTx.capCheck(tx, { now, settings, forced: false }) : null
      }

      return {
        kind: 'redeemed' as const,
        redemptionId: redemption!.id,
        batch,
        voucher,
        stamps: values ? null : batch.stamps,
        issued,
        capAlert,
      }
    })
  },

  // ─── Wrong codes ───────────────────────────────────────────────────────────

  async countRecentFailures(input: { userId: string | null; ipKey: string; since: Date }) {
    const [byIp] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(couponCodeAttempts)
      .where(and(eq(couponCodeAttempts.ipKey, input.ipKey), gt(couponCodeAttempts.createdAt, input.since)))
    let byUser: number | null = null
    if (input.userId) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(couponCodeAttempts)
        .where(and(eq(couponCodeAttempts.userId, input.userId), gt(couponCodeAttempts.createdAt, input.since)))
      byUser = row?.count ?? 0
    }
    return { ipFailures: byIp?.count ?? 0, userFailures: byUser }
  },

  async recordFailure(input: { userId: string | null; ipKey: string }) {
    await db.insert(couponCodeAttempts).values({ userId: input.userId, ipKey: input.ipKey })
  },

  /** The cron's clean-up: wrong-code rows older than `before`, a batch at a time. */
  async purgeAttempts(before: Date, limit: number): Promise<number> {
    const rows = await db.execute<{ id: string }>(sql`
      delete from coupon_code_attempts
       where id in (select id from coupon_code_attempts where created_at < ${before.toISOString()}::timestamptz limit ${limit})
      returning id
    `)
    return rows.length
  },

  // ─── The customer's coupons ────────────────────────────────────────────────

  /** What a customer added, newest first, with each voucher's code and whether a booking holds it. */
  listForUser(userId: string, limit: number) {
    return db
      .select({
        id: couponRedemptions.id,
        kind: couponRedemptions.kind,
        stamps: couponRedemptions.stamps,
        createdAt: couponRedemptions.createdAt,
        cancelledAt: couponRedemptions.cancelledAt,
        batch: couponBatches,
        vendorName: vendors.businessName,
        voucherCode: discounts.code,
        voucherEndsAt: discounts.endsAt,
        voucherActive: discounts.isActive,
        heldBookingId: heldBookingOf(couponRedemptions.discountId),
      })
      .from(couponRedemptions)
      .innerJoin(couponBatches, eq(couponBatches.id, couponRedemptions.batchId))
      .leftJoin(vendors, eq(vendors.id, couponBatches.vendorId))
      .leftJoin(discounts, eq(discounts.id, couponRedemptions.discountId))
      .where(eq(couponRedemptions.userId, userId))
      .orderBy(desc(couponRedemptions.createdAt))
      .limit(limit)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** A garage for a batch: its name, and whether it is in the Bin. */
  async findVendor(vendorId: string) {
    const [row] = await db
      .select({ id: vendors.id, businessName: vendors.businessName, deletedAt: vendors.deletedAt, purgedAt: vendors.purgedAt })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1)
    return row
  },

  /**
   * A new batch, its codes and its audit row in one transaction. A code
   * that clashes with any stored one (the unique hash) is derived again
   * with the next variant, so every code in the batch is new.
   */
  async createBatch(input: {
    batch: typeof couponBatches.$inferInsert & { id: string }
    codeFor: (seq: number, variant: number) => { codeHash: string; suffix: string }
    actorSub: string
  }) {
    return db.transaction(async (tx) => {
      const [batch] = await tx.insert(couponBatches).values(input.batch).returning()
      let pending = Array.from({ length: input.batch.codeCount }, (_, seq) => seq)
      for (let variant = 0; pending.length > 0; variant += 1) {
        if (variant > 20) throw new Error('coupon codes: no free variant after 20 tries')
        const stored = new Set<number>()
        for (let start = 0; start < pending.length; start += 500) {
          const slice = pending.slice(start, start + 500)
          const rows = await tx
            .insert(couponCodes)
            .values(slice.map((seq) => ({ batchId: batch!.id, seq, variant, ...input.codeFor(seq, variant) })))
            .onConflictDoNothing({ target: couponCodes.codeHash })
            .returning({ seq: couponCodes.seq })
          for (const row of rows) stored.add(row.seq)
        }
        pending = pending.filter((seq) => !stored.has(seq))
      }
      await tx.insert(adminAuditLog).values({
        action: 'coupon_batch_created',
        actorSub: input.actorSub,
        actorName: input.batch.createdByName,
        summary: {
          batchId: batch!.id,
          name: batch!.name,
          location: batch!.location,
          kind: batch!.kind,
          reward: batch!.reward,
          codes: batch!.codeCount,
        },
        detail: {
          amountOff: batch!.amountOff,
          percentOff: batch!.percentOff,
          maxDiscount: batch!.maxDiscount,
          stamps: batch!.stamps,
          minOrderAmount: batch!.minOrderAmount,
          vendorId: batch!.vendorId,
          serviceCategory: batch!.serviceCategory,
          newCustomersOnly: batch!.newCustomersOnly,
          validFrom: batch!.validFrom,
          validUntil: batch!.validUntil,
          maxRedemptions: batch!.maxRedemptions,
        },
      })
      return batch!
    })
  },

  /** Every batch, newest first, with its garage's name and figures. */
  async listBatches(limit: number) {
    const rows = await db
      .select({ batch: couponBatches, vendorName: vendors.businessName })
      .from(couponBatches)
      .leftJoin(vendors, eq(vendors.id, couponBatches.vendorId))
      .orderBy(desc(couponBatches.createdAt))
      .limit(limit)
    const figures = await figuresFor(rows.map((row) => row.batch.id))
    return rows.map((row) => ({ ...row, figures: figures.get(row.batch.id) ?? emptyFigures() }))
  },

  async findBatch(batchId: string) {
    const [row] = await db
      .select({ batch: couponBatches, vendorName: vendors.businessName })
      .from(couponBatches)
      .leftJoin(vendors, eq(vendors.id, couponBatches.vendorId))
      .where(eq(couponBatches.id, batchId))
      .limit(1)
    if (!row) return undefined
    const figures = await figuresFor([batchId])
    return { ...row, figures: figures.get(batchId) ?? emptyFigures() }
  },

  /** How customers added the batch's coupons: QR link, typed, camera. */
  async channelCounts(batchId: string) {
    const rows = await db
      .select({ channel: couponRedemptions.channel, count: sql<number>`count(*)::int` })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.batchId, batchId))
      .groupBy(couponRedemptions.channel)
    return Object.fromEntries(rows.map((row) => [row.channel, Number(row.count)])) as Partial<Record<RedeemChannel, number>>
  },

  /** A batch's codes in print order: what re-derives each, and where it stands. */
  listCodes(batchId: string) {
    return db
      .select({
        id: couponCodes.id,
        seq: couponCodes.seq,
        variant: couponCodes.variant,
        codeHash: couponCodes.codeHash,
        suffix: couponCodes.suffix,
        scanCount: couponCodes.scanCount,
        redeemedAt: couponCodes.redeemedAt,
        voidedAt: couponCodes.voidedAt,
      })
      .from(couponCodes)
      .where(eq(couponCodes.batchId, batchId))
      .orderBy(asc(couponCodes.seq))
  },

  /** A batch's redemptions, newest first, with the customer and the booking that used it. */
  async listRedemptions(batchId: string, limit: number) {
    return db
      .select({
        id: couponRedemptions.id,
        createdAt: couponRedemptions.createdAt,
        channel: couponRedemptions.channel,
        kind: couponRedemptions.kind,
        stamps: couponRedemptions.stamps,
        cancelledAt: couponRedemptions.cancelledAt,
        cancelledBy: couponRedemptions.cancelledBy,
        suffix: couponCodes.suffix,
        userId: couponRedemptions.userId,
        customerName: users.name,
        customerPhone: users.phone,
        voucherCode: discounts.code,
        voucherEndsAt: discounts.endsAt,
        voucherActive: discounts.isActive,
        heldBookingId: heldBookingOf(couponRedemptions.discountId),
        booking: sql<{ id: string; amount: string; discount: string; at: string } | null>`(
          select json_build_object('id', bookings.id, 'amount', bookings.amount::text, 'discount', dr.discount_amount::text, 'at', bookings.created_at)
            from discount_redemptions dr
            join bookings on bookings.id = dr.booking_id
            join payments on payments.booking_id = bookings.id
           where dr.discount_id = ${couponRedemptions.discountId} and ${DISCOUNT_REALIZED}
           order by bookings.created_at desc
           limit 1)`,
      })
      .from(couponRedemptions)
      .innerJoin(couponCodes, eq(couponCodes.id, couponRedemptions.codeId))
      .leftJoin(users, eq(users.id, couponRedemptions.userId))
      .leftJoin(discounts, eq(discounts.id, couponRedemptions.discountId))
      .where(eq(couponRedemptions.batchId, batchId))
      .orderBy(desc(couponRedemptions.createdAt))
      .limit(limit)
  },

  /**
   * Voids a batch: no code of it can be added any more. With
   * `cancelUnspent`, vouchers customers added but have not spent are
   * cancelled too (their promo code switched off); spent ones stay spent.
   */
  async voidBatch(input: {
    batchId: string
    actorName: string
    actorSub: string
    reason: string
    cancelUnspent: boolean
    now: Date
  }): Promise<{ kind: 'not_found' } | { kind: 'already' } | { kind: 'voided'; cancelled: number }> {
    return db.transaction(async (tx) => {
      const [batch] = await tx.select().from(couponBatches).where(eq(couponBatches.id, input.batchId)).for('update')
      if (!batch) return { kind: 'not_found' as const }
      if (batch.voidedAt) return { kind: 'already' as const }
      await tx
        .update(couponBatches)
        .set({ voidedAt: input.now, voidedBy: input.actorName, voidReason: input.reason })
        .where(eq(couponBatches.id, batch.id))
      const cancelled = input.cancelUnspent
        ? await cancelUnspent(tx, eq(couponRedemptions.batchId, batch.id), input)
        : 0
      await tx.insert(adminAuditLog).values({
        action: 'coupon_batch_voided',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { batchId: batch.id, name: batch.name, cancelledVouchers: cancelled },
        detail: { reason: input.reason, cancelUnspent: input.cancelUnspent },
      })
      return { kind: 'voided' as const, cancelled }
    })
  },

  /** Voids one code of a batch (found by its hash), and cancels its unspent vouchers. */
  async voidCode(input: {
    batchId: string
    codeHash: string
    actorName: string
    actorSub: string
    reason: string
    now: Date
  }): Promise<{ kind: 'not_found' } | { kind: 'already' } | { kind: 'voided'; suffix: string; cancelled: number }> {
    return db.transaction(async (tx) => {
      const [code] = await tx
        .select()
        .from(couponCodes)
        .where(and(eq(couponCodes.batchId, input.batchId), eq(couponCodes.codeHash, input.codeHash)))
        .for('update')
      if (!code) return { kind: 'not_found' as const }
      if (code.voidedAt) return { kind: 'already' as const }
      await tx
        .update(couponCodes)
        .set({ voidedAt: input.now, voidedBy: input.actorName, voidReason: input.reason })
        .where(eq(couponCodes.id, code.id))
      const cancelled = await cancelUnspent(tx, eq(couponRedemptions.codeId, code.id), input)
      await tx.insert(adminAuditLog).values({
        action: 'coupon_code_voided',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { batchId: input.batchId, codeId: code.id, suffix: code.suffix, cancelledVouchers: cancelled },
        detail: { reason: input.reason },
      })
      return { kind: 'voided' as const, suffix: code.suffix, cancelled }
    })
  },
}

/**
 * Cancels the not-yet-spent vouchers among `where`'s redemptions and
 * switches their promo codes off. A voucher a live booking holds stays:
 * the customer already booked with it.
 */
async function cancelUnspent(tx: AnyTx, where: SQL | undefined, input: { actorName: string; reason: string; now: Date }) {
  const rows = await tx
    .update(couponRedemptions)
    .set({ cancelledAt: input.now, cancelledBy: input.actorName, cancelReason: input.reason })
    .where(
      and(
        where,
        isNull(couponRedemptions.cancelledAt),
        eq(couponRedemptions.kind, 'voucher'),
        sql`${heldBookingOf(couponRedemptions.discountId)} is null`
      )
    )
    .returning({ discountId: couponRedemptions.discountId })
  const ids = rows.map((row) => row.discountId).filter((id): id is string => id !== null)
  if (ids.length > 0) await tx.update(discounts).set({ isActive: false }).where(inArray(discounts.id, ids))
  return rows.length
}

