import { randomUUID } from 'node:crypto'
import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { maskPhone } from '../../lib/rewards.js'
import {
  COUPON_LIMITS,
  REDEEM_REFUSAL_ANSWERS,
  batchProblems,
  batchWindow,
  codeSuffix,
  couponAttemptAllowed,
  couponCodeHash,
  couponIpKey,
  couponKeys,
  couponLink,
  deriveCouponCode,
  formatCouponCode,
  newVoucherCode,
  offerConditions,
  offerTitle,
  parseCouponCode,
  publicCouponState,
  voucherCategory,
  voucherState,
  type CouponKeys,
  type CouponOffer,
  type RedeemChannel,
} from '../../lib/coupons.js'
import { discountsRepository } from '../discounts/discounts.repository.js'
import { announceRewards } from '../rewards/rewards.announce.js'
import { currentSettings, rewardsLive } from '../rewards/rewards.settings.js'
import { couponsRepository, type BatchRow } from './coupons.repository.js'
import type { CreateBatchInput, RedeemCouponInput, VoidBatchInput, VoidCodeInput } from './coupons.validation.js'

const log = logger.child({ module: 'coupons' })

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** Coupons listed to a customer (newest first). */
const MY_COUPONS_LIMIT = 50
/** Redemptions listed per batch in admin (newest first). */
const REDEMPTIONS_LIMIT = 1000

let cachedKeys: { secret: string; keys: CouponKeys } | null = null

/** The keys under the coupon secret in force (COUPON_SECRET, else JWT_SECRET). */
function keys(): CouponKeys {
  const secret = env.couponSecret ?? env.jwtSecret
  if (!cachedKeys || cachedKeys.secret !== secret) cachedKeys = { secret, keys: couponKeys(secret) }
  return cachedKeys.keys
}

const num = (value: string | null): number | null => (value === null ? null : Number(value))

/** A batch's reward and conditions, as the words read them. */
export function offerOf(batch: BatchRow, vendorName: string | null): CouponOffer {
  return {
    reward: batch.reward,
    amountOff: num(batch.amountOff),
    percentOff: num(batch.percentOff),
    maxDiscount: num(batch.maxDiscount),
    stamps: batch.stamps,
    minOrder: num(batch.minOrderAmount),
    serviceCategory: voucherCategory(batch.reward, batch.serviceCategory),
    vendorName,
    newCustomersOnly: batch.newCustomersOnly,
  }
}

/** The words and dates any coupon payload carries. Never the campaign's name or location (the team's own). */
function offerView(batch: BatchRow, vendorName: string | null) {
  const offer = offerOf(batch, vendorName)
  return {
    reward: batch.reward,
    title: offerTitle(offer),
    conditions: offerConditions(offer),
    /** For the ticket's figure: ₹ off (or a free wash's ceiling) and % off. */
    offAmount: offer.amountOff,
    offPercent: offer.percentOff,
    stamps: batch.stamps,
    validFrom: batch.validFrom.toISOString(),
    validUntil: batch.validUntil.toISOString(),
  }
}

function notFound() {
  return new AppError(404, "That coupon code isn't right. Check it and try again.", 'COUPON_NOT_FOUND')
}

function tooManyTries() {
  return new AppError(429, 'Too many wrong coupon codes. Please wait an hour and try again.', 'COUPON_CODE_RATE_LIMIT', {
    retryAfterSeconds: 3600,
  })
}

/**
 * Wrong codes are counted per network address (hashed) and, when signed
 * in, per customer; past the limit nothing is looked up at all.
 */
async function guardAttempt(userId: string | null, ip: string, now: Date) {
  const counts = await couponsRepository.countRecentFailures({
    userId,
    ipKey: couponIpKey(ip),
    since: new Date(now.getTime() - HOUR_MS),
  })
  if (!couponAttemptAllowed(counts)) {
    log.warn({ userId, ipFailures: counts.ipFailures, userFailures: counts.userFailures }, 'coupon:code_rate_limited')
    throw tooManyTries()
  }
}

/**
 * A code as typed or scanned, to its stored row. A typo (the check
 * character is wrong) or a code of the wrong shape never reaches the
 * database and is not counted: it can't be anyone's code. A well-formed
 * code nobody printed is counted as a wrong guess.
 */
async function findByCode(rawCode: string, userId: string | null, ip: string, now: Date) {
  await guardAttempt(userId, ip, now)
  const parsed = parseCouponCode(rawCode)
  if (!parsed.ok) {
    if (parsed.reason === 'typo') {
      throw new AppError(400, "That code doesn't look right. Check each character and try again.", 'COUPON_CODE_TYPO')
    }
    throw notFound()
  }
  const found = await couponsRepository.findByHash(couponCodeHash(keys().lookupKey, parsed.code))
  if (!found) {
    await couponsRepository.recordFailure({ userId, ipKey: couponIpKey(ip) })
    throw notFound()
  }
  return { ...found, raw: parsed.code }
}

