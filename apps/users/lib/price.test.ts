import { describe, expect, test } from 'bun:test'
import { pricedForCar, servicePriceText } from './price'

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
})
