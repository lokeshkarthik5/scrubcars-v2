import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import {
  EXPIRING_SOON_DAYS,
  GIFT_BUY_DESIGNS,
  GIFT_CHECKOUT_MINUTES,
  GIFT_DAILY_LIMIT,
  GIFT_MAX_AMOUNT,
  GIFT_MIN_AMOUNT,
  GIFT_PRESET_AMOUNTS,
  GIFT_VALID_MONTHS,
  canIssueLink,
  codeAttemptAllowed,
  dailyLimitLeft,
  formatGiftCode,
  giftAmountRefusal,
  giftCodeHash,
  giftState,
  ipKey,
  newGiftCode,
  normalizeGiftCode,
  paise,
  rupees,
} from '../../lib/gift-credit.js'
import { istDateKey, istMidnight } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { createRazorpayOrder, verifyPaymentSignature } from '../../lib/razorpay.js'
import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { giftsRepository, type GiftRecord } from './gifts.repository.js'
import type { BuyGiftInput, CancelGiftInput, VerifyGiftInput } from './gifts.validation.js'

const log = logger.child({ module: 'gifts' })

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** "G-000123": how a gift purchase is referred to (receipt line, admin, support). */
export function formatGiftNumber(number: number): string {
  return `G-${String(number).padStart(6, '0')}`
}

/** The first word of a name: all the recipient is told about who sent it. */
function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'Someone'
}

/** The buyer's view of a gift they bought. Never the code (only a fresh link shows one). */
export function toSentGift(gift: GiftRecord, now: Date) {
  return {
    id: gift.id,
    number: formatGiftNumber(gift.number),
    amount: rupees(paise(gift.amount)),
    recipientName: gift.recipientName,
    message: gift.message,
    design: gift.design,
    state: giftState(gift, now),
    paidAt: gift.paidAt?.toISOString() ?? null,
    expiresAt: gift.expiresAt?.toISOString() ?? null,
    redeemedAt: gift.redeemedAt?.toISOString() ?? null,
    /** Whether a link was made (the buyer can make a new one while it can be redeemed). */
    linkMade: gift.codeHash !== null,
    canMakeLink: canIssueLink(gift, now),
    /** The Razorpay payment id: the buyer's evidence of the purchase. */
    paymentId: gift.gatewayPaymentId,
  }
}

/** What whoever holds the code sees on /gift/<code>. */
function toPublicGift(gift: GiftRecord, buyerName: string | null | undefined, code: string, now: Date) {
  const state = giftState(gift, now)
  return {
    amount: rupees(paise(gift.amount)),
    recipientName: gift.recipientName,
    message: gift.message,
    design: gift.design,
    fromName: firstName(buyerName),
    state: state === 'pending' ? ('cancelled' as const) : state,
    expiresAt: gift.expiresAt?.toISOString() ?? null,
    code: formatGiftCode(code),
  }
}

function notFound() {
  return new AppError(404, "That gift code isn't right. Check it and try again.", 'GIFT_NOT_FOUND')
}

function tooManyTries() {
  return new AppError(
    429,
    'Too many wrong gift codes. Please wait an hour and try again.',
    'GIFT_CODE_RATE_LIMIT',
    { retryAfterSeconds: 3600 }
  )
}

/**
 * Wrong codes are counted per network address (hashed) and, when signed
 * in, per customer; past the limit nothing is looked up at all, so guessing
 * is capped at a few dozen tries an hour on top of a ~79-bit code.
 */
async function guardAttempt(userId: string | null, ip: string, now: Date) {
  const counts = await giftsRepository.countRecentFailures({
    userId,
    ipKey: ipKey(ip),
    since: new Date(now.getTime() - HOUR_MS),
  })
  if (!codeAttemptAllowed(counts)) {
    log.warn({ userId, ipFailures: counts.ipFailures, userFailures: counts.userFailures }, 'gift:code_rate_limited')
    throw tooManyTries()
  }
}

/** Finds a gift by a typed or linked code, counting a wrong one. */
async function findByCode(rawCode: string, userId: string | null, ip: string, now: Date) {
  await guardAttempt(userId, ip, now)
  const code = normalizeGiftCode(rawCode)
  const gift = code ? await giftsRepository.findByCodeHash(giftCodeHash(code)) : undefined
  if (!code || !gift) {
    await giftsRepository.recordFailure({ userId, ipKey: ipKey(ip) })
    throw notFound()
  }
  return { gift, code }
}

