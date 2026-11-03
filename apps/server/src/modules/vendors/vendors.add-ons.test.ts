/**
 * Add-ons (0068): what the management routes accept, the shape that keeps them
 * out of a service's fields, and every SQL read of `services` a customer's
 * list or map reads, which must leave them out.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { createAddOnSchema, updateAddOnSchema } from './vendors.validation.js'

describe('createAddOnSchema', () => {
  test('a flat add-on needs a name and a price; extra minutes are optional', () => {
    const parsed = createAddOnSchema.parse({ name: ' Helmet wash ', price: 99 })
    expect(parsed).toEqual({
      name: 'Helmet wash',
      price: 99,
      pricingType: 'flat',
      isActive: true,
    })
    expect(createAddOnSchema.safeParse({ name: 'Helmet wash' }).success).toBe(
      false
    )
    expect(createAddOnSchema.safeParse({ name: '', price: 99 }).success).toBe(
      false
    )
  })

  test('per vehicle needs all three car types', () => {
    const base = {
      name: 'Oil change',
      pricingType: 'per_vehicle',
      priceHatchback: 899,
      priceSedan: 999,
    }
    expect(createAddOnSchema.safeParse(base).success).toBe(false)
    expect(
      createAddOnSchema.safeParse({ ...base, priceSuv: 1199 }).success
    ).toBe(true)
  })

  test('no category, description, photos or on-inspection price can ride along', () => {
    const ok = { name: 'Air freshener', price: 49 }
    expect(
      createAddOnSchema.safeParse({ ...ok, category: 'car_wash' }).success
    ).toBe(false)
    expect(
      createAddOnSchema.safeParse({ ...ok, description: 'Nice' }).success
    ).toBe(false)
    expect(createAddOnSchema.safeParse({ ...ok, isAddon: false }).success).toBe(
      false
    )
    expect(
      createAddOnSchema.safeParse({ ...ok, pricingType: 'on_inspection' })
        .success
    ).toBe(false)
  })

  test('extra minutes: blank or 0 is none, and a day is the most', () => {
    expect(
      createAddOnSchema.safeParse({ name: 'A', price: 1, extraMins: null })
        .success
    ).toBe(true)
    expect(
      createAddOnSchema.safeParse({ name: 'A', price: 1, extraMins: 0 }).success
    ).toBe(true)
    expect(
      createAddOnSchema.safeParse({ name: 'A', price: 1, extraMins: 481 })
        .success
    ).toBe(false)
    expect(
      createAddOnSchema.safeParse({ name: 'A', price: 1, extraMins: 1.5 })
        .success
    ).toBe(false)
  })
})

describe('updateAddOnSchema', () => {
  test('takes one field, and refuses an empty body or a stray one', () => {
    expect(updateAddOnSchema.safeParse({ isActive: false }).success).toBe(true)
    expect(updateAddOnSchema.safeParse({}).success).toBe(false)
    expect(updateAddOnSchema.safeParse({ category: 'others' }).success).toBe(
      false
    )
  })
})

describe('reads that mean a service', () => {
  const source = (path: string) =>
    readFileSync(new URL(path, import.meta.url), 'utf8')

  // "From ₹X", search, category filters and the map: raw SQL on `services`.
  test.each([['./vendors.repository.ts'], ['../reach/reach.repository.ts']])(
    'every raw read of services in %s leaves add-ons out',
    (path) => {
      const reads =
        source(path).match(
          /FROM services s\s+WHERE[^`]*?(?=\n\s*(?:\)|AND s\.category IN|`))/g
        ) ?? []
      expect(reads.length).toBeGreaterThan(0)
      for (const read of reads) expect(read).toContain('s.is_addon = false')
    }
  )
})
