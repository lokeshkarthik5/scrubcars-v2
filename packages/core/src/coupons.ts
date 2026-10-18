import { CATEGORY_LABELS } from '@repo/core/categories'
import type { ServiceCategory } from '@repo/core/types'

/**
 * Printed coupons with QR codes (0055): the code's shape, the limits the
 * admin form shows, and the words a coupon says. The twin of
 * apps/server/src/lib/coupons.ts, which decides (coupons.parity.test.ts
 * keeps the two the same). No hashing or deriving here: the app only reads
 * a code well enough to catch a typo before asking the server.
 */

/** 31 characters with no look-alikes (no 0/O, no 1/I/L). */
export const COUPON_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
/** Random characters, then one check character. */
export const COUPON_CODE_BODY = 9
export const COUPON_CODE_LENGTH = COUPON_CODE_BODY + 1
/** Printed in front of every code; never part of it ("L" is not in the alphabet). */
export const COUPON_CODE_PREFIX = 'DTL'

/** A weighted sum of the body, weights 1…9, mod 31. */
export function checkCharacter(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i += 1) {
    const value = COUPON_CODE_ALPHABET.indexOf(body[i]!)
    if (value < 0) throw new Error('coupon code: character outside the alphabet')
    sum += (i + 1) * value
  }
  return COUPON_CODE_ALPHABET[sum % COUPON_CODE_ALPHABET.length]!
}

export type ParsedCode = { ok: true; code: string } | { ok: false; reason: 'malformed' | 'typo' }

/** Spaces and dashes dropped, upper case, "DTL" taken off; `typo` when the check character is wrong. */
export function parseCouponCode(input: string): ParsedCode {
  let code = input.replace(/[\s-]/g, '').toUpperCase()
  if (code.length === COUPON_CODE_LENGTH + COUPON_CODE_PREFIX.length && code.startsWith(COUPON_CODE_PREFIX)) {
    code = code.slice(COUPON_CODE_PREFIX.length)
  }
  if (code.length !== COUPON_CODE_LENGTH) return { ok: false, reason: 'malformed' }
  for (const char of code) if (!COUPON_CODE_ALPHABET.includes(char)) return { ok: false, reason: 'malformed' }
  if (checkCharacter(code.slice(0, COUPON_CODE_BODY)) !== code[COUPON_CODE_BODY]) return { ok: false, reason: 'typo' }
  return { ok: true, code }
}

/** "DTL-7K4QM-92MXA". */
export function formatCouponCode(code: string): string {
  return `${COUPON_CODE_PREFIX}-${code.slice(0, 5)}-${code.slice(5)}`
}

/**
 * The code in what the camera read: a coupon's QR holds
 * `https://detlio.com/c/<code>`; a bare code (typed onto a QR by someone
 * else) is taken as it is. Null for anything else, so a stray QR (a
 * restaurant menu) is never sent to the server as a guess.
 */
export function codeFromScan(text: string): string | null {
  const trimmed = text.trim()
  const fromLink = /\/c\/([A-Za-z0-9-]{10,20})\/?(?:[?#].*)?$/.exec(trimmed)
  const parsed = parseCouponCode(fromLink ? fromLink[1]! : trimmed)
  return parsed.ok ? parsed.code : null
}

/** The sentence for a code the app can tell is wrong before asking. */
export function couponCodeProblem(input: string): string | null {
  const parsed = parseCouponCode(input)
  if (parsed.ok) return null
  return parsed.reason === 'typo'
    ? "That code doesn't look right. Check each character and try again."
    : 'A coupon code has 10 letters and numbers after DTL, like DTL-7K4QM-92MXA.'
}

export const COUPON_KINDS = ['unique', 'shared'] as const
export type CouponKind = (typeof COUPON_KINDS)[number]

export const COUPON_REWARDS = ['amount', 'percent', 'free_wash', 'stamps'] as const
export type CouponReward = (typeof COUPON_REWARDS)[number]

export const REDEEM_CHANNELS = ['link', 'typed', 'camera'] as const
export type RedeemChannel = (typeof REDEEM_CHANNELS)[number]

export const COUPON_LIMITS = {
  maxCodes: 5000,
  maxSharedRedemptions: 100000,
  maxAmount: 2000,
  maxPercent: 90,
  maxStamps: 5,
  maxMinOrder: 10000,
  maxValidDays: 366,
} as const

export interface CouponOffer {
  reward: CouponReward
  amountOff: number | null
  percentOff: number | null
  maxDiscount: number | null
  stamps: number | null
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

/** The small print, one condition a line, from the batch's columns. */
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

/** The line printed on every coupon under the QR. */
export const COUPON_SCAN_LINE = 'Scan with your phone camera or enter the code in the Detlio app'
