import { describe, expect, test } from 'bun:test'
import { formatReceiptAmount, receiptFileTitle } from './receipts'

describe('formatReceiptAmount', () => {
  test('always shows paise', () => {
    expect(formatReceiptAmount('499.00')).toBe('₹499.00')
    expect(formatReceiptAmount('2298.5')).toBe('₹2,298.50')
    expect(formatReceiptAmount(0)).toBe('₹0.00')
  })

  test('groups the Indian way', () => {
    expect(formatReceiptAmount('123456.00')).toBe('₹1,23,456.00')
  })

  test('a refund reads with a minus sign, never a negative zero', () => {
    expect(formatReceiptAmount('499.00', true)).toBe('−₹499.00')
    expect(formatReceiptAmount('0.00', true)).toBe('₹0.00')
  })

  test('something that is not a number reads as nothing, not NaN', () => {
    expect(formatReceiptAmount('not a number')).toBe('₹0.00')
  })
})

describe('receiptFileTitle', () => {
  test('names the saved PDF after the number, with hyphens for slashes', () => {
    expect(receiptFileTitle('DTL/26-27/000123')).toBe('Detlio receipt DTL-26-27-000123')
  })
})
