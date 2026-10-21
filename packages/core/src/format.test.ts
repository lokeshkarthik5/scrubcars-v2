import { describe, expect, test } from 'bun:test'
import {
  deadlineState,
  formatClock,
  formatDay,
  formatINR,
  formatRelative,
  formatWhen,
  type DeadlineState,
} from './format'

/** A moment given as India wall-clock time. */
const ist = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  Date.UTC(y, mo - 1, d, h, mi, s) - (5 * 60 + 30) * 60 * 1000
const iso = (time: number) => new Date(time).toISOString()

const MIN = 60 * 1000
// Mon 19 Oct 2026, noon in India.
const NOON = ist(2026, 10, 19, 12, 0)

describe('formatINR', () => {
  test('groups the Indian way: the last three digits, then pairs', () => {
    expect(formatINR(0)).toBe('₹0')
    expect(formatINR(999)).toBe('₹999')
    expect(formatINR(1000)).toBe('₹1,000')
    expect(formatINR(99999)).toBe('₹99,999')
    expect(formatINR(100000)).toBe('₹1,00,000')
    expect(formatINR(125000)).toBe('₹1,25,000')
    expect(formatINR(12500000)).toBe('₹1,25,00,000')
  })

  test('whole rupees unless paise is asked for, and then only when there are any', () => {
    expect(formatINR(125000.5)).toBe('₹1,25,001')
    expect(formatINR(125000.4)).toBe('₹1,25,000')
    expect(formatINR(125000.5, { paise: true })).toBe('₹1,25,000.50')
    expect(formatINR(758.4, { paise: true })).toBe('₹758.40')
    expect(formatINR(0.05, { paise: true })).toBe('₹0.05')
    expect(formatINR(1998, { paise: true })).toBe('₹1,998')
    // Float noise is rounded away, not printed.
    expect(formatINR(0.1 + 0.2, { paise: true })).toBe('₹0.30')
  })

  test('a negative amount takes a real minus sign before the ₹', () => {
    expect(formatINR(-500)).toBe('−₹500')
    expect(formatINR(-125000.5, { paise: true })).toBe('−₹1,25,000.50')
    // Nothing to be negative about.
    expect(formatINR(-0)).toBe('₹0')
    expect(formatINR(-0.2)).toBe('₹0')
  })

  test('a figure that is not a number is a dash, never ₹0', () => {
    expect(formatINR(Number.NaN)).toBe('—')
    expect(formatINR(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatClock', () => {
  test('lower-case am/pm, no leading zero, in India time', () => {
    expect(formatClock(iso(ist(2026, 10, 19, 9, 0)))).toBe('9:00 am')
    expect(formatClock(new Date(ist(2026, 10, 19, 12, 30)))).toBe('12:30 pm')
    expect(formatClock(iso(ist(2026, 10, 19, 23, 59)))).toBe('11:59 pm')
  })

  test('midnight is 12 am and noon is 12 pm', () => {
    expect(formatClock(iso(ist(2026, 10, 19, 0, 0)))).toBe('12:00 am')
    expect(formatClock(iso(ist(2026, 10, 19, 0, 5)))).toBe('12:05 am')
    expect(formatClock(iso(ist(2026, 10, 19, 12, 0)))).toBe('12:00 pm')
  })

  test('reads an offset in the string, and gives nothing for nonsense', () => {
    expect(formatClock('2026-10-19T09:00:00+05:30')).toBe('9:00 am')
    expect(formatClock('2026-10-19T03:30:00Z')).toBe('9:00 am')
    expect(formatClock('not a date')).toBe('')
  })
})

describe('formatDay', () => {
  test('Today, Tomorrow and Yesterday by India’s calendar', () => {
    expect(formatDay(iso(ist(2026, 10, 19, 0, 0)), NOON)).toBe('Today')
    expect(formatDay(iso(ist(2026, 10, 19, 23, 59)), NOON)).toBe('Today')
    expect(formatDay(iso(ist(2026, 10, 20, 0, 0)), NOON)).toBe('Tomorrow')
    expect(formatDay(iso(ist(2026, 10, 18, 23, 59)), NOON)).toBe('Yesterday')
    expect(formatDay(iso(ist(2026, 10, 21, 9, 0)), NOON)).toBe('Wed 21 Oct')
    expect(formatDay(iso(ist(2026, 10, 17, 9, 0)), NOON)).toBe('Sat 17 Oct')
  })

  test('the edges move at India’s midnight, not UTC’s', () => {
    // 11:59 pm and 12:01 am in India, two minutes and one day apart.
    const late = ist(2026, 10, 19, 23, 59)
    const early = ist(2026, 10, 20, 0, 1)
    expect(formatDay(iso(early), late)).toBe('Tomorrow')
    expect(formatDay(iso(late), early)).toBe('Yesterday')
    // 1 am in India is still the previous day in UTC: it must not matter.
    const oneAm = ist(2026, 10, 20, 1, 0)
    expect(formatDay(iso(ist(2026, 10, 20, 20, 0)), oneAm)).toBe('Today')
    expect(formatDay(iso(ist(2026, 10, 19, 20, 0)), oneAm)).toBe('Yesterday')
  })

  test('the year only when it is not now’s', () => {
    expect(formatDay(iso(ist(2027, 10, 20, 9, 0)), NOON)).toBe(
      'Wed 20 Oct 2027'
    )
    expect(formatDay(iso(ist(2025, 10, 20, 9, 0)), NOON)).toBe(
      'Mon 20 Oct 2025'
    )
    // Across new year: 31 Dec to 1 Jan is still Tomorrow, then the year shows.
    const newYearsEve = ist(2026, 12, 31, 22, 0)
    expect(formatDay(iso(ist(2027, 1, 1, 9, 0)), newYearsEve)).toBe('Tomorrow')
    expect(formatDay(iso(ist(2027, 1, 2, 9, 0)), newYearsEve)).toBe(
      'Sat 2 Jan 2027'
    )
    expect(formatDay(iso(ist(2026, 12, 29, 9, 0)), ist(2027, 1, 1, 9, 0))).toBe(
      'Tue 29 Dec 2026'
    )
  })
})

describe('formatWhen', () => {
  test('the day and the clock, with a middle dot', () => {
    expect(formatWhen(iso(ist(2026, 10, 19, 12, 30)), NOON)).toBe(
      'Today · 12:30 pm'
    )
    expect(formatWhen(iso(ist(2026, 10, 20, 9, 0)), NOON)).toBe(
      'Tomorrow · 9:00 am'
    )
    expect(formatWhen(iso(ist(2026, 10, 22, 9, 0)), NOON)).toBe(
      'Thu 22 Oct · 9:00 am'
    )
    expect(formatWhen('nonsense', NOON)).toBe('')
  })
})

describe('formatRelative', () => {
  test('the past', () => {
    expect(formatRelative(iso(NOON - 59 * 1000), NOON)).toBe('just now')
    expect(formatRelative(iso(NOON - MIN), NOON)).toBe('1 min ago')
    expect(formatRelative(iso(NOON - 5 * MIN - 50 * 1000), NOON)).toBe(
      '5 min ago'
    )
    expect(formatRelative(iso(NOON - 59 * MIN), NOON)).toBe('59 min ago')
    expect(formatRelative(iso(NOON - 2 * 60 * MIN - 5 * MIN), NOON)).toBe(
      '2 h ago'
    )
    expect(formatRelative(iso(ist(2026, 10, 18, 9, 0)), NOON)).toBe('yesterday')
    expect(formatRelative(iso(ist(2026, 10, 16, 9, 0)), NOON)).toBe(
      '3 days ago'
    )
    expect(formatRelative(iso(ist(2026, 10, 12, 9, 0)), NOON)).toBe(
      'Mon 12 Oct'
    )
  })

  test('the future', () => {
    expect(formatRelative(iso(NOON + 30 * 1000), NOON)).toBe('just now')
    // Rounded up, so a countdown never says less than is left.
    expect(formatRelative(iso(NOON + 19 * MIN + 10 * 1000), NOON)).toBe(
      'in 20 min'
    )
    expect(formatRelative(iso(NOON + 2 * 60 * MIN + 40 * MIN), NOON)).toBe(
      'in 2 h'
    )
    expect(formatRelative(iso(ist(2026, 10, 20, 18, 0)), NOON)).toBe('tomorrow')
    expect(formatRelative(iso(ist(2026, 10, 22, 9, 0)), NOON)).toBe('in 3 days')
    expect(formatRelative(iso(ist(2026, 10, 30, 9, 0)), NOON)).toBe(
      'Fri 30 Oct'
    )
  })

  test('nonsense gives nothing', () => {
    expect(formatRelative('soon', NOON)).toBe('')
  })
})

describe('deadlineState', () => {
  const at = (minsFromNoon: number) => iso(NOON + minsFromNoon * MIN)

  test('closed: the time it is due by, and a full bar', () => {
    expect(
      deadlineState(iso(ist(2026, 10, 20, 9, 30)), {
        now: NOON,
        shopOpen: false,
      })
    ).toEqual({
      kind: 'closed',
      label: 'By 9:30 am',
      fractionLeft: 1,
    })
    // Further off than tomorrow, the day goes with it.
    expect(
      deadlineState(iso(ist(2026, 10, 21, 9, 30)), {
        now: NOON,
        shopOpen: false,
      }).label
    ).toBe('By Wed 21 Oct · 9:30 am')
  })

  test('running: minutes, then hours and minutes once over an hour', () => {
    expect(deadlineState(at(22), { now: NOON })).toEqual({
      kind: 'running',
      label: '22 min',
      fractionLeft: 1,
    })
    expect(deadlineState(at(60), { now: NOON }).label).toBe('60 min')
    expect(deadlineState(at(65), { now: NOON }).label).toBe('1 h 05 min')
    expect(deadlineState(at(150), { now: NOON }).label).toBe('2 h 30 min')
    // Rounded up: 21 min 10 s left still says 22.
    expect(
      deadlineState(iso(NOON + 21 * MIN + 10 * 1000), { now: NOON }).label
    ).toBe('22 min')
  })

  test('the bar drains against startedAt', () => {
    const started = iso(NOON - 8 * MIN)
    expect(
      deadlineState(at(22), { now: NOON, startedAt: started }).fractionLeft
    ).toBeCloseTo(22 / 30, 10)
    expect(
      deadlineState(at(22), { now: NOON, startedAt: started, shopOpen: false })
        .fractionLeft
    ).toBeCloseTo(22 / 30, 10)
  })

  test('urgent at or under urgentMins, and not a second before', () => {
    expect(deadlineState(iso(NOON + 5 * MIN + 1000), { now: NOON }).kind).toBe(
      'running'
    )
    expect(deadlineState(at(5), { now: NOON })).toEqual({
      kind: 'urgent',
      label: '5 min',
      fractionLeft: 1,
    })
    const four = deadlineState(at(4), { now: NOON })
    expect(four.kind).toBe('urgent')
    expect(four.label).toBe('4 min')
    // No startedAt: it drains across the urgent window.
    expect(four.fractionLeft).toBeCloseTo(0.8, 10)
    expect(deadlineState(iso(NOON + 1000), { now: NOON }).label).toBe('1 min')

    // A wider window moves the switch-over with it.
    expect(deadlineState(at(10), { now: NOON, urgentMins: 10 }).kind).toBe(
      'urgent'
    )
    expect(deadlineState(at(11), { now: NOON, urgentMins: 10 }).kind).toBe(
      'running'
    )
  })

  test('missed at the deadline itself and after it', () => {
    const missed: DeadlineState = {
      kind: 'missed',
      label: 'Missed',
      fractionLeft: 0,
    }
    expect(deadlineState(at(0), { now: NOON })).toEqual(missed)
    expect(deadlineState(at(-30), { now: NOON })).toEqual(missed)
    expect(deadlineState(at(-30), { now: NOON, shopOpen: false })).toEqual(
      missed
    )
  })

  test('an unreadable deadline is never called Missed', () => {
    expect(deadlineState('nonsense', { now: NOON }).kind).toBe('closed')
  })
})
