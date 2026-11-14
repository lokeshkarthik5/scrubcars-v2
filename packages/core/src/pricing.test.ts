import { describe, expect, test } from 'bun:test'
import {
  formatServicePrice,
  inspectionApprox,
  inspectionApproxLine,
  inspectionNoteUnderPrice,
  isNoFeeInspection,
  noFeeInspectionText,
  pricingHint,
  PRICING_TYPES,
} from './pricing'

// On inspection with no fee, and the approx price (0073).
const service = (price: number, approxPrice: number | null = null) => ({
  pricingType: 'on_inspection' as const,
  price,
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  approxPrice,
})

describe('isNoFeeInspection', () => {
  test('an inspection service with a ₹0 fee', () => {
    expect(isNoFeeInspection(service(0))).toBe(true)
    expect(isNoFeeInspection(service(299))).toBe(false)
    expect(isNoFeeInspection({ pricingType: 'flat', price: 0 })).toBe(false)
  })
})

describe('inspectionApprox', () => {
  test('only an inspection service, only a positive amount', () => {
    expect(inspectionApprox(service(0, 1500))).toBe(1500)
    expect(inspectionApprox(service(0, 0))).toBeNull()
    expect(inspectionApprox(service(0))).toBeNull()
    expect(inspectionApprox({ pricingType: 'flat', price: 499, approxPrice: 1500 })).toBeNull()
    // Absent, from an API older than 0073.
    expect(inspectionApprox({ pricingType: 'on_inspection', price: 0 })).toBeNull()
  })
})

describe('the customer wording', () => {
  test('no fee with an approx price: "Approx ₹1,500 · price after inspection"', () => {
    expect(noFeeInspectionText(service(0, 1500))).toBe('Approx ₹1,500 · price after inspection')
    expect(formatServicePrice(service(0, 1500))).toBe('Approx ₹1,500 · price after inspection')
  })

  test('no fee and no approx price: "Price on inspection", never ₹0', () => {
    expect(noFeeInspectionText(service(0))).toBe('Price on inspection')
    expect(formatServicePrice(service(0))).toBe('Price on inspection')
  })

  test('with a fee: the fee as today, and the approx line under it when set', () => {
    expect(formatServicePrice(service(299, 1500))).toBe('₹299 inspection')
    expect(inspectionNoteUnderPrice(service(299, 1500))).toBe('Approx ₹1,500 · price after inspection')
    expect(inspectionNoteUnderPrice(service(299))).toBeNull()
    // A no-fee one says it in its price slot already.
    expect(inspectionNoteUnderPrice(service(0, 1500))).toBeNull()
  })

  test('the approx line takes the screen’s money format', () => {
    expect(inspectionApproxLine(service(0, 1500.5), (n) => `Rs ${n}`)).toBe('Approx Rs 1500.5 · price after inspection')
  })
})

describe('the garage’s pricing hint', () => {
  test('a service on inspection: the fee is optional', () => {
    expect(PRICING_TYPES.find((pt) => pt.value === 'on_inspection')?.hint).toBe(
      'Priced after seeing the car; inspection fee optional'
    )
    expect(pricingHint('on_inspection')).toBe('Priced after seeing the car; inspection fee optional')
  })

  test('a package on inspection keeps its fee, and says so', () => {
    expect(pricingHint('on_inspection', true)).toBe('Upfront inspection fee; final work quoted after')
    expect(pricingHint('flat', true)).toBe('One fixed price')
  })
})
