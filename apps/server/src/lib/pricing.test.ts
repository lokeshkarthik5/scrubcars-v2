import { describe, expect, it } from 'bun:test'
import {
  computeServiceAmount,
  computeStartingPrice,
  isNoFeeInspection,
  isNoFeeInspectionCheckout,
  nothingPaidCheckoutKind,
  pricingUpdateColumns,
  resolveServicePricing,
  sumAmounts,
} from './pricing.js'

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

// On inspection with no fee, and the approx price (0073).
describe('resolveServicePricing on inspection', () => {
  it('takes no fee as ₹0, a free inspection', () => {
    expect(resolveServicePricing({ pricingType: 'on_inspection' })).toEqual({
      pricingType: 'on_inspection',
      price: '0.00',
      priceHatchback: null,
      priceSedan: null,
      priceSuv: null,
      approxPrice: null,
    })
  })

  it('keeps a fee for a garage that wants one, and the approx price', () => {
    expect(resolveServicePricing({ pricingType: 'on_inspection', price: 299, approxPrice: 1500 })).toMatchObject({
      price: '299.00',
      approxPrice: '1500.00',
    })
  })

  it('writes no approx price for any other pricing type', () => {
    expect(resolveServicePricing({ pricingType: 'flat', price: 499, approxPrice: 1500 }).approxPrice).toBeNull()
    expect(
      resolveServicePricing({ pricingType: 'per_vehicle', priceHatchback: 1, priceSedan: 2, priceSuv: 3, approxPrice: 9 })
        .approxPrice
    ).toBeNull()
  })

  it('treats a null or non-positive approx price as none', () => {
    expect(resolveServicePricing({ pricingType: 'on_inspection', approxPrice: null }).approxPrice).toBeNull()
    expect(resolveServicePricing({ pricingType: 'on_inspection', approxPrice: 0 }).approxPrice).toBeNull()
  })
})

describe('pricingUpdateColumns', () => {
  it('rewrites the whole block on a new type, keeping a stored approx price an older client leaves out', () => {
    const columns = pricingUpdateColumns({ pricingType: 'on_inspection', price: 0 }, 'flat')
    expect(columns).toEqual({ pricingType: 'on_inspection', price: '0.00', priceHatchback: null, priceSedan: null, priceSuv: null })
    expect(columns).not.toHaveProperty('approxPrice')
  })

  it('clears the approx price with null, and on a switch away from inspection', () => {
    expect(pricingUpdateColumns({ pricingType: 'on_inspection', approxPrice: null }, 'on_inspection')).toMatchObject({ approxPrice: null })
    expect(pricingUpdateColumns({ pricingType: 'flat', price: 499 }, 'on_inspection')).toMatchObject({ approxPrice: null })
  })

  it('without a type, a ₹0 price only for a service already on inspection', () => {
    expect(pricingUpdateColumns({ price: 0 }, 'on_inspection')).toEqual({ price: '0.00' })
    expect(pricingUpdateColumns({ price: 0 }, 'flat')).toBe('price_required')
    expect(pricingUpdateColumns({ price: 0 }, 'per_vehicle')).toBe('price_required')
    expect(pricingUpdateColumns({ price: 350 }, 'flat')).toEqual({ price: '350.00' })
  })

  it('without a type, an approx price lands only on an inspection service', () => {
    expect(pricingUpdateColumns({ approxPrice: 1200 }, 'on_inspection')).toEqual({ approxPrice: '1200.00' })
    expect(pricingUpdateColumns({ approxPrice: 1200 }, 'flat')).toEqual({})
    expect(pricingUpdateColumns({}, 'on_inspection')).toEqual({})
  })
})

describe('isNoFeeInspection', () => {
  it('is an inspection service whose fee is ₹0', () => {
    expect(isNoFeeInspection({ pricingType: 'on_inspection', price: '0.00' })).toBe(true)
    expect(isNoFeeInspection({ pricingType: 'on_inspection', price: '299.00' })).toBe(false)
    expect(isNoFeeInspection({ pricingType: 'flat', price: '0.00' })).toBe(false)
  })
})

describe('isNoFeeInspectionCheckout', () => {
  it('is an inspection line with nothing to pay at all', () => {
    expect(isNoFeeInspectionCheckout({ pricingTypes: ['on_inspection'], amount: '0.00', chargeAmount: '0.00' })).toBe(true)
  })

  it('is not one with a paid add-on, another service or a travel fee', () => {
    expect(isNoFeeInspectionCheckout({ pricingTypes: ['on_inspection', 'flat'], amount: '99.00', chargeAmount: '99.00' })).toBe(false)
    expect(isNoFeeInspectionCheckout({ pricingTypes: ['on_inspection'], amount: '150.00', chargeAmount: '150.00' })).toBe(false)
  })

  it('is never a free wash or any other ₹0 checkout', () => {
    expect(isNoFeeInspectionCheckout({ pricingTypes: ['flat'], amount: '299.00', chargeAmount: '0.00' })).toBe(false)
    expect(isNoFeeInspectionCheckout({ pricingTypes: ['on_inspection'], amount: '299.00', chargeAmount: '0.00' })).toBe(false)
  })
})

describe('nothingPaidCheckoutKind', () => {
  it('a code is the free wash (checked under its lock); ₹0 services and no code, a no-fee inspection', () => {
    expect(nothingPaidCheckoutKind({ subtotalAmount: '299.00', discountId: 'd1' })).toBe('free_wash')
    expect(nothingPaidCheckoutKind({ subtotalAmount: '0.00', discountId: null })).toBe('no_fee_inspection')
  })

  it('never a booking that costs something with nothing paid', () => {
    expect(nothingPaidCheckoutKind({ subtotalAmount: '299.00', discountId: null })).toBeNull()
  })
})

describe('computeStartingPrice', () => {
  it('never says "from ₹0" for a no-fee inspection', () => {
    expect(computeStartingPrice([{ pricingType: 'on_inspection', price: '0.00' }])).toBeNull()
    expect(
      computeStartingPrice([
        { pricingType: 'on_inspection', price: '0.00' },
        { pricingType: 'flat', price: '450.00' },
      ])
    ).toBe(450)
  })
})
