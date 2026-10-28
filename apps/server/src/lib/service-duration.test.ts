import { describe, expect, test } from 'bun:test'
import { DEFAULT_SERVICE_DURATION_MINS, effectiveDurationMins, hasDuration } from './service-duration.js'

describe('service duration', () => {
  test('an empty duration holds the default 60 minutes; a set one is its own', () => {
    expect(DEFAULT_SERVICE_DURATION_MINS).toBe(60)
    expect(effectiveDurationMins({ durationMins: null })).toBe(60)
    expect(effectiveDurationMins({})).toBe(60)
    expect(effectiveDurationMins({ durationMins: 0 })).toBe(60)
    expect(effectiveDurationMins({ durationMins: Number.NaN })).toBe(60)
    expect(effectiveDurationMins({ durationMins: 90 })).toBe(90)
    expect(effectiveDurationMins({ durationMins: 45.4 })).toBe(45)
  })

  test('hasDuration says whether the garage set one', () => {
    expect(hasDuration({ durationMins: null })).toBe(false)
    expect(hasDuration({ durationMins: 0 })).toBe(false)
    expect(hasDuration({ durationMins: 30 })).toBe(true)
  })
})
