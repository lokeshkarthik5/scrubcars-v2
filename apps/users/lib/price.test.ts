import { describe, expect, test } from 'bun:test'
import {
  bookingLinePriceText,
  pricedForCar,
  serviceApproxNote,
  servicePriceText,
} from './price'

const tiered = {
  pricingType: 'per_vehicle' as const,
  price: 349,
  priceHatchback: 349,
  priceSedan: 449,
  priceSuv: 1599,
}

describe('servicePriceText', () => {
  test('writes rupees with Indian commas', () => {
    expect(
      servicePriceText({ ...tiered, pricingType: 'flat', price: 2299 })
    ).toBe('₹2,299')
    expect(
      servicePriceText({ ...tiered, pricingType: 'on_inspection', price: 1299 })
    ).toBe('₹1,299 inspection')
  })

  test("is the car's own price when the car is known, a range otherwise", () => {
    expect(servicePriceText(tiered, 'suv')).toBe('₹1,599')
    expect(servicePriceText(tiered)).toBe('₹349–₹1,599')
    expect(servicePriceText({ ...tiered, priceSuv: null }, 'suv')).toBe(
      'Price on request'
    )
  })

  test('says "for your car" only for a per-vehicle price that is set', () => {
    expect(pricedForCar(tiered, 'sedan')).toBe(true)
    expect(pricedForCar(tiered, null)).toBe(false)
    expect(pricedForCar({ ...tiered, pricingType: 'flat' }, 'sedan')).toBe(
      false
    )
    expect(pricedForCar({ ...tiered, priceSuv: null }, 'suv')).toBe(false)
  })

  test('on inspection with no fee is never ₹0 (0073)', () => {
    const noFee = { ...tiered, pricingType: 'on_inspection' as const, price: 0 }
    expect(servicePriceText(noFee)).toBe('Price on inspection')
    expect(servicePriceText({ ...noFee, approxPrice: 1500 })).toBe(
      'Approx ₹1,500 · price after inspection'
    )
    expect(servicePriceText({ ...noFee, approxPrice: null }, 'suv')).toBe(
      'Price on inspection'
    )
  })
})

describe('serviceApproxNote', () => {
  const inspection = { pricingType: 'on_inspection' as const, price: 299 }

  test('is the approx line under an inspection fee', () => {
    expect(serviceApproxNote({ ...inspection, approxPrice: 1500 })).toBe(
      'Approx ₹1,500 · price after inspection'
    )
    expect(serviceApproxNote(inspection)).toBeNull()
  })

  test('is nothing for a no-fee inspection (its price says it) or another type', () => {
    expect(
      serviceApproxNote({ ...inspection, price: 0, approxPrice: 1500 })
    ).toBeNull()
    expect(
      serviceApproxNote({ pricingType: 'flat', price: 299, approxPrice: 1500 })
    ).toBeNull()
  })
})

describe('bookingLinePriceText', () => {
  test('a no-fee inspection line is never ₹0 (0073)', () => {
    expect(bookingLinePriceText({ amount: 0, pricingType: 'on_inspection' })).toBe(
      'Price on inspection'
    )
    expect(bookingLinePriceText({ amount: 299, pricingType: 'on_inspection' })).toBe(
      '₹299'
    )
    expect(bookingLinePriceText({ amount: 1499, pricingType: 'flat' })).toBe('₹1,499')
  })
})
