import { describe, expect, test } from 'bun:test'
import {
  createAddOnSchema,
  createClosureSchema,
  createPackageSchema,
  createServiceSchema,
  createVendorSchema,
  updateServiceSchema,
  listClosuresQuerySchema,
  listPublicVendorsQuerySchema,
  updateJobTypesSchema,
  updateVendorSchema,
} from './vendors.validation.js'

const NEW_GARAGE = {
  businessName: 'Test Garage',
  phone: '9876543210',
  address: '1 Main Road',
  city: 'Chennai',
  pincode: '600001',
  lat: 13.08,
  lng: 80.27,
}

describe('listClosuresQuerySchema', () => {
  test('from is optional, and a real calendar day when given', () => {
    expect(listClosuresQuerySchema.parse({})).toEqual({})
    expect(listClosuresQuerySchema.parse({ from: '2026-10-26' })).toEqual({ from: '2026-10-26' })
    expect(listClosuresQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false)
    expect(listClosuresQuerySchema.safeParse({ from: '26-10-2026' }).success).toBe(false)
  })
})

describe('createClosureSchema', () => {
  test('takes a real calendar day and an optional reason', () => {
    expect(createClosureSchema.parse({ date: '2026-10-20', reason: ' Diwali ' })).toEqual({
      date: '2026-10-20',
      reason: 'Diwali',
    })
    expect(createClosureSchema.parse({ date: '2026-10-20' })).toEqual({ date: '2026-10-20' })
  })

  test('refuses a day that does not exist, or any other shape', () => {
    expect(createClosureSchema.safeParse({ date: '2026-02-30' }).success).toBe(false)
    expect(createClosureSchema.safeParse({ date: '20/10/2026' }).success).toBe(false)
  })
})

describe('capacity on PATCH /vendors/me', () => {
  test('bays run from 1 to 20', () => {
    expect(updateVendorSchema.safeParse({ bays: 1 }).success).toBe(true)
    expect(updateVendorSchema.safeParse({ bays: 20 }).success).toBe(true)
    expect(updateVendorSchema.safeParse({ bays: 0 }).success).toBe(false)
    expect(updateVendorSchema.safeParse({ bays: 21 }).success).toBe(false)
  })

  test('the daily limit can be cleared with null', () => {
    expect(updateVendorSchema.parse({ jobsPerDay: null })).toEqual({ jobsPerDay: null })
    expect(updateVendorSchema.safeParse({ jobsPerDay: 0 }).success).toBe(false)
  })
})

describe('fields a garage may not write', () => {
  test('notes is the admin-only ops note: dropped from signup and PATCH /vendors/me', () => {
    // Stripped, not stored: the parsed input is what the service spreads into
    // the row, so a key missing here can never reach the column.
    expect(updateVendorSchema.parse({ bays: 2, notes: 'Checked by ops' })).toEqual({ bays: 2 })
    expect('notes' in createVendorSchema.parse({ ...NEW_GARAGE, notes: 'OK to verify' })).toBe(false)
    // On its own it is no change at all, so the update is refused.
    expect(updateVendorSchema.safeParse({ notes: '' }).success).toBe(false)
  })
})

describe('doorstep radius on PATCH /vendors/me', () => {
  test('null clears it, so the garage falls back to the default', () => {
    expect(updateVendorSchema.parse({ doorstepRadiusKm: null })).toEqual({ doorstepRadiusKm: null })
    expect(updateVendorSchema.parse({ doorstepRadiusKm: 6 })).toEqual({ doorstepRadiusKm: 6 })
    expect(updateVendorSchema.safeParse({ doorstepRadiusKm: 0 }).success).toBe(false)
    expect(updateVendorSchema.safeParse({ doorstepRadiusKm: 300 }).success).toBe(true)
    expect(updateVendorSchema.safeParse({ doorstepRadiusKm: 301 }).success).toBe(false)
  })
})

