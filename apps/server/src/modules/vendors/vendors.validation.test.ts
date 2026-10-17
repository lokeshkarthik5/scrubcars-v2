import { describe, expect, test } from 'bun:test'
import {
  createClosureSchema,
  updateJobTypesSchema,
  updateVendorSchema,
} from './vendors.validation.js'

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
