import { describe, expect, test } from 'bun:test'
import { favouriteVendorParamSchema } from './favourites.validation.js'

describe('favouriteVendorParamSchema', () => {
  test('a garage id, and nothing that is not one', () => {
    const id = 'e2e00000-0000-4000-8000-000000000301'
    expect(favouriteVendorParamSchema.parse({ vendorId: id })).toEqual({ vendorId: id })
    expect(favouriteVendorParamSchema.safeParse({ vendorId: 'main' }).success).toBe(false)
    expect(favouriteVendorParamSchema.safeParse({}).success).toBe(false)
  })
})
