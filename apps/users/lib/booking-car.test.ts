import { describe, expect, test } from 'bun:test'
import { bookingCarId } from './booking-car'

const sedan = { id: 'sedan', isDefault: true }
const suv = { id: 'suv', isDefault: false }

describe('bookingCarId', () => {
  test("Home's car first, while it is still saved", () => {
    expect(bookingCarId([sedan, suv], 'suv')).toBe('suv')
    expect(bookingCarId([sedan, suv], 'removed')).toBe('sedan')
  })

  test('else the default car, else the only car', () => {
    expect(bookingCarId([sedan, suv], null)).toBe('sedan')
    expect(bookingCarId([{ id: 'only', isDefault: false }], undefined)).toBe(
      'only'
    )
  })

  test('nothing to go on with several cars and no default', () => {
    expect(bookingCarId([{ ...sedan, isDefault: false }, suv], null)).toBeNull()
    expect(bookingCarId([], 'suv')).toBeNull()
  })
})
