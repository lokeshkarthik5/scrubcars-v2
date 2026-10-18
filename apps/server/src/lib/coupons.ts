/**
 * Printed coupons with QR codes (0056): the rules, pure, so each one has a
 * test. The team prints a batch (cards, flyers, a poster at a garage
 * counter); a customer scans the QR or types the short code, and the coupon
 * becomes a personal one-use voucher in their account (a Detlio-funded
 * promo code, `discounts.source = 'coupon'`), or bonus Shine stamps while
 * Detlio Rewards is live.
 *
 * The words customers read and the numbers the admin form needs are twinned
 * in packages/core/src/coupons.ts (coupons.parity.test.ts).
 *
 * ## Codes
 *
 * Ten characters from the 31-letter alphabet with no look-alikes (no 0/O,
 * no 1/I/L): nine drawn from an HMAC, then a check character, so a typo is
 * caught on the phone and on the server without a database read and is
 * never counted as a guess. Printed `DTL-7K4QM-92MXA`; "DTL" holds an L,
 * which the alphabet does not, so the prefix can never be part of a code.
 * About 44.6 bits: with every wrong code counted (10 an hour per account,
 * 30 per network address) guessing a live code is hopeless.
 *
 * **Stored**: only an HMAC of the code (`coupon_codes.code_hash`, for the
 * lookup) and its last four characters (for admin's lists). A code is not
 * kept, yet the team can print a batch's sheet again: every code is
 * **re-derived** from the batch's id, its number in the batch and the
 * coupon secret (`COUPON_SECRET`, or `JWT_SECRET` while that is unset).
 * Derivation rather than encryption: there is nothing to decrypt in the
 * database, so a copy of it gives neither the codes nor a way to test
 * guesses offline. The cost is that the secret must not change while
 * coupons are out; `key_id` on the batch says which secret made it, and a
 * batch made under another one is refused a reprint (409) rather than
 * printing codes that would not work.
 */
import { createHash, createHmac, randomInt } from 'node:crypto'
import { addDays, daysBetween, istDateKey, istMidnight } from './ist.js'
import { CATEGORY_LABELS, type ServiceCategory } from './categories.js'

// ─── Codes ───────────────────────────────────────────────────────────────────

/** 31 characters with no look-alikes, as gift codes use. */
export const COUPON_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** Random characters in a code. */
export const COUPON_CODE_BODY = 9
/** A whole code: the body and its check character. */
export const COUPON_CODE_LENGTH = COUPON_CODE_BODY + 1
/** Printed in front of every code. Never part of the code itself. */
export const COUPON_CODE_PREFIX = 'DTL'

/**
 * The check character: a weighted sum of the body, weights 1…9, mod 31.
 * 31 is prime and every weight is below it, so any single wrong character
 * and any swap of two different neighbours changes it.
 */
export function checkCharacter(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i += 1) {
    const value = COUPON_CODE_ALPHABET.indexOf(body[i]!)
    if (value < 0) throw new Error('coupon code: character outside the alphabet')
    sum += (i + 1) * value
  }
  return COUPON_CODE_ALPHABET[sum % COUPON_CODE_ALPHABET.length]!
}

/** Whether a code's last character is its body's check character. */
export function hasValidCheck(code: string): boolean {
  if (code.length !== COUPON_CODE_LENGTH) return false
  for (const char of code) if (!COUPON_CODE_ALPHABET.includes(char)) return false
  return checkCharacter(code.slice(0, COUPON_CODE_BODY)) === code[COUPON_CODE_BODY]
}

export type ParsedCode = { ok: true; code: string } | { ok: false; reason: 'malformed' | 'typo' }

/**
 * A typed, scanned or linked code as it is looked up: spaces and dashes
 * dropped, upper case, the "DTL" prefix taken off. `typo` when it has the
 * right shape but its check character does not match (one character read
 * wrong); `malformed` for anything else. Neither reaches the database.
 */
export function parseCouponCode(input: string): ParsedCode {
  let code = input.replace(/[\s-]/g, '').toUpperCase()
  if (code.length === COUPON_CODE_LENGTH + COUPON_CODE_PREFIX.length && code.startsWith(COUPON_CODE_PREFIX)) {
    code = code.slice(COUPON_CODE_PREFIX.length)
  }
  if (code.length !== COUPON_CODE_LENGTH) return { ok: false, reason: 'malformed' }
  for (const char of code) if (!COUPON_CODE_ALPHABET.includes(char)) return { ok: false, reason: 'malformed' }
  if (!hasValidCheck(code)) return { ok: false, reason: 'typo' }
  return { ok: true, code }
}

