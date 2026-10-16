import { describe, expect, test } from 'bun:test'
import { statsOverviewQuerySchema, statsRangeQuerySchema } from './stats.validation.js'

const GARAGE = 'e2e00000-0000-4000-8000-000000000314'

describe('statsRangeQuerySchema', () => {
  test('two dates, both included, and optionally one garage', () => {
    expect(statsRangeQuerySchema.parse({ from: '2026-09-17', to: '2026-10-16' })).toEqual({
      from: '2026-09-17',
      to: '2026-10-16',
    })
    expect(
      statsRangeQuerySchema.parse({ from: '2026-10-16', to: '2026-10-16', vendorId: GARAGE })
    ).toEqual({ from: '2026-10-16', to: '2026-10-16', vendorId: GARAGE })
  })

  test('both dates are required, and must be real ones', () => {
    expect(statsRangeQuerySchema.safeParse({ from: '2026-10-01' }).success).toBe(false)
    expect(statsRangeQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(false)
    expect(statsRangeQuerySchema.safeParse({ from: '1 Oct', to: '2026-10-16' }).success).toBe(false)
    expect(
      statsRangeQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-16', vendorId: 'abc' }).success
    ).toBe(false)
  })

  test('a reversed range is refused', () => {
    expect(statsRangeQuerySchema.safeParse({ from: '2026-10-16', to: '2026-10-01' }).success).toBe(false)
  })

  test('at most 366 days', () => {
    // 2024 was a leap year: 1 Jan to 31 Dec is 366 days.
    expect(statsRangeQuerySchema.safeParse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(true)
    expect(statsRangeQuerySchema.safeParse({ from: '2024-01-01', to: '2025-01-01' }).success).toBe(false)
  })
})

describe('statsOverviewQuerySchema', () => {
  test('no comparison unless asked for', () => {
    expect(statsOverviewQuerySchema.parse({ from: '2026-10-01', to: '2026-10-16' }).compare).toBe(false)
    expect(
      statsOverviewQuerySchema.parse({ from: '2026-10-01', to: '2026-10-16', compare: '1' }).compare
    ).toBe(true)
    expect(
      statsOverviewQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-16', compare: 'yes' }).success
    ).toBe(false)
  })

  test('the same range rules', () => {
    expect(statsOverviewQuerySchema.safeParse({ from: '2026-10-16', to: '2026-10-01' }).success).toBe(false)
  })
})
