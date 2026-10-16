import { describe, expect, test } from 'bun:test'
import { createKeyedLimit, createThrottle } from './throttle.js'

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

describe('createKeyedLimit', () => {
  const HOUR = 60 * 60_000
  const start = Date.UTC(2026, 9, 16, 10, 0)

  test('each key gets the limit within the window, then waits for it to end', () => {
    const allow = createKeyedLimit(2, HOUR)
    expect(allow('admin', start)).toEqual({ ok: true })
    expect(allow('admin', start + 1_000)).toEqual({ ok: true })
    expect(allow('admin', start + 30 * 60_000)).toEqual({ ok: false, retryAfterSeconds: 30 * 60 })
  })

  test('keys are counted apart, and a new window starts fresh', () => {
    const allow = createKeyedLimit(1, HOUR)
    expect(allow('a', start).ok).toBe(true)
    expect(allow('b', start).ok).toBe(true)
    expect(allow('a', start + 1).ok).toBe(false)
    expect(allow('a', start + HOUR).ok).toBe(true)
  })
})
