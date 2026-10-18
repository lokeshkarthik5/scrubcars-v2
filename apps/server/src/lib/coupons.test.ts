import { describe, expect, test } from 'bun:test'
import {
  COUPON_CODE_ALPHABET,
  COUPON_CODE_LENGTH,
  WRONG_CODES_PER_IP_HOUR,
  WRONG_CODES_PER_USER_HOUR,
  batchProblems,
  batchWindow,
  checkCharacter,
  codeSuffix,
  couponAttemptAllowed,
  couponCodeHash,
  couponIpKey,
  couponKeys,
  couponLink,
  deriveCouponCode,
  eligibleSubtotal,
  formatCouponCode,
  hasValidCheck,
  newVoucherCode,
  offerConditions,
  offerTitle,
  parseCouponCode,
  publicCouponState,
  redeemRefusal,
  voucherDiscountValues,
  voucherState,
  type BatchForRules,
  type BatchInput,
  type CodeForRules,
  type CouponOffer,
} from './coupons.js'
import { computeDiscount } from './discounts.js'

const KEYS = couponKeys('test-secret')
const BATCH_ID = 'e2e00000-0000-4000-8000-000000003610'
const NOW = new Date('2026-11-10T06:30:00Z')

describe('codes', () => {
  test('ten characters from the no-look-alike alphabet, the last a check character', () => {
    for (let seq = 0; seq < 200; seq += 1) {
      const code = deriveCouponCode(KEYS.codeKey, BATCH_ID, seq)
      expect(code).toHaveLength(COUPON_CODE_LENGTH)
      for (const char of code) expect(COUPON_CODE_ALPHABET).toContain(char)
      expect(hasValidCheck(code)).toBe(true)
    }
    // No 0/O, no 1/I/L.
    expect(COUPON_CODE_ALPHABET).not.toMatch(/[01OIL]/)
    expect(COUPON_CODE_ALPHABET).toHaveLength(31)
  })

  test('the same batch, number and variant give the same code; anything else a different one', () => {
    const a = deriveCouponCode(KEYS.codeKey, BATCH_ID, 7)
    expect(deriveCouponCode(KEYS.codeKey, BATCH_ID, 7)).toBe(a)
    expect(deriveCouponCode(KEYS.codeKey, BATCH_ID, 7, 1)).not.toBe(a)
    expect(deriveCouponCode(KEYS.codeKey, BATCH_ID, 8)).not.toBe(a)
    expect(deriveCouponCode(KEYS.codeKey, 'e2e00000-0000-4000-8000-000000003611', 7)).not.toBe(a)
    expect(deriveCouponCode(couponKeys('another-secret').codeKey, BATCH_ID, 7)).not.toBe(a)
  })

  test('a full batch of 5,000 codes has no repeats', () => {
    const codes = new Set(Array.from({ length: 5000 }, (_, seq) => deriveCouponCode(KEYS.codeKey, BATCH_ID, seq)))
    expect(codes.size).toBe(5000)
  })

  test('characters are spread evenly over the alphabet', () => {
    const counts = new Map<string, number>()
    for (let seq = 0; seq < 3000; seq += 1) {
      for (const char of deriveCouponCode(KEYS.codeKey, BATCH_ID, seq).slice(0, 9)) counts.set(char, (counts.get(char) ?? 0) + 1)
    }
    const expected = (3000 * 9) / 31
    for (const char of COUPON_CODE_ALPHABET) {
      expect(counts.get(char) ?? 0).toBeGreaterThan(expected * 0.8)
      expect(counts.get(char) ?? 0).toBeLessThan(expected * 1.2)
    }
  })

  test('the check character catches every single wrong character and every swap of neighbours', () => {
    const code = deriveCouponCode(KEYS.codeKey, BATCH_ID, 3)
    for (let i = 0; i < COUPON_CODE_LENGTH; i += 1) {
      for (const char of COUPON_CODE_ALPHABET) {
        if (char === code[i]) continue
        const wrong = code.slice(0, i) + char + code.slice(i + 1)
        expect(parseCouponCode(wrong)).toEqual({ ok: false, reason: 'typo' })
      }
    }
    for (let i = 0; i < COUPON_CODE_LENGTH - 1; i += 1) {
      if (code[i] === code[i + 1]) continue
      const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2)
      expect(parseCouponCode(swapped).ok).toBe(false)
    }
  })

  test('printed as DTL-XXXXX-XXXXX; read back with or without the prefix, dashes, spaces or case', () => {
    const code = deriveCouponCode(KEYS.codeKey, BATCH_ID, 1)
    const printed = formatCouponCode(code)
    expect(printed).toMatch(/^DTL-[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    expect(parseCouponCode(printed)).toEqual({ ok: true, code })
    expect(parseCouponCode(printed.toLowerCase())).toEqual({ ok: true, code })
    expect(parseCouponCode(` ${code.slice(0, 5)} ${code.slice(5)} `)).toEqual({ ok: true, code })
    expect(parseCouponCode(code)).toEqual({ ok: true, code })
  })

  test('anything of the wrong shape is malformed, never looked up', () => {
    expect(parseCouponCode('')).toEqual({ ok: false, reason: 'malformed' })
    expect(parseCouponCode('DTL-1234')).toEqual({ ok: false, reason: 'malformed' })
    // O and 0, I and 1 are not in the alphabet.
    expect(parseCouponCode('OOOOOOOOOO')).toEqual({ ok: false, reason: 'malformed' })
    expect(parseCouponCode('https://detlio.com/c/ABC')).toEqual({ ok: false, reason: 'malformed' })
  })

  test('the check character is a weighted sum mod 31', () => {
    expect(checkCharacter('AAAAAAAAA')).toBe('A')
    // B is 1: weights 1..9 → 45 → 45 mod 31 = 14 → 'Q'.
    expect(checkCharacter('BBBBBBBBB')).toBe(COUPON_CODE_ALPHABET[14])
  })

  test('stored: a keyed hash and the last four characters, never the code', () => {
    const code = deriveCouponCode(KEYS.codeKey, BATCH_ID, 0)
    const hash = couponCodeHash(KEYS.lookupKey, code)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(code)
    expect(couponCodeHash(couponKeys('another').lookupKey, code)).not.toBe(hash)
    expect(codeSuffix(code)).toBe(code.slice(-4))
  })

  test('the two keys and the key id are separate derivations of the secret', () => {
    expect(KEYS.codeKey.equals(KEYS.lookupKey)).toBe(false)
    expect(KEYS.keyId).toMatch(/^[0-9a-f]{16}$/)
    expect(couponKeys('test-secret').keyId).toBe(KEYS.keyId)
    expect(couponKeys('rotated').keyId).not.toBe(KEYS.keyId)
  })

  test("the QR's link is the customer site's /c/<code>", () => {
    expect(couponLink('https://detlio.com/', 'ABCDEFGHJK')).toBe('https://detlio.com/c/ABCDEFGHJK')
  })

  test('voucher codes: CP and eight characters', () => {
    expect(newVoucherCode()).toMatch(/^CP[A-Z2-9]{8}$/)
  })
})

describe('guessing', () => {
  test('ten wrong codes an hour per account, thirty per network address', () => {
    expect(couponAttemptAllowed({ userFailures: WRONG_CODES_PER_USER_HOUR - 1, ipFailures: 0 })).toBe(true)
    expect(couponAttemptAllowed({ userFailures: WRONG_CODES_PER_USER_HOUR, ipFailures: 0 })).toBe(false)
    expect(couponAttemptAllowed({ userFailures: null, ipFailures: WRONG_CODES_PER_IP_HOUR - 1 })).toBe(true)
    expect(couponAttemptAllowed({ userFailures: null, ipFailures: WRONG_CODES_PER_IP_HOUR })).toBe(false)
    expect(couponAttemptAllowed({ userFailures: 0, ipFailures: WRONG_CODES_PER_IP_HOUR })).toBe(false)
  })

  test('addresses are hashed', () => {
    expect(couponIpKey('203.0.113.9')).toMatch(/^[0-9a-f]{32}$/)
    expect(couponIpKey('203.0.113.9')).not.toBe(couponIpKey('203.0.113.10'))
  })
})

const goodBatch = (overrides: Partial<BatchInput> = {}): BatchInput => ({
  kind: 'unique',
  count: 100,
  maxRedemptions: null,
  reward: 'amount',
  amountOff: 100,
  percentOff: null,
  maxDiscount: null,
  stamps: null,
  minOrder: 499,
  serviceCategory: null,
  vendorId: null,
  newCustomersOnly: false,
  validFrom: '2026-11-01',
  validTo: '2026-12-31',
  ...overrides,
})

describe('batchProblems', () => {
  const context = { now: NOW, rewardsLive: true }

  test('a sound batch has none', () => {
    expect(batchProblems(goodBatch(), context)).toEqual([])
    expect(batchProblems(goodBatch({ kind: 'shared', count: 1, maxRedemptions: 500 }), context)).toEqual([])
    expect(batchProblems(goodBatch({ reward: 'percent', amountOff: null, percentOff: 20, maxDiscount: 200 }), context)).toEqual([])
    expect(batchProblems(goodBatch({ reward: 'free_wash', amountOff: 299, minOrder: null }), context)).toEqual([])
    expect(batchProblems(goodBatch({ reward: 'stamps', amountOff: null, stamps: 2, minOrder: null }), context)).toEqual([])
  })

  test('5,000 codes at most; a cap on customers only for a shared code', () => {
    expect(batchProblems(goodBatch({ count: 5001 }), context)).toHaveLength(1)
    expect(batchProblems(goodBatch({ count: 0 }), context)).toHaveLength(1)
    expect(batchProblems(goodBatch({ maxRedemptions: 10 }), context)).toHaveLength(1)
  })

  test('a % off needs a cap; a free wash is a car wash; stamps need Rewards and nothing about a booking', () => {
    expect(batchProblems(goodBatch({ reward: 'percent', amountOff: null, percentOff: 20, maxDiscount: null }), context)).toHaveLength(1)
    expect(batchProblems(goodBatch({ reward: 'percent', amountOff: null, percentOff: 95, maxDiscount: 100 }), context)).toHaveLength(1)
    expect(batchProblems(goodBatch({ reward: 'free_wash', amountOff: 299, serviceCategory: 'detailing' }), context)).toHaveLength(1)
    expect(
      batchProblems(goodBatch({ reward: 'stamps', amountOff: null, stamps: 2, minOrder: null }), { now: NOW, rewardsLive: false })
    ).toEqual(['Bonus stamps need Detlio Rewards to be on.'])
    expect(batchProblems(goodBatch({ reward: 'stamps', amountOff: null, stamps: 2, minOrder: 499 }), context)).toHaveLength(1)
    expect(batchProblems(goodBatch({ reward: 'stamps', amountOff: null, stamps: 9, minOrder: null }), context)).toHaveLength(1)
  })

  test('dates: in order, at most a year, not already over', () => {
    expect(batchProblems(goodBatch({ validFrom: '2026-12-01', validTo: '2026-11-01' }), context)).toEqual([
      'The last day comes before the first.',
    ])
    expect(batchProblems(goodBatch({ validFrom: '2026-11-01', validTo: '2027-12-01' }), context)).toHaveLength(1)
    expect(batchProblems(goodBatch({ validFrom: '2026-10-01', validTo: '2026-11-09' }), context)).toEqual([
      'The last day has already passed.',
    ])
    // Today counts as still running.
    expect(batchProblems(goodBatch({ validFrom: '2026-10-01', validTo: '2026-11-10' }), context)).toEqual([])
  })

  test('the window runs from the first IST day to the end of the last', () => {
    const window = batchWindow('2026-11-01', '2026-11-30')
    expect(window.startsAt.toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(window.endsAt.toISOString()).toBe('2026-11-30T18:29:59.999Z')
  })
})

const batch = (overrides: Partial<BatchForRules> = {}): BatchForRules => ({
  kind: 'unique',
  reward: 'amount',
  validFrom: new Date('2026-11-01T00:00:00Z'),
  validUntil: new Date('2026-12-31T18:29:59Z'),
  voidedAt: null,
  maxRedemptions: null,
  newCustomersOnly: false,
  ...overrides,
})
const freshCode: CodeForRules = { voidedAt: null, redeemedBy: null, redeemedAt: null }
const ME = 'e2e00000-0000-4000-8000-000000003601'
const SOMEONE = 'e2e00000-0000-4000-8000-000000003602'

const refusal = (overrides: Partial<Parameters<typeof redeemRefusal>[0]> = {}) =>
  redeemRefusal({
    batch: batch(),
    code: freshCode,
    userId: ME,
    addedByUser: false,
    redemptions: 0,
    hasPaidBooking: false,
    rewardsLive: true,
    now: NOW,
    ...overrides,
  })

describe('redeemRefusal', () => {
  test('a fresh code in its dates can be added', () => {
    expect(refusal()).toBeNull()
  })

  test('a unique code is added once, ever', () => {
    const used = { voidedAt: null, redeemedBy: SOMEONE, redeemedAt: NOW }
    expect(refusal({ code: used })).toBe('already_redeemed')
    expect(refusal({ code: { ...used, redeemedBy: ME } })).toBe('already_added')
    // A deleted account leaves the code used.
    expect(refusal({ code: { ...used, redeemedBy: null } })).toBe('already_redeemed')
  })

  test('a shared code is added once per customer, up to its cap', () => {
    const shared = batch({ kind: 'shared', maxRedemptions: 3 })
    expect(refusal({ batch: shared, redemptions: 2 })).toBeNull()
    expect(refusal({ batch: shared, redemptions: 2, addedByUser: true })).toBe('already_added')
    expect(refusal({ batch: shared, redemptions: 3 })).toBe('used_up')
    expect(refusal({ batch: batch({ kind: 'shared' }), redemptions: 10_000 })).toBeNull()
  })

  test('void, not started and expired come first', () => {
    expect(refusal({ batch: batch({ voidedAt: NOW }), addedByUser: true })).toBe('void')
    expect(refusal({ code: { ...freshCode, voidedAt: NOW } })).toBe('void')
    expect(refusal({ batch: batch({ validFrom: new Date('2026-12-01T00:00:00Z') }) })).toBe('not_started')
    expect(refusal({ batch: batch({ validUntil: new Date('2026-11-01T00:00:00Z') }), addedByUser: true })).toBe('expired')
  })

  test('new customers only: refused once the account has a kept, paid booking', () => {
    const forNew = batch({ newCustomersOnly: true })
    expect(refusal({ batch: forNew })).toBeNull()
    expect(refusal({ batch: forNew, hasPaidBooking: true })).toBe('not_new')
    expect(refusal({ hasPaidBooking: true })).toBeNull()
  })

  test('bonus stamps need Rewards live', () => {
    expect(refusal({ batch: batch({ reward: 'stamps' }), rewardsLive: false })).toBe('rewards_off')
    expect(refusal({ batch: batch({ reward: 'stamps' }), rewardsLive: true })).toBeNull()
    expect(refusal({ rewardsLive: false })).toBeNull()
  })
})

describe('publicCouponState', () => {
  const state = (overrides: Partial<Parameters<typeof publicCouponState>[0]> = {}) =>
    publicCouponState({ batch: batch(), code: freshCode, viewerId: null, viewerAdded: false, redemptions: 0, now: NOW, ...overrides })

  test('what the coupon page says', () => {
    expect(state()).toBe('available')
    expect(state({ code: { voidedAt: null, redeemedBy: SOMEONE, redeemedAt: NOW } })).toBe('redeemed')
    expect(state({ code: { voidedAt: null, redeemedBy: ME, redeemedAt: NOW }, viewerId: ME })).toBe('added')
    expect(state({ batch: batch({ kind: 'shared' }), viewerAdded: true })).toBe('added')
    expect(state({ batch: batch({ kind: 'shared', maxRedemptions: 1 }), redemptions: 1 })).toBe('used_up')
    expect(state({ batch: batch({ voidedAt: NOW }) })).toBe('void')
    expect(state({ batch: batch({ validUntil: new Date('2026-11-01T00:00:00Z') }) })).toBe('expired')
    expect(state({ batch: batch({ validFrom: new Date('2026-12-01T00:00:00Z') }) })).toBe('not_started')
  })
})

describe('voucherState', () => {
  const ends = new Date('2026-12-31T18:29:59Z')
  test('spent while a live booking holds it; back when that is cancelled, unless it lapsed', () => {
    expect(voucherState({ cancelledAt: null, isActive: true, held: false, endsAt: ends, now: NOW })).toBe('ready')
    expect(voucherState({ cancelledAt: null, isActive: true, held: true, endsAt: ends, now: NOW })).toBe('used')
    expect(voucherState({ cancelledAt: null, isActive: true, held: false, endsAt: new Date('2026-11-01T00:00:00Z'), now: NOW })).toBe('expired')
    expect(voucherState({ cancelledAt: NOW, isActive: false, held: false, endsAt: ends, now: NOW })).toBe('cancelled')
    // Voiding never takes back a voucher a booking already used.
    expect(voucherState({ cancelledAt: null, isActive: false, held: true, endsAt: ends, now: NOW })).toBe('used')
  })
})

describe('the voucher a coupon becomes', () => {
  const offer = {
    amountOff: null as string | null,
    percentOff: null as string | null,
    maxDiscount: null as string | null,
    minOrderAmount: '499.00' as string | null,
    vendorId: null as string | null,
    serviceCategory: null,
    validUntil: new Date('2026-12-31T18:29:59.999Z'),
  }

  test('a Detlio-funded promo code, once, never on Home, until the batch ends', () => {
    const values = voucherDiscountValues({ ...offer, reward: 'amount', amountOff: '100.00' }, NOW)!
    expect(values).toMatchObject({
      discountType: 'fixed',
      amountOff: '100.00',
      percentOff: null,
      perUserLimit: 1,
      totalUsageLimit: 1,
      fundedBy: 'platform',
      showOnHome: false,
      source: 'coupon',
      startsAt: NOW,
      endsAt: offer.validUntil,
      minOrderAmount: '499.00',
    })
  })

  test('% off keeps its cap; a free wash is a fixed ₹ off car washes', () => {
    expect(voucherDiscountValues({ ...offer, reward: 'percent', percentOff: '20.00', maxDiscount: '200.00' }, NOW)).toMatchObject({
      discountType: 'percentage',
      percentOff: '20.00',
      maxDiscountAmount: '200.00',
      amountOff: null,
    })
    expect(voucherDiscountValues({ ...offer, reward: 'free_wash', amountOff: '299.00' }, NOW)).toMatchObject({
      discountType: 'fixed',
      amountOff: '299.00',
      serviceCategory: 'car_wash',
    })
    expect(voucherDiscountValues({ ...offer, reward: 'stamps' }, NOW)).toBeNull()
  })

  test('limited to one service type, it comes off those lines only', () => {
    const lines = [
      { category: 'car_wash', amount: '299.00' },
      { category: 'detailing', amount: '1500.00' },
    ]
    expect(eligibleSubtotal(lines, 'car_wash')).toBe('299.00')
    expect(eligibleSubtotal(lines, 'coating')).toBeNull()
    // A free wash worth up to ₹499 on a ₹299 wash: ₹299 off, the detailing paid in full.
    expect(computeDiscount({ discountType: 'fixed', amountOff: '499', percentOff: null, maxDiscountAmount: null }, '1799.00', '299.00')).toEqual({
      discountAmount: '299.00',
      finalAmount: '1500.00',
    })
    // 20% of the detailing line only.
    expect(
      computeDiscount({ discountType: 'percentage', amountOff: null, percentOff: '20', maxDiscountAmount: '1000' }, '1799.00', '1500.00')
    ).toEqual({ discountAmount: '300.00', finalAmount: '1499.00' })
    // A booking of only the wash still keeps ₹1 to pay.
    expect(computeDiscount({ discountType: 'fixed', amountOff: '299', percentOff: null, maxDiscountAmount: null }, '299.00', '299.00')).toEqual({
      discountAmount: '298.00',
      finalAmount: '1.00',
    })
    // Without a limit nothing changes.
    expect(computeDiscount({ discountType: 'fixed', amountOff: '100', percentOff: null, maxDiscountAmount: null }, '499.00')).toEqual({
      discountAmount: '100.00',
      finalAmount: '399.00',
    })
  })
})

describe('words', () => {
  const offer = (overrides: Partial<CouponOffer>): CouponOffer => ({
    reward: 'amount',
    amountOff: 100,
    percentOff: null,
    maxDiscount: null,
    stamps: null,
    minOrder: null,
    serviceCategory: null,
    vendorName: null,
    newCustomersOnly: false,
    ...overrides,
  })

  test('titles say the reward plainly', () => {
    expect(offerTitle(offer({}))).toBe('₹100 off')
    expect(offerTitle(offer({ reward: 'percent', percentOff: 20, maxDiscount: 1500 }))).toBe('20% off, up to ₹1,500')
    expect(offerTitle(offer({ reward: 'free_wash', amountOff: 299 }))).toBe('A free car wash, up to ₹299')
    expect(offerTitle(offer({ reward: 'stamps', stamps: 1 }))).toBe('1 bonus Shine stamp')
    expect(offerTitle(offer({ reward: 'stamps', stamps: 3 }))).toBe('3 bonus Shine stamps')
  })

  test('the small print is every condition, from the columns', () => {
    expect(
      offerConditions(offer({ minOrder: 499, serviceCategory: 'detailing', vendorName: 'Marina Auto Spa', newCustomersOnly: true }))
    ).toEqual([
      'On detailing services.',
      'On bookings of ₹499 or more.',
      'At Marina Auto Spa only.',
      'For your first booking on Detlio.',
      'One use. Paid online at checkout.',
    ])
    expect(offerConditions(offer({ reward: 'free_wash', amountOff: 299 }))[0]).toBe('On car wash services.')
    expect(offerConditions(offer({ reward: 'stamps', stamps: 2 }))).toEqual(['Added to your Shine Card in Detlio Rewards.'])
  })
})
