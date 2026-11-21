import { describe, expect, test } from 'bun:test'
import type { AdminOthersService } from '@repo/core/api/admin'
import { othersCounts, othersPriceLabel, othersRows, rowsForTab } from './services-in-others'

const service = (id: string, name: string, patch: Partial<AdminOthersService> = {}): AdminOthersService => ({
  id,
  name,
  vendorId: 'g1',
  vendorName: 'Murugan Motors',
  pricingType: 'flat',
  price: '1800.00',
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  approxPrice: null,
  categoryHintDismissedAt: null,
  ...patch,
})

const list = [
  service('a', 'Clutch overhaul'),
  service('b', 'Bike wash'),
  service('c', 'Bumper painting'),
  service('d', 'Battery replacement', { categoryHintDismissedAt: '2026-11-16T10:00:00.000Z' }),
]

describe('othersRows', () => {
  test('only names that look like the new categories, with the matched word', () => {
    const rows = othersRows(list, {}, {})
    expect(rows.map((row) => [row.service.id, row.category, row.keyword, row.state])).toEqual([
      ['a', 'repairs', 'clutch', 'check'],
      ['c', 'dent_paint', 'bumper', 'check'],
      ['d', 'repairs', 'battery', 'dismissed'],
    ])
    expect(othersCounts(rows)).toEqual({ check: 2, moved: 0, dismissed: 1 })
  })

  test("this page's moves and Not this over what the API said", () => {
    const rows = othersRows(list, { a: 'repairs' }, { c: true, d: false })
    expect(rows.map((row) => [row.service.id, row.state])).toEqual([
      ['a', 'moved'],
      ['c', 'dismissed'],
      ['d', 'check'],
    ])
    expect(othersCounts(rows)).toEqual({ check: 1, moved: 1, dismissed: 1 })
  })

  test('To check keeps a row moved here in place, with its Undo', () => {
    const rows = othersRows(list, { a: 'repairs' }, {})
    expect(rowsForTab(rows, 'check', new Set(['a'])).map((row) => row.service.id)).toEqual(['a', 'c'])
    expect(rowsForTab(rows, 'moved', new Set(['a'])).map((row) => row.service.id)).toEqual(['a'])
    expect(rowsForTab(rows, 'dismissed', new Set(['a'])).map((row) => row.service.id)).toEqual(['d'])
  })
})

describe('othersPriceLabel', () => {
  test('a span by car type, one price, or the inspection fee', () => {
    expect(
      othersPriceLabel({ pricingType: 'per_vehicle', price: '1199.00', priceHatchback: '1199.00', priceSedan: '1399.00', priceSuv: '1699.00' })
    ).toBe('₹1,199 – ₹1,699')
    expect(othersPriceLabel({ pricingType: 'flat', price: '1800.00', priceHatchback: null, priceSedan: null, priceSuv: null })).toBe('₹1,800')
    expect(othersPriceLabel({ pricingType: 'on_inspection', price: '0.00', priceHatchback: null, priceSedan: null, priceSuv: null })).toBe('Inspection ₹0')
  })
})