type MyCouponRow = Awaited<ReturnType<typeof couponsRepository.listForUser>>[number]

/** A coupon the customer added. The voucher's code only while it can be used. */
function toMyCoupon(row: MyCouponRow, now: Date) {
  const view = offerView(row.batch, row.vendorName)
  if (row.kind === 'stamps') {
    return {
      id: row.id,
      kind: 'stamps' as const,
      ...view,
      vendorId: null,
      state: 'added' as const,
      code: null,
      expiresAt: null,
      addedAt: row.createdAt.toISOString(),
    }
  }
  const state = voucherState({
    cancelledAt: row.cancelledAt,
    isActive: row.voucherActive ?? false,
    held: row.heldBookingId !== null,
    endsAt: row.voucherEndsAt ?? row.batch.validUntil,
    now,
  })
  return {
    id: row.id,
    kind: 'voucher' as const,
    ...view,
    /** The garage a voucher is limited to, so "Book" can open it. */
    vendorId: row.batch.vendorId,
    state,
    code: state === 'ready' ? row.voucherCode : null,
    expiresAt: (row.voucherEndsAt ?? row.batch.validUntil).toISOString(),
    addedAt: row.createdAt.toISOString(),
  }
}

type AdminBatchRow = NonNullable<Awaited<ReturnType<typeof couponsRepository.findBatch>>>

function toAdminBatch(row: AdminBatchRow) {
  const { batch } = row
  return {
    id: batch.id,
    name: batch.name,
    location: batch.location,
    kind: batch.kind,
    ...offerView(batch, row.vendorName),
    amountOff: batch.amountOff,
    percentOff: batch.percentOff,
    maxDiscount: batch.maxDiscount,
    minOrder: batch.minOrderAmount,
    serviceCategory: voucherCategory(batch.reward, batch.serviceCategory),
    vendor: batch.vendorId ? { id: batch.vendorId, name: row.vendorName ?? 'A garage' } : null,
    newCustomersOnly: batch.newCustomersOnly,
    /** IST dates, both included. */
    validFromDate: istDateKey(batch.validFrom),
    validToDate: istDateKey(batch.validUntil),
    codeCount: batch.codeCount,
    maxRedemptions: batch.maxRedemptions,
    createdBy: batch.createdByName,
    createdAt: batch.createdAt.toISOString(),
    voided: batch.voidedAt ? { at: batch.voidedAt.toISOString(), by: batch.voidedBy, reason: batch.voidReason } : null,
    /** False when the coupon secret changed since: the sheet can't be printed again. */
    canReprint: batch.keyId === keys().keyId,
    figures: row.figures,
  }
}

