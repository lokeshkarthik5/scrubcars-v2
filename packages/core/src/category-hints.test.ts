import { describe, expect, test } from 'bun:test'
import {
  CATEGORY_HINT_KEYWORDS,
  CATEGORY_HINT_NEVER,
  CATEGORY_HINT_PRIORITY,
  categoryHintFor,
  matchCategoryHint,
} from './category-hints'

describe('matchCategoryHint', () => {
  test("the mockup's rows", () => {
    expect(matchCategoryHint('Clutch overhaul')).toEqual({ category: 'repairs', keyword: 'clutch' })
    expect(matchCategoryHint('Bumper painting')).toEqual({ category: 'dent_paint', keyword: 'bumper' })
    expect(matchCategoryHint('Wheel alignment')).toEqual({ category: 'general_service', keyword: 'alignment' })
    expect(matchCategoryHint('Car AC gas refill')).toEqual({ category: 'repairs', keyword: 'ac' })
    expect(matchCategoryHint('Periodic maintenance')).toEqual({ category: 'general_service', keyword: 'periodic' })
    expect(matchCategoryHint('Denting & tinkering')).toEqual({ category: 'dent_paint', keyword: 'denting' })
    expect(matchCategoryHint('Battery replacement')).toEqual({ category: 'repairs', keyword: 'battery' })
    expect(matchCategoryHint('Bike wash')).toBeNull()
    expect(matchCategoryHint('Windshield replacement')).toBeNull()
  })

  test('Dent & paint wins over Repairs, which wins over General service', () => {
    expect(matchCategoryHint('AC service')?.category).toBe('repairs')
    expect(matchCategoryHint('Dent repair')?.category).toBe('dent_paint')
    expect(matchCategoryHint('Panel repair and service')?.category).toBe('dent_paint')
    expect(matchCategoryHint('Brake service')?.category).toBe('repairs')
    expect(matchCategoryHint('Oil change')?.category).toBe('general_service')
    expect(CATEGORY_HINT_PRIORITY).toEqual(['dent_paint', 'repairs', 'general_service'])
  })

  test('never when the name has a wash or detailing word', () => {
    expect(matchCategoryHint('Engine bay cleaning')).toBeNull()
    expect(matchCategoryHint('Paint protection film')).toBeNull()
    expect(matchCategoryHint('Teflon coating service')).toBeNull()
    expect(matchCategoryHint('Underbody wash & service')).toBeNull()
    expect(matchCategoryHint('PPF bumper')).toBeNull()
    expect(matchCategoryHint('Bumper polish')).toBeNull()
    for (const word of CATEGORY_HINT_NEVER) {
      expect({ word, hint: matchCategoryHint(`Brake repair ${word}`) }).toEqual({ word, hint: null })
    }
  })

  test('whole words, any case', () => {
    expect(matchCategoryHint('CLUTCH PLATE')).toEqual({ category: 'repairs', keyword: 'clutch' })
    // "ac" inside a word is not AC; "rust" inside "trusted" is not rust.
    expect(matchCategoryHint('Vacuum')).toBeNull()
    expect(matchCategoryHint('Trusted pickup')).toBeNull()
    expect(matchCategoryHint('Brakes')).toBeNull()
    expect(matchCategoryHint('A/C gas top up')).toEqual({ category: 'repairs', keyword: 'a/c' })
    expect(matchCategoryHint('Car check-up')).toEqual({ category: 'general_service', keyword: 'check-up' })
    expect(matchCategoryHint('Car check up')).toEqual({ category: 'general_service', keyword: 'check-up' })
    expect(matchCategoryHint('Spark  plug')).toEqual({ category: 'general_service', keyword: 'spark plug' })
  })

  test('a bare "engine" is no repair', () => {
    expect(matchCategoryHint('Engine oil change')?.category).toBe('general_service')
    expect(matchCategoryHint('Engine')).toBeNull()
    expect(matchCategoryHint('Engine repair')).toEqual({ category: 'repairs', keyword: 'engine repair' })
  })

  test('of one category, the keyword first in the name; the longer on a tie', () => {
    expect(matchCategoryHint('Repair of shock absorber')?.keyword).toBe('repair')
    expect(matchCategoryHint('Engine repair')?.keyword).toBe('engine repair')
  })

  test('blank names have no hint', () => {
    expect(matchCategoryHint('')).toBeNull()
    expect(matchCategoryHint('   ')).toBeNull()
  })

  test('every keyword matches itself, and lands in its own category or a higher one', () => {
    for (const category of CATEGORY_HINT_PRIORITY) {
      for (const keyword of CATEGORY_HINT_KEYWORDS[category]) {
        const hint = matchCategoryHint(keyword)
        expect(hint).not.toBeNull()
        expect(CATEGORY_HINT_PRIORITY.indexOf(hint!.category)).toBeLessThanOrEqual(
          CATEGORY_HINT_PRIORITY.indexOf(category)
        )
      }
    }
  })
})

describe('categoryHintFor', () => {
  test('only services in Others are checked', () => {
    expect(categoryHintFor({ name: 'Clutch overhaul', category: 'others' })?.category).toBe('repairs')
    expect(categoryHintFor({ name: 'Clutch overhaul', category: 'car_wash' })).toBeNull()
    expect(categoryHintFor({ name: 'Clutch overhaul', category: 'repairs' })).toBeNull()
    expect(categoryHintFor({ name: 'Clutch overhaul', category: 'package' })).toBeNull()
  })

  test('Not this hides it for good', () => {
    expect(categoryHintFor({ name: 'Clutch overhaul', category: 'others', hintDismissed: true })).toBeNull()
  })
})
