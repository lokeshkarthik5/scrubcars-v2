import { describe, expect, test } from 'bun:test'
import { fromIstInput, istDateTimeLabel, istWindowLabel, toIstInput } from './ist-input'

describe('toIstInput', () => {
  test('shows the moment as India wall-clock time, whatever the device zone', () => {
    expect(toIstInput('2026-08-27T10:30:00.000Z')).toBe('2026-08-27T16:00')
    // 18:30 UTC is already the next day in India.
    expect(toIstInput('2026-10-17T18:30:00.000Z')).toBe('2026-10-18T00:00')
  })

  test('blank and unreadable give an empty field', () => {
    expect(toIstInput(null)).toBe('')
    expect(toIstInput(undefined)).toBe('')
    expect(toIstInput('')).toBe('')
    expect(toIstInput('not a date')).toBe('')
  })
})

describe('fromIstInput', () => {
  test('reads the field as India time', () => {
    expect(fromIstInput('2026-08-27T16:00')).toBe('2026-08-27T10:30:00.000Z')
    // Midnight in India is 18:30 UTC the day before.
    expect(fromIstInput('2026-10-18T00:00')).toBe('2026-10-17T18:30:00.000Z')
    // Some browsers add seconds.
    expect(fromIstInput('2026-10-18T00:00:30')).toBe('2026-10-17T18:30:30.000Z')
  })

  test('round-trips both ways', () => {
    for (const iso of ['2026-01-01T00:00:00.000Z', '2026-12-31T18:29:00.000Z', '2027-03-31T18:30:00.000Z']) {
      expect(fromIstInput(toIstInput(iso))).toBe(iso)
    }
  })

  test('blank and impossible dates are null, never a date nobody meant', () => {
    expect(fromIstInput('')).toBeNull()
    expect(fromIstInput('   ')).toBeNull()
    expect(fromIstInput('2026-02-30T10:00')).toBeNull()
    expect(fromIstInput('2026-10-18T24:00')).toBeNull()
    expect(fromIstInput('18/10/2026 10:00')).toBeNull()
  })
})

describe('labels', () => {
  test('a moment, with its weekday and minutes', () => {
    expect(istDateTimeLabel('2026-10-12T04:30:00.000Z')).toBe('Mon 12 Oct, 10:00 AM')
    expect(istDateTimeLabel('2026-10-18T18:29:00.000Z')).toBe('Sun 18 Oct, 11:59 PM')
    expect(istDateTimeLabel('2026-10-17T18:30:00.000Z')).toBe('Sun 18 Oct, 12:00 AM')
    expect(istDateTimeLabel('2026-10-18T06:30:00.000Z')).toBe('Sun 18 Oct, 12:00 PM')
  })

  test('a window', () => {
    expect(istWindowLabel('2026-10-12T04:30:00.000Z', '2026-10-18T18:29:00.000Z')).toBe(
      'Mon 12 Oct, 10:00 AM → Sun 18 Oct, 11:59 PM IST'
    )
    expect(istWindowLabel(null, '2026-10-18T18:29:00.000Z')).toBe('From saving → Sun 18 Oct, 11:59 PM IST')
  })
})