describe('updateJobTypesSchema', () => {
  test('a doorstep distance travels with the switch, from 1 to 300 km (the 30 km top lifted, 10 Nov 2026)', () => {
    for (const km of [1, 8, 45, 300]) {
      expect(updateJobTypesSchema.safeParse({ doorstepEnabled: true, doorstepRadiusKm: km }).success).toBe(true)
    }
    for (const km of [0.5, 301]) {
      expect(updateJobTypesSchema.safeParse({ doorstepEnabled: true, doorstepRadiusKm: km }).success).toBe(false)
    }
  })

  test('"All over <city>" for doorstep and pickup is a request on its own (0069)', () => {
    expect(updateJobTypesSchema.parse({ doorstepWholeCity: true })).toEqual({ doorstepWholeCity: true })
    expect(updateJobTypesSchema.parse({ pickupWholeCity: false })).toEqual({ pickupWholeCity: false })
    expect(updateJobTypesSchema.parse({ doorstepRadiusKm: 45 })).toEqual({ doorstepRadiusKm: 45 })
    expect(updateJobTypesSchema.safeParse({ doorstepWholeCity: 'yes' }).success).toBe(false)
  })
})

describe('pickup & drop on PATCH /vendors/me/job-types', () => {
  test('on, off, the tick and a radius from 1 to 300 km (null for the default)', () => {
    expect(
      updateJobTypesSchema.parse({ pickupEnabled: true, pickupTermsAccepted: true, pickupRadiusKm: 8 })
    ).toEqual({ pickupEnabled: true, pickupTermsAccepted: true, pickupRadiusKm: 8 })
    expect(updateJobTypesSchema.safeParse({ pickupEnabled: false }).success).toBe(true)
    expect(updateJobTypesSchema.safeParse({ pickupRadiusKm: null }).success).toBe(true)
    expect(updateJobTypesSchema.safeParse({ pickupRadiusKm: 45 }).success).toBe(true)
    expect(updateJobTypesSchema.safeParse({ pickupRadiusKm: 301 }).success).toBe(false)
    expect(updateJobTypesSchema.safeParse({ pickupRadiusKm: 0.5 }).success).toBe(false)
  })

  test('a tick alone changes nothing, so it is not a request', () => {
    expect(updateJobTypesSchema.safeParse({ pickupTermsAccepted: true }).success).toBe(false)
  })

  test('the profile save cannot set pickup any more: it is dropped', () => {
    expect(updateVendorSchema.parse({ bays: 2, pickup: 'yes' } as never)).toEqual({ bays: 2 })
  })
})

describe('"Certified only" on GET /vendors', () => {
  test('certified=true filters, false or absent does not, anything else is refused', () => {
    expect(listPublicVendorsQuerySchema.parse({ certified: 'true' }).certified).toBe(true)
    expect(listPublicVendorsQuerySchema.parse({ certified: 'false' }).certified).toBe(false)
    expect(listPublicVendorsQuerySchema.parse({}).certified).toBeUndefined()
    expect(listPublicVendorsQuerySchema.safeParse({ certified: '1' }).success).toBe(false)
  })

  test('it goes with sorting and paging', () => {
    const query = listPublicVendorsQuerySchema.parse({ certified: 'true', sort: 'rating', limit: '10', cursor: 'abc' })
    expect(query).toMatchObject({ certified: true, sort: 'rating', limit: 10, cursor: 'abc' })
  })
})

