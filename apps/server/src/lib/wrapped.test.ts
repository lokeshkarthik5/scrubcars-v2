import { describe, expect, test } from 'bun:test'
import {
  buildWrapped,
  busiestMonth,
  favouriteGarage,
  isWrappedPushWindow,
  levelMoment,
  longestStreakInYear,
  shineDays,
  wrappedAvailable,
  wrappedPushWords,
  wrappedStale,
  wrappedYears,
  type WrappedBooking,
} from './wrapped.js'

function ist(local: string): Date {
  return new Date(`${local}+05:30`)
}

function wash(day: string, vendorId = 'g1', vendorName = 'Shine Hub', time = '10:00:00'): WrappedBooking {
  return { completedAt: ist(`${day}T${time}`), vendorId, vendorName }
}

describe('which years are open', () => {
  test('the previous year all year; the current one from 1 December (IST)', () => {
    expect(wrappedYears(ist('2027-06-15T10:00:00'))).toEqual([2026])
    expect(wrappedYears(ist('2027-11-30T23:59:00'))).toEqual([2026])
    expect(wrappedYears(ist('2027-12-01T00:00:00'))).toEqual([2027, 2026])
    // Nothing before rewards began.
    expect(wrappedYears(ist('2026-10-18T10:00:00'))).toEqual([])
    expect(wrappedYears(ist('2026-12-01T09:00:00'))).toEqual([2026])
    expect(wrappedAvailable(2026, ist('2026-11-30T10:00:00'))).toBe(false)
    expect(wrappedAvailable(2026, ist('2027-09-01T10:00:00'))).toBe(true)
    expect(wrappedAvailable(2025, ist('2027-09-01T10:00:00'))).toBe(false)
  })

  test('the December push window is 1–7 December, IST', () => {
    expect(isWrappedPushWindow(ist('2026-12-01T10:00:00'))).toBe(true)
    expect(isWrappedPushWindow(ist('2026-12-07T17:00:00'))).toBe(true)
    expect(isWrappedPushWindow(ist('2026-12-08T10:00:00'))).toBe(false)
    expect(isWrappedPushWindow(ist('2026-11-30T23:00:00'))).toBe(false)
    expect(wrappedPushWords(2026)).toMatchObject({ title: 'Your Detlio Wrapped is here', url: '/profile/rewards/wrapped?year=2026' })
  })
})

describe('favourite garage', () => {
  test('the most bookings', () => {
    expect(favouriteGarage([wash('2026-02-01', 'a', 'A'), wash('2026-03-01', 'b', 'B'), wash('2026-04-01', 'b', 'B')])).toEqual({ name: 'B', washes: 2 })
  })

  test('a tie goes to the one visited last', () => {
    expect(favouriteGarage([wash('2026-02-01', 'a', 'A'), wash('2026-09-01', 'b', 'B'), wash('2026-03-01', 'a', 'A'), wash('2026-04-01', 'b', 'B')])).toEqual({
      name: 'B',
      washes: 2,
    })
  })

  test('then by name, A–Z; none with no bookings', () => {
    expect(favouriteGarage([wash('2026-02-01', 'z', 'Zed', '10:00:00'), wash('2026-02-01', 'a', 'Alpha', '10:00:00')])).toEqual({ name: 'Alpha', washes: 1 })
    expect(favouriteGarage([])).toBeNull()
  })
})

describe('busiest month', () => {
  test('the IST month with the most; a tie goes to the earlier', () => {
    expect(busiestMonth([wash('2026-03-01'), wash('2026-07-01'), wash('2026-07-20')])).toEqual({ month: 7, label: 'July', washes: 2 })
    expect(busiestMonth([wash('2026-03-01'), wash('2026-07-01')])).toEqual({ month: 3, label: 'March', washes: 1 })
    expect(busiestMonth([])).toBeNull()
  })

  test('by IST: 31 Jan 23:30 IST is January', () => {
    expect(busiestMonth([wash('2026-01-31', 'g', 'G', '23:30:00')])?.label).toBe('January')
  })
})

describe('longest streak', () => {
  test('months in a row with a wash, inside the year', () => {
    expect(longestStreakInYear([wash('2026-01-05'), wash('2026-02-05'), wash('2026-04-05'), wash('2026-05-05'), wash('2026-06-05')])).toBe(3)
    expect(longestStreakInYear([])).toBe(0)
  })
})

describe('shine days: each wash day and the 6 after, counted once', () => {
  const now = ist('2027-01-10T10:00:00')

  test('one wash is 7 days', () => {
    expect(shineDays([wash('2026-03-01')], 2026, now)).toBe(7)
  })

  test('overlapping washes (even on two cars) count each day once', () => {
    expect(shineDays([wash('2026-03-01'), wash('2026-03-04')], 2026, now)).toBe(10)
    expect(shineDays([wash('2026-03-01', 'a'), wash('2026-03-01', 'b')], 2026, now)).toBe(7)
  })

  test('cut at the year end, and at today during December', () => {
    expect(shineDays([wash('2026-12-29')], 2026, now)).toBe(3)
    expect(shineDays([wash('2026-12-01')], 2026, ist('2026-12-03T10:00:00'))).toBe(3)
  })
})

describe('the whole Wrapped', () => {
  test('only the year counts; saved in rupees; badges capped at six names', () => {
    const stats = buildWrapped({
      year: 2026,
      now: ist('2027-02-01T10:00:00'),
      firstName: 'Meena',
      bookings: [wash('2025-12-31', 'x', 'Old'), wash('2026-05-01', 'a', 'A'), wash('2026-05-10', 'a', 'A'), wash('2027-01-02', 'y', 'New')],
      savedPaise: 34_900,
      level: { key: 'silver', label: 'Silver' },
      badgeNames: ['1', '2', '3', '4', '5', '6', '7'],
    })
    expect(stats).toMatchObject({
      year: 2026,
      firstName: 'Meena',
      washes: 2,
      saved: '349.00',
      favouriteGarage: { name: 'A', washes: 2 },
      busiestMonth: { label: 'May', washes: 2 },
      longestStreak: 1,
      level: { label: 'Silver' },
      badges: { count: 7, names: ['1', '2', '3', '4', '5', '6'] },
      shineDays: 7 + 7,
    })
  })

  test('the level is read at the year end, or now while the year is on', () => {
    expect(levelMoment(2026, ist('2027-03-01T10:00:00'))).toEqual(new Date(ist('2027-01-01T00:00:00').getTime() - 1))
    expect(levelMoment(2026, ist('2026-12-05T10:00:00'))).toEqual(ist('2026-12-05T10:00:00'))
  })
})

describe('the cache', () => {
  test('a year that ended before the stats were made is final; the current one is read again after 6 hours', () => {
    expect(wrappedStale(ist('2027-01-02T10:00:00'), 2026, ist('2027-09-01T10:00:00'))).toBe(false)
    expect(wrappedStale(ist('2026-12-05T10:00:00'), 2026, ist('2026-12-05T15:00:00'))).toBe(false)
    expect(wrappedStale(ist('2026-12-05T10:00:00'), 2026, ist('2026-12-05T17:00:00'))).toBe(true)
    // Made in December, read in March: made again with the whole year.
    expect(wrappedStale(ist('2026-12-20T10:00:00'), 2026, ist('2027-03-01T10:00:00'))).toBe(true)
  })
})