export const couponsService = {
  // ─── Public: the /c/<code> page ────────────────────────────────────────────

  /**
   * What whoever holds the code sees: the offer, its conditions and dates,
   * and whether they can add it. Each look is a scan in the batch's
   * figures. Signed in, "added" when it is already theirs.
   */
  async lookup(rawCode: string, viewer: { userId: string | null; ip: string }, now = new Date()) {
    const found = await findByCode(rawCode, viewer.userId, viewer.ip, now)
    await couponsRepository.recordScan(found.code.id, now)
    const facts = await couponsRepository.codeFacts(found.code.id, viewer.userId)
    const state = publicCouponState({
      batch: found.batch,
      code: found.code,
      viewerId: viewer.userId,
      viewerAdded: facts.viewerAdded,
      redemptions: facts.redemptions,
      now,
    })
    return {
      coupon: {
        code: formatCouponCode(found.raw),
        ...offerView(found.batch, found.vendorName),
        newCustomersOnly: found.batch.newCustomersOnly,
        state,
      },
    }
  },

  // ─── Customer ──────────────────────────────────────────────────────────────

  /**
   * Adds a coupon to the session's customer: a personal one-use voucher, or
   * bonus stamps on the Shine Card. Every refusal is the customer's own
   * sentence (lib/coupons.ts REDEEM_REFUSAL_ANSWERS).
   */
  async redeem(userId: string, input: RedeemCouponInput, ip: string, now = new Date()) {
    const found = await findByCode(input.code, userId, ip, now)
    const { batch } = found
    const stamps = batch.reward === 'stamps'
    const live = stamps ? await rewardsLive() : false
    const settings = stamps && live ? (await currentSettings()).settings : null
    const hasPaidBooking = batch.newCustomersOnly ? await discountsRepository.hasKeptBooking(userId) : false

    const result = await couponsRepository.redeem({
      codeId: found.code.id,
      userId,
      channel: input.channel as RedeemChannel,
      now,
      rewardsLive: live,
      hasPaidBooking,
      settings,
      makeVoucherCode: () => newVoucherCode(),
    })
    if (result.kind === 'not_found') throw notFound()
    if (result.kind === 'refused') {
      const answer = REDEEM_REFUSAL_ANSWERS[result.refusal]
      log.info({ userId, batchId: batch.id, refusal: result.refusal }, 'coupon:redeem_refused')
      throw new AppError(answer.status, answer.message, answer.code)
    }

    log.info(
      { userId, batchId: batch.id, codeId: found.code.id, redemptionId: result.redemptionId, channel: input.channel, reward: batch.reward },
      'coupon:redeemed'
    )
    // A card filled by bonus stamps became a voucher: told like any other.
    if (settings && (result.issued.length > 0 || result.capAlert)) announceRewards(result.issued, result.capAlert, settings)

    const [row] = (await couponsRepository.listForUser(userId, MY_COUPONS_LIMIT)).filter((r) => r.id === result.redemptionId)
    return { coupon: row ? toMyCoupon(row, now) : null }
  },

  /** The customer's coupons, newest first. */
  async listMine(userId: string, now = new Date()) {
    const rows = await couponsRepository.listForUser(userId, MY_COUPONS_LIMIT)
    return { coupons: rows.map((row) => toMyCoupon(row, now)) }
  },

  /** The cron's clean-up of wrong-code rows over a day old. */
  purgeAttempts(now = new Date()) {
    return couponsRepository.purgeAttempts(new Date(now.getTime() - DAY_MS), 2000)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async adminConfig() {
    return {
      rewardsLive: await rewardsLive(),
      limits: COUPON_LIMITS,
      siteUrl: env.couponSiteUrl,
      /** False while codes are derived from JWT_SECRET (COUPON_SECRET unset). */
      ownSecret: env.couponSecret !== null,
    }
  },

  async listBatches() {
    const rows = await couponsRepository.listBatches(500)
    return { batches: rows.map(toAdminBatch) }
  },

  async getBatch(batchId: string) {
    const row = await couponsRepository.findBatch(batchId)
    if (!row) throw new AppError(404, 'Batch not found', 'COUPON_BATCH_NOT_FOUND')
    return { batch: toAdminBatch(row), channels: await couponsRepository.channelCounts(batchId) }
  },

  /**
   * A new batch and its codes. Checked as a whole first (batchProblems,
   * every problem in one answer); a garage must exist and be out of the Bin.
   */
  async createBatch(input: CreateBatchInput, actorSub: string, now = new Date()) {
    const live = await rewardsLive()
    const problems = batchProblems(
      {
        kind: input.kind,
        count: input.kind === 'shared' ? 1 : input.count,
        maxRedemptions: input.maxRedemptions,
        reward: input.reward,
        amountOff: input.amountOff,
        percentOff: input.percentOff,
        maxDiscount: input.maxDiscount,
        stamps: input.stamps,
        minOrder: input.minOrder,
        serviceCategory: input.serviceCategory,
        vendorId: input.vendorId,
        newCustomersOnly: input.newCustomersOnly,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
      { now, rewardsLive: live }
    )
    if (problems.length > 0) throw new AppError(400, problems.join(' '), 'COUPON_BATCH_INVALID')

    if (input.vendorId) {
      const vendor = await couponsRepository.findVendor(input.vendorId)
      if (!vendor || vendor.purgedAt) throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      if (vendor.deletedAt) throw new AppError(409, 'This garage is in the Bin.', 'VENDOR_IN_BIN')
    }

    const k = keys()
    const id = randomUUID()
    const window = batchWindow(input.validFrom, input.validTo)
    const money = (value: number | null) => (value === null ? null : value.toFixed(2))
    const reward = input.reward
    const batch = await couponsRepository.createBatch({
      batch: {
        id,
        name: input.name,
        location: input.location,
        kind: input.kind,
        reward,
        amountOff: reward === 'amount' || reward === 'free_wash' ? money(input.amountOff) : null,
        percentOff: reward === 'percent' ? money(input.percentOff) : null,
        maxDiscount: reward === 'percent' ? money(input.maxDiscount) : null,
        stamps: reward === 'stamps' ? input.stamps : null,
        minOrderAmount: reward === 'stamps' ? null : money(input.minOrder),
        vendorId: reward === 'stamps' ? null : input.vendorId,
        serviceCategory: reward === 'stamps' ? null : voucherCategory(reward, input.serviceCategory),
        newCustomersOnly: input.newCustomersOnly,
        validFrom: window.startsAt,
        validUntil: window.endsAt,
        codeCount: input.kind === 'shared' ? 1 : input.count,
        maxRedemptions: input.kind === 'shared' ? input.maxRedemptions : null,
        keyId: k.keyId,
        createdByName: input.actorName,
        createdBySub: actorSub,
        createdAt: now,
      },
      codeFor: (seq, variant) => {
        const code = deriveCouponCode(k.codeKey, id, seq, variant)
        return { codeHash: couponCodeHash(k.lookupKey, code), suffix: codeSuffix(code) }
      },
      actorSub,
    })
    log.info({ batchId: batch.id, kind: batch.kind, reward: batch.reward, codes: batch.codeCount }, 'coupon:batch_created')
    return this.getBatch(batch.id)
  },

  /**
   * The batch's codes for the print sheet and the CSV, re-derived from the
   * secret (never stored). Refused when the secret changed since the batch
   * was made, or a derived code does not match its stored hash: printing
   * codes that don't work would be worse than printing none.
   */
  async listCodes(batchId: string) {
    const row = await couponsRepository.findBatch(batchId)
    if (!row) throw new AppError(404, 'Batch not found', 'COUPON_BATCH_NOT_FOUND')
    const k = keys()
    const keyChanged = () =>
      new AppError(
        409,
        "This batch's codes were made under a different coupon secret, so they can't be printed again.",
        'COUPON_KEY_CHANGED'
      )
    if (row.batch.keyId !== k.keyId) throw keyChanged()
    const codes = await couponsRepository.listCodes(batchId)
    const out = codes.map((code) => {
      const raw = deriveCouponCode(k.codeKey, batchId, code.seq, code.variant)
      if (couponCodeHash(k.lookupKey, raw) !== code.codeHash) throw keyChanged()
      return {
        seq: code.seq + 1,
        code: formatCouponCode(raw),
        link: couponLink(env.couponSiteUrl, raw),
        scans: code.scanCount,
        state: code.voidedAt ? ('void' as const) : code.redeemedAt ? ('redeemed' as const) : code.scanCount > 0 ? ('scanned' as const) : ('new' as const),
      }
    })
    log.info({ batchId, codes: out.length }, 'coupon:codes_listed')
    return { batch: toAdminBatch(row), codes: out }
  },

  /** Who added the batch's coupons, how, and the booking that used each. Phones masked. */
  async listRedemptions(batchId: string, now = new Date()) {
    const row = await couponsRepository.findBatch(batchId)
    if (!row) throw new AppError(404, 'Batch not found', 'COUPON_BATCH_NOT_FOUND')
    const rows = await couponsRepository.listRedemptions(batchId, REDEMPTIONS_LIMIT)
    return {
      redemptions: rows.map((r) => ({
        id: r.id,
        addedAt: r.createdAt.toISOString(),
        channel: r.channel,
        kind: r.kind,
        stamps: r.stamps,
        codeSuffix: r.suffix,
        customer: r.userId ? { id: r.userId, name: r.customerName, phone: r.customerPhone ? maskPhone(r.customerPhone) : null } : null,
        state:
          r.kind === 'stamps'
            ? ('added' as const)
            : voucherState({
                cancelledAt: r.cancelledAt,
                isActive: r.voucherActive ?? false,
                held: r.heldBookingId !== null,
                endsAt: r.voucherEndsAt ?? row.batch.validUntil,
                now,
              }),
        cancelledBy: r.cancelledBy,
        booking: r.booking,
      })),
      location: row.batch.location,
    }
  },

  async voidBatch(batchId: string, input: VoidBatchInput, actorSub: string, now = new Date()) {
    const result = await couponsRepository.voidBatch({ batchId, ...input, actorSub, now })
    if (result.kind === 'not_found') throw new AppError(404, 'Batch not found', 'COUPON_BATCH_NOT_FOUND')
    if (result.kind === 'already') throw new AppError(409, 'This batch is already void.', 'COUPON_BATCH_VOID')
    log.info({ batchId, cancelled: result.cancelled }, 'coupon:batch_voided')
    return { ...(await this.getBatch(batchId)), cancelledVouchers: result.cancelled }
  },

  /** Voids one code of the batch, typed in full (only its hash is stored). */
  async voidCode(batchId: string, input: VoidCodeInput, actorSub: string, now = new Date()) {
    const parsed = parseCouponCode(input.code)
    if (!parsed.ok) {
      throw new AppError(400, "That code doesn't look right. Check each character.", 'COUPON_CODE_TYPO')
    }
    const result = await couponsRepository.voidCode({
      batchId,
      codeHash: couponCodeHash(keys().lookupKey, parsed.code),
      actorName: input.actorName,
      actorSub,
      reason: input.reason,
      now,
    })
    if (result.kind === 'not_found') throw new AppError(404, "That code isn't in this batch.", 'COUPON_CODE_NOT_IN_BATCH')
    if (result.kind === 'already') throw new AppError(409, 'This code is already void.', 'COUPON_CODE_VOID')
    log.info({ batchId, suffix: result.suffix, cancelled: result.cancelled }, 'coupon:code_voided')
    return { suffix: result.suffix, cancelledVouchers: result.cancelled }
  },
}
