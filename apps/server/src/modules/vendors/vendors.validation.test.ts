import { describe, expect, test } from 'bun:test'
import {
  createClosureSchema,
  createVendorSchema,
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
  })
})

describe('updateJobTypesSchema', () => {
  test('a doorstep distance travels with the switch, from 1 to 30 km', () => {
    expect(
      updateJobTypesSchema.safeParse({ doorstepEnabled: true, doorstepRadiusKm: 8 }).success
    ).toBe(true)
    expect(
      updateJobTypesSchema.safeParse({ doorstepEnabled: true, doorstepRadiusKm: 31 }).success
    ).toBe(false)
    expect(
      updateJobTypesSchema.safeParse({ doorstepEnabled: true, doorstepRadiusKm: 0.5 }).success
    ).toBe(false)
  })
})

describe('pickup & drop on PATCH /vendors/me/job-types', () => {
  test('on, off, the tick and a radius from 1 to 30 km (null for the default)', () => {
    expect(
      updateJobTypesSchema.parse({ pickupEnabled: true, pickupTermsAccepted: true, pickupRadiusKm: 8 })
    ).toEqual({ pickupEnabled: true, pickupTermsAccepted: true, pickupRadiusKm: 8 })
    expect(updateJobTypesSchema.safeParse({ pickupEnabled: false }).success).toBe(true)
    expect(updateJobTypesSchema.safeParse({ pickupRadiusKm: null }).success).toBe(true)
    expect(updateJobTypesSchema.safeParse({ pickupRadiusKm: 31 }).success).toBe(false)
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
