import { describe, expect, test } from 'bun:test'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  NEW_CATEGORIES,
  PLAIN_CATEGORY_ORDER,
  SERVICE_CATEGORY_OPTIONS,
  categoryRank,
  groupByCategory,
  showCategoryHeadings,
} from './categories'
import { CATEGORY_COMMISSION_PERCENT, MECHANICAL_AND_BODY_PERCENT } from './commission-rates'

describe('the categories', () => {
  test('the order everywhere, Others last, package only after the plain ones', () => {
    expect(PLAIN_CATEGORY_ORDER).toEqual([
      'car_wash',
      'detailing',
      'coating',
      'scratch_removal',
      'general_service',
      'repairs',
      'dent_paint',
      'others',
    ])
    expect(CATEGORY_ORDER.at(-1)).toBe('package')
    expect(SERVICE_CATEGORY_OPTIONS.map((option) => option.value)).toEqual([...PLAIN_CATEGORY_ORDER])
  })

  test("the new ones' names", () => {
    expect(NEW_CATEGORIES.map((category) => CATEGORY_LABELS[category])).toEqual([
      'General service',
      'Repairs',
      'Dent & paint',
    ])
  })

  test('an unknown category sorts last', () => {
    expect(categoryRank('car_wash')).toBe(0)
    expect(categoryRank('nonsense')).toBe(CATEGORY_ORDER.length)
  })
})

describe('groupByCategory', () => {
  const items = [
    { name: 'Foam wash', category: 'car_wash' },
    { name: 'Brake pads', category: 'repairs' },
    { name: 'Oil change', category: 'general_service' },
    { name: 'Bike wash', category: 'others' },
    { name: 'AC service', category: 'repairs' },
    { name: 'Weekend combo', category: 'package' },
  ]

  test('in the order everywhere, each keeping its items in order, empty ones left out', () => {
    const groups = groupByCategory(items, (item) => item.category)
    expect(groups.map((group) => group.category)).toEqual([
      'car_wash',
      'general_service',
      'repairs',
      'others',
      'package',
    ])
    expect(groups.find((group) => group.category === 'repairs')!.items.map((item) => item.name)).toEqual([
      'Brake pads',
      'AC service',
    ])
  })

  test('headings only for two or more kinds of work', () => {
    expect(showCategoryHeadings(groupByCategory(items, (item) => item.category))).toBe(true)
    expect(showCategoryHeadings(groupByCategory(items.slice(0, 1), (item) => item.category))).toBe(false)
    expect(showCategoryHeadings(groupByCategory([], () => 'car_wash'))).toBe(false)
  })
})

describe('commission percent', () => {
  test('5% on the mechanical and body work, as on detailing; 8% stays on wash, packages and others', () => {
    expect(MECHANICAL_AND_BODY_PERCENT).toBe(5)
    expect(CATEGORY_COMMISSION_PERCENT).toMatchObject({
      general_service: 5,
      repairs: 5,
      dent_paint: 5,
      detailing: 5,
      car_wash: 8,
      package: 8,
      others: 8,
    })
  })
})