const REDEEM_REFUSALS = {
  pending: () => new AppError(409, "This gift hasn't been paid for yet.", 'GIFT_NOT_PAID'),
  redeemed: () => new AppError(409, 'This gift has already been redeemed.', 'GIFT_ALREADY_REDEEMED'),
  expired: () => new AppError(409, 'This gift has expired.', 'GIFT_EXPIRED'),
  cancelled: () => new AppError(409, 'This gift was cancelled.', 'GIFT_CANCELLED'),
} as const

async function ownGift(userId: string, giftId: string) {
  const gift = await giftsRepository.findById(giftId)
  // Anyone else's gift is the same 404 as one that does not exist.
  if (!gift || gift.buyerId !== userId) {
    throw new AppError(404, 'Gift not found', 'GIFT_NOT_FOUND')
  }
  return gift
}

/** What the money landing did, for the verify call and the webhook. */
async function settle(input: { gift: GiftRecord; orderId: string | null; paymentId: string; now: Date }) {
  const paid = await giftsRepository.markPaid({
    giftId: input.gift.id,
    orderId: input.orderId,
    paymentId: input.paymentId,
    paidAt: input.now,
  })
  if (paid) {
    log.info({ giftId: paid.id, number: paid.number, amount: paid.amount, paymentId: input.paymentId }, 'gift:paid')
    return paid
  }
  // Not pending any more. The same payment again (the app and the webhook
  // both arrive) is fine; any other payment paid for nothing.
  const current = (await giftsRepository.findById(input.gift.id))!
  if (current.gatewayPaymentId !== input.paymentId) {
    const why = current.status === 'cancelled' && current.gatewayPaymentId === null ? 'cancelled' : 'already_paid'
    log.error({ giftId: current.id, paymentId: input.paymentId, why }, 'gift:stray_payment_refund_due')
    alertOps({
      kind: 'gift_payment_stray',
      giftNumber: formatGiftNumber(current.number),
      paymentId: input.paymentId,
      amount: current.amount,
      why,
    })
  }
  return current
}

