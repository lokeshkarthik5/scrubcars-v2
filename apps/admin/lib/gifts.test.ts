import { describe, expect, test } from 'bun:test'
import {
  canCancelGift,
  cleanPhone,
  formatDay,
  giftsListHref,
  parseAdjustment,
  parseGiftFilter,
  signedRupees,
} from './gifts'

describe('the gifts list filter', () => {
  test('only known chips; All otherwise', () => {
    expect(parseGiftFilter('redeemed')).toBe('redeemed')
    expect(parseGiftFilter('nope')).toBe('all')
    expect(parseGiftFilter(null)).toBe('all')
  })

  test('All is the bare path', () => {
    expect(giftsListHref('all')).toBe('/gifts')
    expect(giftsListHref('expired')).toBe('/gifts?show=expired')
  })

  test('cancel only while it can still be paid or redeemed', () => {
    expect(canCancelGift('available')).toBe(true)
    expect(canCancelGift('pending')).toBe(true)
    expect(canCancelGift('redeemed')).toBe(false)
    expect(canCancelGift('cancelled')).toBe(false)
  })
})

describe('parseAdjustment', () => {
  test('signed rupees, any minus sign', () => {
    expect(parseAdjustment('+200')).toEqual({ amount: 200 })
    expect(parseAdjustment('-150')).toEqual({ amount: -150 })
    expect(parseAdjustment('−150')).toEqual({ amount: -150 })
    expect(parseAdjustment('₹1,000.50')).toEqual({ amount: 1000.5 })
  })

  test('refuses zero, too much, and anything else', () => {
    expect(parseAdjustment('0')).toEqual({ problem: 'Enter an amount other than ₹0.' })
    expect(parseAdjustment('10001')).toEqual({ problem: 'One adjustment can be at most ₹10,000.' })
    expect('problem' in parseAdjustment('-10000')).toBe(false)
    expect('problem' in parseAdjustment('abc')).toBe(true)
    expect('problem' in parseAdjustment('1.234')).toBe(true)
  })
})

describe('formatting', () => {
  test('signed amounts and days in Chennai', () => {
    expect(signedRupees('1000.00')).toBe('+₹1,000')
    expect(signedRupees('-450.5')).toBe('−₹450.5')
    expect(formatDay('2027-10-11T20:00:00Z')).toBe('12 Oct 2027')
    expect(formatDay(null)).toBe('—')
  })

  test('phones: ten digits, a +91 prefix dropped', () => {
    expect(cleanPhone('98765 43210')).toBe('9876543210')
    expect(cleanPhone('+91 98765 43210')).toBe('9876543210')
    expect(cleanPhone('12345')).toBeNull()
    expect(cleanPhone('1234567890')).toBeNull()
  })
})
