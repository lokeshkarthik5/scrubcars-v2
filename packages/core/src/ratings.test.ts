import { describe, expect, test } from 'bun:test'
import {
  NEW_GARAGE_LABEL,
  hasStarScore,
  isNewGarage,
  newGarageReviewsLine,
} from './ratings'

describe("the web's new-garage rule (0065)", () => {
  test('stars only for a garage that is not new and has counted reviews', () => {
    expect(hasStarScore({ reviewCount: 23, isNew: false })).toBe(true)
    expect(hasStarScore({ reviewCount: 2, isNew: true })).toBe(false)
    expect(hasStarScore({ reviewCount: 0, isNew: true })).toBe(false)
    // An API from before 0065 sends no isNew: as before, any review shows stars.
    expect(hasStarScore({ reviewCount: 1 })).toBe(true)
    expect(NEW_GARAGE_LABEL).toBe('New on Detlio')
  })

  test('"2 reviews so far" under it, nothing with none', () => {
    expect(newGarageReviewsLine(0)).toBeNull()
    expect(newGarageReviewsLine(1)).toBe('1 review so far')
    expect(newGarageReviewsLine(2)).toBe('2 reviews so far')
  })
})

describe("the garage portal's twin of isNew", () => {
  test('fewer than 3 counted reviews is new', () => {
    expect(isNewGarage(0)).toBe(true)
    expect(isNewGarage(2)).toBe(true)
    expect(isNewGarage(3)).toBe(false)
  })
})
