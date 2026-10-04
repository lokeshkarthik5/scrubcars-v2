import { describe, expect, test } from 'bun:test'
import { createThrottle } from './throttle.js'

describe('createThrottle', () => {
  const TEN_MINUTES = 10 * 60_000
  const start = Date.UTC(2026, 9, 4, 10, 0)

  test('the first call goes through and repeats inside the interval do not', () => {
    const allow = createThrottle(TEN_MINUTES)
    expect(allow(start)).toBe(true)
    expect(allow(start + 1_000)).toBe(false)
    expect(allow(start + TEN_MINUTES - 1)).toBe(false)
  })

  test('the next call after the interval goes through and starts a new one', () => {
    const allow = createThrottle(TEN_MINUTES)
    allow(start)
    expect(allow(start + TEN_MINUTES)).toBe(true)
    expect(allow(start + TEN_MINUTES + 1_000)).toBe(false)
  })

  test('each throttle keeps its own clock', () => {
    const a = createThrottle(TEN_MINUTES)
    const b = createThrottle(TEN_MINUTES)
    expect(a(start)).toBe(true)
    expect(b(start)).toBe(true)
  })
})
