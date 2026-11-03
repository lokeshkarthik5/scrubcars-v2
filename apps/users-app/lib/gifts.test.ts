import { describe, expect, test } from 'bun:test'
import {
  carriesGiftCode,
  checkoutCreditSplit,
  creditToUsePaise,
  formatGiftCode,
  formatGiftDate,
  giftAmountProblem,
  giftEvidenceLine,
  giftShareText,
  parseGiftAmount,
  signedRupees,
  whatsAppShareUrl,
} from './gifts'

describe('creditToUsePaise (the server rule, mirrored)', () => {
  test('a balance that covers the booking pays all of it', () => {
    expect(creditToUsePaise(80000, 100000)).toBe(80000)
    expect(creditToUsePaise(80000, 80000)).toBe(80000)
  })

  test('a smaller balance is used up, Razorpay takes the rest', () => {
    expect(creditToUsePaise(80000, 50000)).toBe(50000)
    // Exactly ₹1 left to Razorpay is fine.
    expect(creditToUsePaise(80000, 79900)).toBe(79900)
  })

  test('never leaves Razorpay less than ₹1: stops at the charge − ₹1', () => {
    expect(creditToUsePaise(80000, 79950)).toBe(79900)
    expect(creditToUsePaise(80000, 79999)).toBe(79900)
    expect(creditToUsePaise(50, 40)).toBe(0)
  })

  test('nothing to use, or nothing to pay', () => {
    expect(creditToUsePaise(80000, 0)).toBe(0)
    expect(creditToUsePaise(0, 50000)).toBe(0)
  })
})

describe('checkoutCreditSplit', () => {
  test('credit after the promo price, and what is left to pay', () => {
    expect(checkoutCreditSplit(799, 500)).toEqual({ credit: 500, toPay: 299 })
    expect(checkoutCreditSplit(799, 1000)).toEqual({ credit: 799, toPay: 0 })
    expect(checkoutCreditSplit(799, 798.5)).toEqual({ credit: 798, toPay: 1 })
    expect(checkoutCreditSplit(799, 0)).toEqual({ credit: 0, toPay: 799 })
  })

  test('paise stay exact', () => {
    expect(checkoutCreditSplit(499.5, 200.25)).toEqual({ credit: 200.25, toPay: 299.25 })
  })
})

describe('gift words', () => {
  test('a code in fours', () => {
    expect(formatGiftCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS')
    expect(formatGiftCode('abcd-efgh jkmn pqrs')).toBe('ABCD-EFGH-JKMN-PQRS')
  })

  test('amounts: whole rupees in the range', () => {
    const limits = { min: 300, max: 5000 }
    expect(giftAmountProblem(1000, limits)).toBeNull()
    expect(giftAmountProblem(300, limits)).toBeNull()
    expect(giftAmountProblem(5000, limits)).toBeNull()
    expect(giftAmountProblem(299, limits)).toBe('Choose a whole amount from ₹300 to ₹5,000.')
    expect(giftAmountProblem(5001, limits)).not.toBeNull()
    expect(giftAmountProblem(null, limits)).not.toBeNull()
    expect(parseGiftAmount('₹1,500')).toBe(1500)
    expect(parseGiftAmount('')).toBeNull()
  })

  test('dates in Chennai', () => {
    // 20:00 UTC on 11 Oct is 01:30 on 12 Oct in Chennai.
    expect(formatGiftDate('2027-10-11T20:00:00Z')).toBe('12 Oct 2027')
    // "Sep", never the "Sept" browsers write for en-IN.
    expect(formatGiftDate('2027-09-14T06:00:00Z')).toBe('14 Sep 2027')
  })

  test('ledger amounts carry their sign', () => {
    expect(signedRupees('1000.00')).toBe('+₹1,000')
    expect(signedRupees('-450.00')).toBe('−₹450')
  })

  test('the purchase evidence line', () => {
    expect(
      giftEvidenceLine({
        number: 'G-000123',
        amount: '1000.00',
        paidAt: '2026-10-12T06:00:00Z',
        paymentId: 'pay_ABC123',
      })
    ).toBe('Gift G-000123 · paid ₹1,000 on 12 Oct 2026 · Razorpay payment pay_ABC123')
    expect(giftEvidenceLine({ number: 'G-000124', amount: '500.00', paidAt: null, paymentId: null })).toBe(
      'Gift G-000124'
    )
  })

  test('the share text and WhatsApp link', () => {
    const text = giftShareText({ amount: '1000.00', recipientName: 'Asha', url: 'https://detlio.com/gift/X' })
    expect(text).toBe(
      'Asha, here is a ₹1,000 Detlio gift for you. Open the link to add it to your Detlio credit and book a car wash: https://detlio.com/gift/X'
    )
    expect(whatsAppShareUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c')
  })
})

describe('carriesGiftCode', () => {
  test('the gift page and sign-in on the way back to it', () => {
    expect(carriesGiftCode('/gift/ABCDEFGHJKMNPQRS', null)).toBe(true)
    expect(carriesGiftCode('/login', '/gift/ABCDEFGHJKMNPQRS')).toBe(true)
    expect(carriesGiftCode('/login', '/profile/gifts')).toBe(false)
    expect(carriesGiftCode('/profile/gifts', null)).toBe(false)
    expect(carriesGiftCode('/gift', null)).toBe(false)
  })
})
