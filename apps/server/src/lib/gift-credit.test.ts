import { describe, expect, test } from 'bun:test'
import {
  CODE_FAILURES_PER_IP_HOUR,
  GIFT_CODE_ALPHABET,
  GIFT_CODE_LENGTH,
  REDEEM_FAILURES_PER_USER_HOUR,
  adjustmentRefusal,
  balanceOf,
  canIssueLink,
  codeAttemptAllowed,
  creditStillToReturn,
  creditToUse,
  dailyLimitLeft,
  expiredRemainders,
  expiringWithin,
  formatGiftCode,
  giftAmountRefusal,
  giftCodeHash,
  giftExpiresAt,
  giftState,
  ipKey,
  lotsOf,
  newGiftCode,
  nextExpiry,
  normalizeGiftCode,
  paidInAll,
  planDraw,
  redeemRefusal,
  returnedCreditExpiresAt,
  splitCheckout,
  withinDailyLimit,
  type CreditEntry,
} from './gift-credit.js'

const NOW = new Date('2026-10-18T06:30:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY)

let seq = 0
function lot(kind: CreditEntry['kind'], amount: string, expiresAt: Date, createdAt = daysFromNow(-10)): CreditEntry {
  seq += 1
  return { id: `lot-${seq}`, kind, amount, lotId: null, expiresAt, createdAt }
}
function draw(kind: CreditEntry['kind'], amount: string, lotId: string, createdAt = daysFromNow(-1)): CreditEntry {
  seq += 1
  return { id: `draw-${seq}`, kind, amount, lotId, expiresAt: null, createdAt }
}

describe('gift amounts and the daily limit', () => {
  test('whole rupees from ₹300 to ₹5,000, the presets included', () => {
    expect(giftAmountRefusal(500)).toBeNull()
    expect(giftAmountRefusal(300)).toBeNull()
    expect(giftAmountRefusal(5000)).toBeNull()
    expect(giftAmountRefusal(299)).toBe('too_small')
    expect(giftAmountRefusal(5001)).toBe('too_large')
    expect(giftAmountRefusal(450.5)).toBe('not_whole_rupees')
  })

  test('a buyer may reach ₹10,000 in a day, never pass it', () => {
    expect(withinDailyLimit({ boughtTodayPaise: 800000, amount: 2000 })).toBe(true)
    expect(withinDailyLimit({ boughtTodayPaise: 800000, amount: 2001 })).toBe(false)
    expect(withinDailyLimit({ boughtTodayPaise: 0, amount: 5000 })).toBe(true)
    expect(dailyLimitLeft(800000)).toBe(2000)
    expect(dailyLimitLeft(1000000)).toBe(0)
  })
})

describe('codes', () => {
  test('16 characters from an alphabet with no look-alikes', () => {
    expect(GIFT_CODE_ALPHABET).not.toMatch(/[01OIL]/)
    const code = newGiftCode()
    expect(code).toHaveLength(GIFT_CODE_LENGTH)
    for (const char of code) expect(GIFT_CODE_ALPHABET).toContain(char)
    // About 79 bits: guessing is hopeless before any rate limit.
    expect(GIFT_CODE_LENGTH * Math.log2(GIFT_CODE_ALPHABET.length)).toBeGreaterThan(75)
  })

  test('a typed code is forgiven spaces, dashes and lower case, and refused otherwise', () => {
    const code = 'ABCDEFGHJKMNPQRS'
    expect(formatGiftCode(code)).toBe('ABCD-EFGH-JKMN-PQRS')
    expect(normalizeGiftCode('abcd-efgh jkmn-pqrs')).toBe(code)
    expect(normalizeGiftCode('ABCD-EFGH-JKMN-PQR')).toBeNull()
    expect(normalizeGiftCode('ABCD-EFGH-JKMN-PQR0')).toBeNull()
    expect(normalizeGiftCode('ABCD-EFGH-JKMN-PQRI')).toBeNull()
  })

  test('only a hash is stored, and the same code always hashes the same', () => {
    const hash = giftCodeHash('ABCDEFGHJKMNPQRS')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(giftCodeHash('ABCDEFGHJKMNPQRS'))
    expect(hash).not.toBe(giftCodeHash('ABCDEFGHJKMNPQRT'))
    expect(hash).not.toContain('ABCD')
  })

  test('wrong codes are capped per customer and per network address, which is hashed', () => {
    expect(codeAttemptAllowed({ userFailures: 0, ipFailures: 0 })).toBe(true)
    expect(codeAttemptAllowed({ userFailures: REDEEM_FAILURES_PER_USER_HOUR, ipFailures: 0 })).toBe(false)
    expect(codeAttemptAllowed({ userFailures: null, ipFailures: CODE_FAILURES_PER_IP_HOUR })).toBe(false)
    expect(codeAttemptAllowed({ userFailures: null, ipFailures: CODE_FAILURES_PER_IP_HOUR - 1 })).toBe(true)
    expect(ipKey('203.0.113.7')).toMatch(/^[0-9a-f]{32}$/)
    expect(ipKey('203.0.113.7')).not.toContain('203')
  })
})

describe('a gift', () => {
  const paidAt = new Date('2026-10-18T06:00:00.000Z')

  test('lasts 12 months from its payment', () => {
    expect(giftExpiresAt(paidAt).toISOString()).toBe('2027-10-18T06:00:00.000Z')
  })

  test('can be redeemed once, while paid and not expired', () => {
    const paid = { status: 'paid' as const, expiresAt: giftExpiresAt(paidAt) }
    expect(giftState(paid, NOW)).toBe('available')
    expect(redeemRefusal(paid, NOW)).toBeNull()
    expect(canIssueLink(paid, NOW)).toBe(true)

    expect(redeemRefusal({ status: 'redeemed', expiresAt: paid.expiresAt }, NOW)).toBe('redeemed')
    expect(redeemRefusal({ status: 'pending', expiresAt: null }, NOW)).toBe('pending')
    expect(redeemRefusal({ status: 'cancelled', expiresAt: paid.expiresAt }, NOW)).toBe('cancelled')
    const later = new Date('2027-10-18T06:00:00.000Z')
    expect(redeemRefusal(paid, later)).toBe('expired')
    expect(canIssueLink(paid, later)).toBe(false)
    expect(canIssueLink({ status: 'redeemed', expiresAt: paid.expiresAt }, NOW)).toBe(false)
  })
})

describe('the ledger', () => {
  test('a redeemed gift is credit; spending draws it down and keeps the rest', () => {
    const gift = lot('redeem', '1000.00', daysFromNow(300))
    const entries = [gift]
    expect(balanceOf(entries, NOW)).toBe(100000)

    const plan = planDraw(entries, 49900, NOW)
    expect(plan).toEqual([{ lotId: gift.id, paise: 49900 }])
    entries.push(draw('debit', '-499.00', gift.id))
    expect(balanceOf(entries, NOW)).toBe(50100)
    expect(nextExpiry(entries, NOW)).toEqual({ paise: 50100, at: gift.expiresAt! })
  })

  test('spends the credit that runs out first, across lots', () => {
    const later = lot('redeem', '500.00', daysFromNow(200), daysFromNow(-20))
    const sooner = lot('refund', '300.00', daysFromNow(40), daysFromNow(-5))
    const entries = [later, sooner]
    expect(planDraw(entries, 60000, NOW)).toEqual([
      { lotId: sooner.id, paise: 30000 },
      { lotId: later.id, paise: 30000 },
    ])
  })

  test('refuses to draw more than the balance, drawing nothing at all', () => {
    const gift = lot('redeem', '500.00', daysFromNow(100))
    expect(planDraw([gift], 50001, NOW)).toBeNull()
    expect(planDraw([gift], 50000, NOW)).toEqual([{ lotId: gift.id, paise: 50000 }])
    expect(planDraw([gift], 0, NOW)).toEqual([])
  })

  test('two checkouts spending the same rupee: the second, planned after the first wrote, is refused', () => {
    // Both priced against a ₹500 balance. Under the credit lock the second
    // reads the first's draw and finds ₹1 left.
    const gift = lot('redeem', '500.00', daysFromNow(100))
    const entries: CreditEntry[] = [gift]
    const first = planDraw(entries, 49900, NOW)!
    entries.push(...first.map((part) => draw('debit', `-${(part.paise / 100).toFixed(2)}`, part.lotId)))
    expect(planDraw(entries, 49900, NOW)).toBeNull()
    expect(balanceOf(entries, NOW)).toBe(100)
  })

  test('expired credit is not spendable, and the sweep writes off only what was left', () => {
    const expired = lot('redeem', '1000.00', daysFromNow(-1), daysFromNow(-400))
    const live = lot('redeem', '500.00', daysFromNow(30))
    const entries = [expired, live, draw('debit', '-600.00', expired.id, daysFromNow(-100))]
    expect(balanceOf(entries, NOW)).toBe(50000)
    expect(planDraw(entries, 50001, NOW)).toBeNull()
    expect(expiredRemainders(entries, NOW)).toEqual([{ lotId: expired.id, paise: 40000 }])

    const swept = [...entries, draw('expiry', '-400.00', expired.id)]
    expect(expiredRemainders(swept, NOW)).toEqual([])
    expect(balanceOf(swept, NOW)).toBe(50000)
    expect(lotsOf(swept, NOW).find((one) => one.id === expired.id)!.remainingPaise).toBe(0)
  })

  test('what runs out within 30 days', () => {
    const soon = lot('redeem', '300.00', daysFromNow(10))
    const far = lot('redeem', '700.00', daysFromNow(90))
    expect(expiringWithin([soon, far], NOW)).toBe(30000)
    expect(expiringWithin([soon, far, draw('debit', '-300.00', soon.id)], NOW)).toBe(0)
  })

  test('credit given back keeps the latest expiry it was paid from, never under 30 days', () => {
    expect(returnedCreditExpiresAt([daysFromNow(200), daysFromNow(100)], NOW)).toEqual(daysFromNow(200))
    expect(returnedCreditExpiresAt([daysFromNow(5)], NOW)).toEqual(daysFromNow(30))
    expect(returnedCreditExpiresAt([daysFromNow(-3)], NOW)).toEqual(daysFromNow(30))
    expect(returnedCreditExpiresAt([], NOW)).toEqual(daysFromNow(30))
  })

  test('a refund to credit is spendable again', () => {
    const gift = lot('redeem', '499.00', daysFromNow(100))
    const entries = [gift, draw('debit', '-499.00', gift.id)]
    expect(balanceOf(entries, NOW)).toBe(0)
    entries.push(lot('refund', '499.00', returnedCreditExpiresAt([gift.expiresAt!], NOW)))
    expect(balanceOf(entries, NOW)).toBe(49900)
  })
})

describe('checkout', () => {
  test('credit covering the whole booking pays it all: no Razorpay order', () => {
    expect(creditToUse(49900, 100000)).toBe(49900)
    expect(splitCheckout(49900, 100000)).toEqual({ creditPaise: 49900, cashPaise: 0 })
    expect(creditToUse(49900, 49900)).toBe(49900)
  })

  test('part credit: Razorpay takes the rest', () => {
    expect(splitCheckout(49900, 30000)).toEqual({ creditPaise: 30000, cashPaise: 19900 })
  })

  test("never leaves Razorpay less than ₹1, its smallest order", () => {
    // ₹499 against ₹498.50: ₹0.50 would be too little to charge.
    expect(splitCheckout(49900, 49850)).toEqual({ creditPaise: 49800, cashPaise: 100 })
    expect(splitCheckout(100, 50)).toEqual({ creditPaise: 0, cashPaise: 100 })
  })

  test('no credit, or nothing to pay', () => {
    expect(splitCheckout(49900, 0)).toEqual({ creditPaise: 0, cashPaise: 49900 })
    expect(creditToUse(0, 1000)).toBe(0)
  })

  test("a payment's two parts add up to the booking, and only an unreturned credit part is owed back as credit", () => {
    expect(paidInAll({ amount: '0.00', creditAmount: '499.00' })).toBe('499.00')
    expect(paidInAll({ amount: '199.00', creditAmount: '300.00' })).toBe('499.00')
    expect(paidInAll({ amount: '499.00' })).toBe('499.00')
    expect(creditStillToReturn({ amount: '0.00', creditAmount: '499.00', creditReturnedAt: null })).toBe(true)
    expect(creditStillToReturn({ amount: '0.00', creditAmount: '499.00', creditReturnedAt: NOW })).toBe(false)
    expect(creditStillToReturn({ amount: '499.00', creditAmount: '0.00' })).toBe(false)
  })
})

describe('manual adjustments', () => {
  test('never zero, never over ₹10,000, never more than the balance taken away', () => {
    expect(adjustmentRefusal({ amountPaise: 0, balancePaise: 0 })).toBe('zero')
    expect(adjustmentRefusal({ amountPaise: 1000001, balancePaise: 0 })).toBe('too_large')
    expect(adjustmentRefusal({ amountPaise: -20000, balancePaise: 10000 })).toBe('over_balance')
    expect(adjustmentRefusal({ amountPaise: -10000, balancePaise: 10000 })).toBeNull()
    expect(adjustmentRefusal({ amountPaise: 20000, balancePaise: 0 })).toBeNull()
  })
})
