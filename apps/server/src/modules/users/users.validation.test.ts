import { describe, expect, test } from 'bun:test'
import { updateVehicleSchema } from './users.validation.js'

describe('a car’s wash interval', () => {
  test('one of the five intervals, or null for the default', () => {
    for (const days of [7, 10, 14, 21, 30] as const) {
      expect(updateVehicleSchema.parse({ washIntervalDays: days })).toEqual({ washIntervalDays: days })
    }
    expect(updateVehicleSchema.parse({ washIntervalDays: null })).toEqual({ washIntervalDays: null })
  })

  test('anything else is refused', () => {
    for (const days of [0, 3, 12, 15, 60, 14.5, '14']) {
      expect(updateVehicleSchema.safeParse({ washIntervalDays: days }).success).toBe(false)
    }
  })
})