export const giftsService = {
  /** What the apps need to show gifts at all. Always answers, on or off. */
  config() {
    return {
      enabled: env.giftsEnabled,
      presets: [...GIFT_PRESET_AMOUNTS],
      min: GIFT_MIN_AMOUNT,
      max: GIFT_MAX_AMOUNT,
      dailyLimit: GIFT_DAILY_LIMIT,
      validMonths: GIFT_VALID_MONTHS,
      designs: [...GIFT_BUY_DESIGNS],
    }
  },

  /**
   * Opens a gift checkout: the gift row (pending) and its Razorpay order.
   * Like a booking checkout, an abandoned one leaves nothing that matters: a
   * pending gift has no code and counts towards the day's limit only for
   * GIFT_CHECKOUT_MINUTES.
   */
  async startPurchase(userId: string, input: BuyGiftInput, now = new Date()) {
    const refusal = giftAmountRefusal(input.amount)
    if (refusal) {
      throw new AppError(400, `Choose a whole amount from ₹${GIFT_MIN_AMOUNT} to ₹${GIFT_MAX_AMOUNT.toLocaleString('en-IN')}`, 'GIFT_AMOUNT_INVALID')
    }
    const today = istDateKey(now)
    const created = await giftsRepository.createPending({
      buyerId: userId,
      amount: input.amount,
      recipientName: input.recipientName.trim(),
      message: input.message?.trim() || null,
      design: input.design,
      dayStart: istMidnight(today),
      pendingSince: new Date(now.getTime() - GIFT_CHECKOUT_MINUTES * 60 * 1000),
      limit: GIFT_DAILY_LIMIT,
    })
    if (created.kind === 'over_limit') {
      const left = dailyLimitLeft(created.boughtTodayPaise)
      throw new AppError(
        409,
        left > 0
          ? `You can buy up to ₹${GIFT_DAILY_LIMIT.toLocaleString('en-IN')} of gifts a day. ₹${left.toLocaleString('en-IN')} is left for today.`
          : `You've bought ₹${GIFT_DAILY_LIMIT.toLocaleString('en-IN')} of gifts today, the most for one day. Try again tomorrow.`,
        'GIFT_DAILY_LIMIT'
      )
    }

    const gift = created.gift
    const order = await createRazorpayOrder({ amount: gift.amount, receipt: gift.id, giftId: gift.id })
    await giftsRepository.setOrder(gift.id, order.orderId, order.gatewayMode)
    log.info({ giftId: gift.id, userId, amount: gift.amount, orderId: order.orderId }, 'gift:checkout_started')

    return {
      giftId: gift.id,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
    }
  },

  /** The app's success callback: the signature first, then the money is recorded once. */
  async verifyPurchase(userId: string, giftId: string, input: VerifyGiftInput, now = new Date()) {
    const gift = await ownGift(userId, giftId)
    if (gift.gatewayOrderId && gift.gatewayOrderId !== input.razorpayOrderId) {
      throw new AppError(400, 'Order mismatch', 'PAYMENT_ORDER_MISMATCH')
    }
    const valid = verifyPaymentSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    })
    if (!valid) {
      log.warn({ giftId, orderId: input.razorpayOrderId }, 'gift:invalid_signature')
      throw new AppError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
    }
    const settled = await settle({ gift, orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, now })
    return { gift: toSentGift(settled, now) }
  },

  /** The webhook's way in: the order's notes, or the order id, name the gift. */
  async giftIdForOrder(orderId: string): Promise<string | null> {
    return (await giftsRepository.findByOrderId(orderId))?.id ?? null
  },

  async settleFromWebhook(input: { giftId: string; orderId?: string; paymentId: string }, now = new Date()) {
    const gift = await giftsRepository.findById(input.giftId)
    if (!gift) {
      log.warn({ giftId: input.giftId, paymentId: input.paymentId }, 'gift:webhook_gift_not_found')
      return null
    }
    return settle({ gift, orderId: input.orderId ?? null, paymentId: input.paymentId, now })
  },

  async getMine(userId: string, giftId: string, now = new Date()) {
    return { gift: toSentGift(await ownGift(userId, giftId), now) }
  },

  async listMine(userId: string, now = new Date()) {
    const rows = await giftsRepository.listForBuyer(userId, 50)
    return { gifts: rows.map((gift) => toSentGift(gift, now)) }
  },

  /**
   * A (new) link for the buyer to share. The code is made here and shown
   * only in this answer; its hash replaces the last one, so an older link
   * stops working. Only while the gift can still be redeemed.
   */
  async issueLink(userId: string, giftId: string, now = new Date()) {
    const gift = await ownGift(userId, giftId)
    if (!canIssueLink(gift, now)) {
      const state = giftState(gift, now)
      if (state === 'pending') throw REDEEM_REFUSALS.pending()
      if (state === 'redeemed') throw REDEEM_REFUSALS.redeemed()
      if (state === 'expired') throw REDEEM_REFUSALS.expired()
      throw REDEEM_REFUSALS.cancelled()
    }
    const code = newGiftCode()
    const updated = await giftsRepository.setCode({ giftId, buyerId: userId, codeHash: giftCodeHash(code), now })
    if (!updated) throw new AppError(409, 'This gift changed. Refresh and try again.', 'GIFT_STATE_CHANGED')
    log.info({ giftId, linksIssued: updated.linksIssued }, 'gift:link_issued')
    return { code: formatGiftCode(code), path: `/gift/${code}` }
  },

  /** Whoever holds the code: the card, the amount and whether it can be redeemed. */
  async lookup(rawCode: string, viewer: { userId: string | null; ip: string }, now = new Date()) {
    const { gift, code } = await findByCode(rawCode, viewer.userId, viewer.ip, now)
    const buyer = await giftsRepository.findBuyerName(gift.buyerId)
    return { gift: toPublicGift(gift, buyer?.name, code, now) }
  },

  /** A signed-in customer turns the gift into Detlio credit, once. */
  async redeem(userId: string, rawCode: string, ip: string, now = new Date()) {
    const { gift } = await findByCode(rawCode, userId, ip, now)
    const result = await giftsRepository.redeemGift({ giftId: gift.id, userId, now })
    if (result.kind === 'not_found') throw notFound()
    if (result.kind === 'refused') throw REDEEM_REFUSALS[result.refusal]()
    log.info({ giftId: gift.id, userId, amount: gift.amount, ownGift: gift.buyerId === userId }, 'gift:redeemed')
    return {
      amount: rupees(paise(result.gift.amount)),
      balance: rupees(result.balancePaise),
      expiresAt: result.gift.expiresAt?.toISOString() ?? null,
    }
  },

  /** The cron's clean-up of wrong-code rows older than a day. */
  purgeAttempts(now = new Date()) {
    return giftsRepository.purgeAttempts(new Date(now.getTime() - DAY_MS), 2000)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async summary(now = new Date()) {
    const soonBy = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS)
    const totals = await giftsRepository.totals(now, soonBy)
    const credit = await giftCreditService.outstanding(now)
    const money = (value: string | null | undefined) => rupees(paise(value))
    const unredeemed = money(totals?.unredeemedAmount)
    return {
      sold: { count: totals?.soldCount ?? 0, amount: money(totals?.soldAmount) },
      redeemed: { count: totals?.redeemedCount ?? 0, amount: money(totals?.redeemedAmount) },
      unredeemed: { count: totals?.unredeemedCount ?? 0, amount: unredeemed },
      expiringSoon: {
        gifts: { count: totals?.expiringCount ?? 0, amount: money(totals?.expiringAmount) },
        credit: credit.expiringSoon,
        days: EXPIRING_SOON_DAYS,
      },
      expired: { count: totals?.expiredCount ?? 0, amount: money(totals?.expiredAmount) },
      cancelled: { count: totals?.cancelledCount ?? 0, amount: money(totals?.cancelledAmount) },
      credit,
      /** What Detlio still owes in gifts and credit: unredeemed gifts plus credit balances. */
      liability: rupees(paise(unredeemed) + paise(credit.balance)),
    }
  },

  async listForAdmin(status: 'all' | 'available' | 'redeemed' | 'expired' | 'cancelled', now = new Date()) {
    const rows = await giftsRepository.listForAdmin({ status, now, limit: 200 })
    return {
      gifts: rows.map((row) => ({
        id: row.gift.id,
        number: formatGiftNumber(row.gift.number),
        amount: rupees(paise(row.gift.amount)),
        state: giftState(row.gift, now),
        design: row.gift.design,
        recipientName: row.gift.recipientName,
        buyer: { id: row.gift.buyerId, name: row.buyerName, phone: row.buyerPhone },
        redeemer: row.gift.redeemedBy ? { id: row.gift.redeemedBy, name: row.redeemerName } : null,
        createdAt: row.gift.createdAt.toISOString(),
        paidAt: row.gift.paidAt?.toISOString() ?? null,
        expiresAt: row.gift.expiresAt?.toISOString() ?? null,
        redeemedAt: row.gift.redeemedAt?.toISOString() ?? null,
        cancelledAt: row.gift.cancelledAt?.toISOString() ?? null,
        cancelledBy: row.gift.cancelledBy,
        cancelReason: row.gift.cancelReason,
        paymentId: row.gift.gatewayPaymentId,
        gatewayMode: row.gift.gatewayMode,
      })),
    }
  },

  async cancel(giftId: string, input: CancelGiftInput, actorSub: string, now = new Date()) {
    const result = await giftsRepository.cancel({
      giftId,
      actorName: input.actorName.trim(),
      actorSub,
      reason: input.reason.trim(),
      now,
    })
    if (result.kind === 'not_found') throw new AppError(404, 'Gift not found', 'GIFT_NOT_FOUND')
    if (result.kind === 'refused') {
      throw result.status === 'redeemed'
        ? new AppError(409, 'This gift was already redeemed; adjust the customer\'s credit instead.', 'GIFT_ALREADY_REDEEMED')
        : new AppError(409, 'This gift is already cancelled.', 'GIFT_CANCELLED')
    }
    log.info({ giftId, actorName: input.actorName }, 'gift:cancelled')
    return { gift: toSentGift(result.gift, now) }
  },

  /** Whether the account bought or redeemed a gift (DELETE /users/me refuses it then). */
  hasGiftRecords(userId: string) {
    return giftsRepository.hasGifts(userId)
  },
}