/** "DTL-7K4QM-92MXA": how a code is printed and read out. */
export function formatCouponCode(code: string): string {
  return `${COUPON_CODE_PREFIX}-${code.slice(0, 5)}-${code.slice(5)}`
}

/** The last four characters: all admin's lists show of a code. */
export function codeSuffix(code: string): string {
  return code.slice(-4)
}

/** The address a coupon's QR holds: the customer app's /c/<code> page. */
export function couponLink(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/c/${code}`
}

export interface CouponKeys {
  /** Derives codes from (batch, number, variant). */
  codeKey: Buffer
  /** Hashes a code for the lookup. */
  lookupKey: Buffer
  /** Names the secret, so a batch made under another one is recognised. */
  keyId: string
}

/** The two keys and their id, each a separate HMAC of the secret. */
export function couponKeys(secret: string): CouponKeys {
  const derive = (purpose: string) => createHmac('sha256', secret).update(`detlio-coupon:${purpose}`).digest()
  return {
    codeKey: derive('codes'),
    lookupKey: derive('lookup'),
    keyId: derive('key-id').toString('hex').slice(0, 16),
  }
}

/**
 * Code number `seq` of a batch. `variant` is 0 unless that code clashed with
 * one already stored (any batch), when the next variant is tried and kept
 * on the code's row, so the same code comes out every time.
 *
 * Each character takes one HMAC byte below 248 (8 × 31), so every character
 * is equally likely; a run that rejects too many bytes asks for more.
 */
export function deriveCouponCode(codeKey: Buffer, batchId: string, seq: number, variant = 0): string {
  let body = ''
  for (let block = 0; body.length < COUPON_CODE_BODY; block += 1) {
    const bytes = createHmac('sha256', codeKey).update(`${batchId}:${seq}:${variant}:${block}`).digest()
    for (const byte of bytes) {
      if (byte >= 248) continue
      body += COUPON_CODE_ALPHABET[byte % 31]
      if (body.length === COUPON_CODE_BODY) break
    }
  }
  return body + checkCharacter(body)
}

/** What is stored for a code: a keyed hash, hex (64 characters). */
export function couponCodeHash(lookupKey: Buffer, code: string): string {
  return createHmac('sha256', lookupKey).update(code).digest('hex')
}

// ─── Guessing ────────────────────────────────────────────────────────────────

/** Wrong codes allowed per signed-in customer per hour, before 429. */
export const WRONG_CODES_PER_USER_HOUR = 10
/** Wrong codes allowed per network address per hour (lookups and redeems). */
export const WRONG_CODES_PER_IP_HOUR = 30

/** Whether another code may be tried, from the wrong ones in the last hour. */
export function couponAttemptAllowed(input: { userFailures: number | null; ipFailures: number }): boolean {
  if (input.userFailures !== null && input.userFailures >= WRONG_CODES_PER_USER_HOUR) return false
  return input.ipFailures < WRONG_CODES_PER_IP_HOUR
}

/** A network address as it is counted: hashed, so the attempts table never holds one. */
export function couponIpKey(ip: string): string {
  return createHash('sha256').update(`detlio-coupon-ip:${ip}`).digest('hex').slice(0, 32)
}

// ─── Batches ─────────────────────────────────────────────────────────────────

/** Unique: N codes, each once ever. Shared: one code, once per customer. */
export const COUPON_KINDS = ['unique', 'shared'] as const
export type CouponKind = (typeof COUPON_KINDS)[number]

/** ₹ off, % off with a cap, a free car wash up to ₹X, or bonus Shine stamps. */
export const COUPON_REWARDS = ['amount', 'percent', 'free_wash', 'stamps'] as const
export type CouponReward = (typeof COUPON_REWARDS)[number]

/** How a coupon was added: the QR's link, typed in Profile, or scanned there. */
export const REDEEM_CHANNELS = ['link', 'typed', 'camera'] as const
export type RedeemChannel = (typeof REDEEM_CHANNELS)[number]

export const COUPON_LIMITS = {
  /** Codes in one unique batch. */
  maxCodes: 5000,
  /** A shared code's optional cap on customers. */
  maxSharedRedemptions: 100000,
  /** ₹ off, a free wash's ceiling and a percentage's cap, in rupees. */
  maxAmount: 2000,
  /** % off. */
  maxPercent: 90,
  /** Bonus stamps (as many as a manual adjustment). */
  maxStamps: 5,
  /** The minimum booking, rupees. */
  maxMinOrder: 10000,
  /** From the first to the last valid day, both included. */
  maxValidDays: 366,
} as const

export interface BatchInput {
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
  /** IST dates, "YYYY-MM-DD", both included. */
  validFrom: string
  validTo: string
}

const isWhole = (value: number | null, min: number, max: number) =>
  value !== null && Number.isInteger(value) && value >= min && value <= max

/**
 * Everything wrong with a batch, in plain words (empty when it is fine).
 * Stamps need Detlio Rewards live, and are about the account, not a
 * booking, so they take no minimum, garage or category. A free wash is a
 * car wash by definition.
 */
export function batchProblems(input: BatchInput, context: { now: Date; rewardsLive: boolean }): string[] {
  const problems: string[] = []
  const L = COUPON_LIMITS

  if (input.kind === 'unique' && !isWhole(input.count, 1, L.maxCodes)) {
    problems.push(`Print between 1 and ${L.maxCodes.toLocaleString('en-IN')} codes.`)
  }
  if (input.kind === 'unique' && input.maxRedemptions !== null) {
    problems.push('A cap on customers is only for a shared code: each unique code is used once.')
  }
  if (input.kind === 'shared' && input.maxRedemptions !== null && !isWhole(input.maxRedemptions, 1, L.maxSharedRedemptions)) {
    problems.push(`The cap on customers is a whole number up to ${L.maxSharedRedemptions.toLocaleString('en-IN')}.`)
  }

  switch (input.reward) {
    case 'amount':
      if (!isWhole(input.amountOff, 1, L.maxAmount)) problems.push(`₹ off is a whole amount from ₹1 to ₹${L.maxAmount}.`)
      break
    case 'percent':
      if (!isWhole(input.percentOff, 1, L.maxPercent)) problems.push(`% off is a whole number from 1 to ${L.maxPercent}.`)
      if (!isWhole(input.maxDiscount, 1, L.maxAmount)) problems.push(`A % off needs a cap, from ₹1 to ₹${L.maxAmount}.`)
      break
    case 'free_wash':
      if (!isWhole(input.amountOff, 1, L.maxAmount)) problems.push(`Say what the free wash is worth, up to ₹${L.maxAmount}.`)
      if (input.serviceCategory !== null && input.serviceCategory !== 'car_wash') {
        problems.push('A free wash is for car wash services.')
      }
      break
    case 'stamps':
      if (!context.rewardsLive) problems.push('Bonus stamps need Detlio Rewards to be on.')
      if (!isWhole(input.stamps, 1, L.maxStamps)) problems.push(`Bonus stamps: 1 to ${L.maxStamps}.`)
      if (input.minOrder !== null || input.vendorId !== null || input.serviceCategory !== null) {
        problems.push('Bonus stamps go straight onto the Shine Card: no minimum, garage or service type.')
      }
      break
  }
  if (input.minOrder !== null && !isWhole(input.minOrder, 1, L.maxMinOrder)) {
    problems.push(`The minimum booking is a whole amount up to ₹${L.maxMinOrder.toLocaleString('en-IN')}.`)
  }

  const days = daysBetween(input.validFrom, input.validTo)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(input.validTo) || Number.isNaN(days)) {
    problems.push('Pick the first and last day it can be used.')
  } else if (days < 0) {
    problems.push('The last day comes before the first.')
  } else if (days + 1 > L.maxValidDays) {
    problems.push('A batch can run for a year at most.')
  } else if (input.validTo < istDateKey(context.now)) {
    problems.push('The last day has already passed.')
  }
  return problems
}

/** The instants a batch runs between: the first IST day's start to the last one's end. */
export function batchWindow(validFrom: string, validTo: string): { startsAt: Date; endsAt: Date } {
  return { startsAt: istMidnight(validFrom), endsAt: new Date(istMidnight(addDays(validTo, 1)).getTime() - 1) }
}

/**
 * The category a voucher is limited to: a free wash is always a car wash;
 * otherwise what the team chose, or none.
 */
export function voucherCategory(reward: CouponReward, chosen: ServiceCategory | null): ServiceCategory | null {
  return reward === 'free_wash' ? 'car_wash' : chosen
}

// ─── Redeeming ───────────────────────────────────────────────────────────────

export interface BatchForRules {
  kind: CouponKind
  reward: CouponReward
  validFrom: Date
  validUntil: Date
  voidedAt: Date | null
  maxRedemptions: number | null
  newCustomersOnly: boolean
}

export interface CodeForRules {
  voidedAt: Date | null
  redeemedBy: string | null
  redeemedAt: Date | null
}

export type RedeemRefusal =
  | 'void'
  | 'not_started'
  | 'expired'
  | 'already_added'
  | 'already_redeemed'
  | 'used_up'
  | 'rewards_off'
  | 'not_new'

/**
 * Why this customer can't add this coupon now, or null. In the order the
 * customer should hear it: a void or out-of-dates coupon first (nothing
 * else matters), then "you have it already", then "someone else used it",
 * then the cap, then the conditions about the customer.
 *
 * Judged again under the code's row lock with fresh counts, so two phones
 * racing for one unique code, or one customer tapping twice, add it once.
 */
export function redeemRefusal(input: {
  batch: BatchForRules
  code: CodeForRules
  userId: string
  /** This customer already added this code (any batch kind). */
  addedByUser: boolean
  /** Customers who added this code, for a shared code's cap. */
  redemptions: number
  hasPaidBooking: boolean
  rewardsLive: boolean
  now: Date
}): RedeemRefusal | null {
  const { batch, code, now } = input
  if (batch.voidedAt || code.voidedAt) return 'void'
  if (now < batch.validFrom) return 'not_started'
  if (now > batch.validUntil) return 'expired'
  if (input.addedByUser || (batch.kind === 'unique' && code.redeemedBy === input.userId)) return 'already_added'
  if (batch.kind === 'unique' && code.redeemedAt) return 'already_redeemed'
  if (batch.kind === 'shared' && batch.maxRedemptions !== null && input.redemptions >= batch.maxRedemptions) return 'used_up'
  if (batch.reward === 'stamps' && !input.rewardsLive) return 'rewards_off'
  if (batch.newCustomersOnly && input.hasPaidBooking) return 'not_new'
  return null
}

/** The sentence each refusal is to the customer, and its status. */
export const REDEEM_REFUSAL_ANSWERS: Record<RedeemRefusal, { status: 409; code: string; message: string }> = {
  void: { status: 409, code: 'COUPON_VOID', message: 'This coupon is no longer valid.' },
  not_started: { status: 409, code: 'COUPON_NOT_STARTED', message: "This coupon can't be used yet." },
  expired: { status: 409, code: 'COUPON_EXPIRED', message: 'This coupon has expired.' },
  already_added: { status: 409, code: 'COUPON_ALREADY_ADDED', message: "You've already added this coupon. It's in Profile → Coupons." },
  already_redeemed: { status: 409, code: 'COUPON_ALREADY_REDEEMED', message: 'This coupon has already been used.' },
  used_up: { status: 409, code: 'COUPON_USED_UP', message: 'This coupon has been fully claimed.' },
  rewards_off: { status: 409, code: 'COUPON_REWARDS_OFF', message: "Detlio Rewards is paused, so this coupon can't be added right now." },
  not_new: { status: 409, code: 'COUPON_NOT_NEW', message: 'This coupon is for your first booking on Detlio.' },
}

/** What a coupon is to whoever holds the code, on the /c/<code> page. */
export type PublicCouponState =
  | 'available'
  | 'added'
  | 'redeemed'
  | 'used_up'
  | 'expired'
  | 'not_started'
  | 'void'

export function publicCouponState(input: {
  batch: BatchForRules
  code: CodeForRules
  viewerId: string | null
  viewerAdded: boolean
  redemptions: number
  now: Date
}): PublicCouponState {
  const { batch, code, now } = input
  if (batch.voidedAt || code.voidedAt) return 'void'
  if (input.viewerAdded || (input.viewerId !== null && code.redeemedBy === input.viewerId)) return 'added'
  if (now > batch.validUntil) return 'expired'
  if (batch.kind === 'unique' && code.redeemedAt) return 'redeemed'
  if (batch.kind === 'shared' && batch.maxRedemptions !== null && input.redemptions >= batch.maxRedemptions) return 'used_up'
  if (now < batch.validFrom) return 'not_started'
  return 'available'
}

/** A voucher a coupon made, as its owner sees it. */
export type CouponVoucherState = 'ready' | 'used' | 'expired' | 'cancelled'

/**
 * Spent while a live booking (or a customer no-show) holds it — the same
 * DISCOUNT_HELD rule as checkout — so a cancelled booking gives it back
 * unless it lapsed meanwhile.
 */
export function voucherState(input: { cancelledAt: Date | null; isActive: boolean; held: boolean; endsAt: Date; now: Date }): CouponVoucherState {
  if (input.held) return 'used'
  if (input.cancelledAt || !input.isActive) return 'cancelled'
  if (input.now > input.endsAt) return 'expired'
  return 'ready'
}

// ─── The voucher ─────────────────────────────────────────────────────────────

/** A coupon voucher's own promo code: CP and 8 characters. Only its owner can use it (resolveDiscount). */
export function newVoucherCode(pick: (max: number) => number = randomInt): string {
  let code = 'CP'
  for (let i = 0; i < 8; i += 1) code += COUPON_CODE_ALPHABET[pick(COUPON_CODE_ALPHABET.length)]
  return code
}

export interface BatchOffer {
  reward: CouponReward
  amountOff: string | null
  percentOff: string | null
  maxDiscount: string | null
  minOrderAmount: string | null
  vendorId: string | null
  serviceCategory: ServiceCategory | null
  validUntil: Date
}

/**
 * The `discounts` row a coupon becomes for the customer who adds it: a
 * Detlio-funded promo code, once, for them only, until the batch's last
 * day. A free wash is a fixed ₹ off limited to car washes, so it can never
 * take more than the wash itself. Null for bonus stamps (no code).
 */
export function voucherDiscountValues(batch: BatchOffer, now: Date) {
  if (batch.reward === 'stamps') return null
  const percentage = batch.reward === 'percent'
  return {
    discountType: percentage ? ('percentage' as const) : ('fixed' as const),
    amountOff: percentage ? null : batch.amountOff,
    percentOff: percentage ? batch.percentOff : null,
    maxDiscountAmount: percentage ? batch.maxDiscount : null,
    minOrderAmount: batch.minOrderAmount,
    perUserLimit: 1,
    totalUsageLimit: 1,
    vendorId: batch.vendorId,
    serviceCategory: voucherCategory(batch.reward, batch.serviceCategory),
    fundedBy: 'platform' as const,
    startsAt: now,
    endsAt: batch.validUntil,
    isActive: true,
    showOnHome: false,
    source: 'coupon' as const,
  }
}

// ─── Checkout ────────────────────────────────────────────────────────────────

/**
 * What a category-limited voucher is taken off: the lines of that category,
 * rupees as a decimal string, or null when the booking has none. A package
 * counts as its own category ('package'), not as its members'.
 */
export function eligibleSubtotal(lines: ReadonlyArray<{ category: string; amount: string }>, category: string): string | null {
  const matching = lines.filter((line) => line.category === category)
  if (matching.length === 0) return null
  const paise = matching.reduce((sum, line) => sum + Math.round(Number.parseFloat(line.amount) * 100), 0)
  return (paise / 100).toFixed(2)
}

// ─── Words ───────────────────────────────────────────────────────────────────

export interface CouponOffer {
  reward: CouponReward
  /** Rupees: ₹ off, or a free wash's ceiling. */
  amountOff: number | null
  percentOff: number | null
  /** Rupees: a % off's cap. */
  maxDiscount: number | null
  stamps: number | null
  /** Rupees. */
  minOrder: number | null
  serviceCategory: ServiceCategory | null
  vendorName: string | null
  newCustomersOnly: boolean
}

const inr = (rupees: number) => `₹${rupees.toLocaleString('en-IN')}`

/** "₹100 off", "20% off, up to ₹200", "A free car wash, up to ₹299", "3 bonus Shine stamps". */
export function offerTitle(offer: CouponOffer): string {
  switch (offer.reward) {
    case 'amount':
      return `${inr(offer.amountOff ?? 0)} off`
    case 'percent':
      return `${offer.percentOff ?? 0}% off, up to ${inr(offer.maxDiscount ?? 0)}`
    case 'free_wash':
      return `A free car wash, up to ${inr(offer.amountOff ?? 0)}`
    case 'stamps':
      return offer.stamps === 1 ? '1 bonus Shine stamp' : `${offer.stamps ?? 0} bonus Shine stamps`
  }
}

/**
 * The small print, generated from the batch's columns and never typed, so
 * it can't misstate a condition: each line one condition.
 */
export function offerConditions(offer: CouponOffer): string[] {
  if (offer.reward === 'stamps') {
    return ['Added to your Shine Card in Detlio Rewards.', ...(offer.newCustomersOnly ? ['For new Detlio customers.'] : [])]
  }
  const lines: string[] = []
  const category = offer.reward === 'free_wash' ? 'car_wash' : offer.serviceCategory
  if (category) lines.push(`On ${CATEGORY_LABELS[category].toLowerCase()} services.`)
  if (offer.minOrder) lines.push(`On bookings of ${inr(offer.minOrder)} or more.`)
  lines.push(offer.vendorName ? `At ${offer.vendorName} only.` : 'At any garage on Detlio.')
  if (offer.newCustomersOnly) lines.push('For your first booking on Detlio.')
  lines.push('One use. Paid online at checkout.')
  return lines
}
