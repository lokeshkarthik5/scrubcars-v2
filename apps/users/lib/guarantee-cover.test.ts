import { describe, expect, test } from 'bun:test'
import { guaranteeCovers } from './guarantee-cover'

const categories: Record<string, string> = {
  wash: 'car_wash',
  detail: 'detailing',
  coat: 'coating',
}
const categoryOf = (id: string) => categories[id]

describe('guaranteeCovers', () => {
  test('washes and detailing are covered', () => {
    expect(
      guaranteeCovers(
        [
          { category: 'car_wash', pricingType: 'flat' },
          { category: 'detailing', pricingType: 'per_vehicle' },
        ],
        categoryOf
      )
    ).toBe(true)
  })

  test('a package only when every member is a wash or detailing', () => {
    const pkg = (ids: string[]) => ({
      category: 'package',
      pricingType: 'flat',
      items: ids.map((serviceId) => ({ serviceId })),
    })
    expect(guaranteeCovers([pkg(['wash', 'detail'])], categoryOf)).toBe(true)
    expect(guaranteeCovers([pkg(['wash', 'coat'])], categoryOf)).toBe(false)
    // A member we cannot see is not assumed covered.
    expect(guaranteeCovers([pkg(['wash', 'gone'])], categoryOf)).toBe(false)
    expect(guaranteeCovers([pkg([])], categoryOf)).toBe(false)
  })

  test('anything else, an inspection price or nothing at all is not', () => {
    expect(
      guaranteeCovers(
        [{ category: 'coating', pricingType: 'flat' }],
        categoryOf
      )
    ).toBe(false)
    expect(
      guaranteeCovers(
        [{ category: 'car_wash', pricingType: 'on_inspection' }],
        categoryOf
      )
    ).toBe(false)
    expect(guaranteeCovers([], categoryOf)).toBe(false)
  })
})