describe('"Luxury specialists" on GET /vendors (0083)', () => {
  test('luxuryMake takes a luxury make exactly as LUXURY_MAKES writes it, nothing else', () => {
    expect(listPublicVendorsQuerySchema.parse({ luxuryMake: 'Mercedes-Benz' }).luxuryMake).toBe('Mercedes-Benz')
    expect(listPublicVendorsQuerySchema.parse({}).luxuryMake).toBeUndefined()
    for (const bad of ['benz', 'bmw', 'Toyota', 'Other', '']) {
      expect(listPublicVendorsQuerySchema.safeParse({ luxuryMake: bad }).success).toBe(false)
    }
  })

  test('luxury=1 or true filters, 0, false or absent does not, anything else is refused', () => {
    expect(listPublicVendorsQuerySchema.parse({ luxury: '1' }).luxury).toBe(true)
    expect(listPublicVendorsQuerySchema.parse({ luxury: 'true' }).luxury).toBe(true)
    expect(listPublicVendorsQuerySchema.parse({ luxury: '0' }).luxury).toBe(false)
    expect(listPublicVendorsQuerySchema.parse({ luxury: 'false' }).luxury).toBe(false)
    expect(listPublicVendorsQuerySchema.parse({}).luxury).toBeUndefined()
    expect(listPublicVendorsQuerySchema.safeParse({ luxury: 'yes' }).success).toBe(false)
  })

  test('it goes with the service, Silver & above and every mode', () => {
    for (const bookingType of ['dropin', 'doorstep', 'pickup'] as const) {
      const query = listPublicVendorsQuerySchema.parse({
        luxury: '1',
        tier: 'silver',
        category: 'car_wash',
        bookingType,
        lat: '13.08',
        lng: '80.27',
      })
      expect(query).toMatchObject({ luxury: true, tier: 'silver', category: 'car_wash', bookingType })
    }
  })
})

// On inspection with no fee, and the approx price (0073).
describe('a service priced on inspection', () => {
  const base = { name: 'Dent repair', category: 'scratch_removal' as const, pricingType: 'on_inspection' as const, durationMins: 60 }

  test('needs no fee: left out or ₹0 is a free inspection', () => {
    expect(createServiceSchema.safeParse(base).success).toBe(true)
    expect(createServiceSchema.safeParse({ ...base, price: 0 }).success).toBe(true)
    expect(createServiceSchema.safeParse({ ...base, price: 299 }).success).toBe(true)
  })

  test('takes an optional positive approx price, or null', () => {
    expect(createServiceSchema.safeParse({ ...base, approxPrice: 1500 }).success).toBe(true)
    expect(createServiceSchema.safeParse({ ...base, approxPrice: null }).success).toBe(true)
    expect(createServiceSchema.safeParse({ ...base, approxPrice: 0 }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...base, approxPrice: -5 }).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...base, approxPrice: 100_000_000 }).success).toBe(false)
  })

  test('never a negative fee', () => {
    expect(createServiceSchema.safeParse({ ...base, price: -1 }).success).toBe(false)
  })

  test('a flat price still needs to be above ₹0', () => {
    const flat = { ...base, pricingType: 'flat' as const }
    expect(createServiceSchema.safeParse({ ...flat, price: 0 }).success).toBe(false)
    expect(createServiceSchema.safeParse(flat).success).toBe(false)
    expect(createServiceSchema.safeParse({ ...flat, price: 499 }).success).toBe(true)
  })

  test('an update to on inspection with no fee, or only the approx price', () => {
    expect(updateServiceSchema.safeParse({ pricingType: 'on_inspection' }).success).toBe(true)
    expect(updateServiceSchema.safeParse({ approxPrice: 900 }).success).toBe(true)
    expect(updateServiceSchema.safeParse({ approxPrice: null }).success).toBe(true)
    expect(updateServiceSchema.safeParse({ pricingType: 'flat', price: 0 }).success).toBe(false)
  })

  test('a package and an add-on keep their positive price', () => {
    expect(
      createPackageSchema.safeParse({ name: 'Bundle', pricingType: 'on_inspection', durationMins: 60, serviceIds: [crypto.randomUUID(), crypto.randomUUID()] })
        .success
    ).toBe(false)
    expect(createAddOnSchema.safeParse({ name: 'Helmet wash', price: 0 }).success).toBe(false)
  })
})
