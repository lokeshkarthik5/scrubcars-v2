import { describe, expect, it } from 'bun:test'
import { computeServiceAmount, sumAmounts } from './pricing.js'

// Multi-service bookings made these two functions the whole money path: every
// line runs through computeServiceAmount, and the total the customer is charged
// is sumAmounts over those lines. They had no tests before that change.

describe('sumAmounts', () => {
  it('adds decimal strings and keeps two places', () => {
    expect(sumAmounts(['499.00', '250.50', '1200.00'])).toBe('1949.50')
  })

  it('does not accumulate float error', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float arithmetic. Summed in paise
    // it does not, which is the entire reason this helper exists.
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30')
    expect(sumAmounts(Array.from({ length: 100 }, () => '0.07'))).toBe('7.00')
  })

  it('is 0.00 for no lines', () => {
    expect(sumAmounts([])).toBe('0.00')
  })
})

describe('computeServiceAmount', () => {
  const flat = {
    pricingType: 'flat' as const,
    price: '499.00',
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
  }

  const perVehicle = {
    pricingType: 'per_vehicle' as const,
    // The base price is the *cheapest* tier, which is exactly why it must
    // never be used as a fallback for a missing one.
    price: '499.00',
    priceHatchback: '499.00',
    priceSedan: '699.00',
    priceSuv: null,
  }

  it('charges the flat price whatever the vehicle', () => {
    expect(computeServiceAmount(flat, 'suv')).toBe('499.00')
  })

  it('charges an inspection fee like a flat price', () => {
    expect(
      computeServiceAmount({ ...flat, pricingType: 'on_inspection' }, 'sedan')
    ).toBe('499.00')
  })

  it('charges the tier that matches the vehicle', () => {
    expect(computeServiceAmount(perVehicle, 'hatchback')).toBe('499.00')
    expect(computeServiceAmount(perVehicle, 'sedan')).toBe('699.00')
  })

  it('refuses rather than billing an SUV at the hatchback rate', () => {
    expect(computeServiceAmount(perVehicle, 'suv')).toBeNull()
  })
})
