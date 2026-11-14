import { describe, expect, test } from 'bun:test'
import {
  approxBoxFrom,
  approxInvalid,
  approxToSend,
  feeBoxFrom,
  inspectionFeeValid,
  inspectionPricingValid,
} from './inspection-price'

describe('on inspection: optional fee and approx price (0073)', () => {
  test('an empty fee is a free inspection, and so is 0', () => {
    expect(inspectionFeeValid('')).toBe(true)
    expect(inspectionFeeValid('0')).toBe(true)
    expect(inspectionFeeValid('299')).toBe(true)
    expect(inspectionFeeValid('-5')).toBe(false)
  })

  test('the approx price is empty or above ₹0', () => {
    expect(approxInvalid('')).toBe(false)
    expect(approxInvalid('1500')).toBe(false)
    expect(approxInvalid('0')).toBe(true)
    expect(approxInvalid('-1')).toBe(true)
    expect(inspectionPricingValid('', '')).toBe(true)
    expect(inspectionPricingValid('', '1500')).toBe(true)
    expect(inspectionPricingValid('299', '0')).toBe(false)
  })

  test('what is sent: the approx as a number, or null to clear it', () => {
    expect(approxToSend('1500')).toBe(1500)
    expect(approxToSend('')).toBeNull()
    expect(approxToSend('0')).toBeNull()
  })

  test('edit fills the boxes: no "0" fee, the stored approx only on inspection', () => {
    expect(feeBoxFrom({ price: 0 })).toBe('')
    expect(feeBoxFrom({ price: 299 })).toBe('299')
    expect(approxBoxFrom({ pricingType: 'on_inspection', approxPrice: 1500 })).toBe('1500')
    expect(approxBoxFrom({ pricingType: 'on_inspection', approxPrice: null })).toBe('')
    expect(approxBoxFrom({ pricingType: 'flat', approxPrice: 1500 })).toBe('')
  })
})
