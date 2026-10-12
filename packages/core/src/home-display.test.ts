import { describe, expect, test } from 'bun:test'
import type { WashStatus } from './api/home'
import {
  bookingDayLabel,
  firstNameOf,
  groupUpdates,
  initialOf,
  istClockParts,
  istDateKey,
  offerFigureOf,
  offerMetaLines,
  updateTimeLabel,
  washLine,
  washMeter,
} from './home-display'

/** A Monday morning in Chennai: 12 Oct 2026, 10:00 IST. */
const NOW = new Date('2026-10-12T10:00:00+05:30')

describe('firstNameOf', () => {
  test('the first word that is a name, not an initial', () => {
    expect(firstNameOf('R. Karthik')).toBe('Karthik')
    expect(firstNameOf('R Karthik')).toBe('Karthik')
    expect(firstNameOf('Arjun Mehta')).toBe('Arjun')
    expect(firstNameOf('  Priya  ')).toBe('Priya')
    expect(firstNameOf('S. R. Uday Kumar')).toBe('Uday')
  })

  test('the whole name when no word qualifies', () => {
    expect(firstNameOf('A. B.')).toBe('A. B.')
    expect(firstNameOf('J')).toBe('J')
    expect(firstNameOf('')).toBe('')
    expect(firstNameOf(null)).toBe('')
  })

  test('the avatar takes the greeted name, in capitals', () => {
    expect(initialOf('r. karthik')).toBe('K')
    expect(initialOf('')).toBe('·')
  })
})

describe('offers', () => {
  const offer = {
    code: 'DETAIL20',
    metaLine: 'Up to ₹300 · Min ₹1,000 · Code DETAIL20 · Till Sat 17 Oct',
    endsSoon: null,
  }

  test('limits on one line, the end on the next, the code left to the stub', () => {
    expect(offerMetaLines(offer, { hasCar: true })).toEqual(['Up to ₹300 · Min ₹1,000', 'Till Sat 17 Oct'])
  })

  test('"Ends Sun" stands in for the date once it is close', () => {
    expect(offerMetaLines({ ...offer, endsSoon: 'Ends today' }, { hasCar: true })).toEqual([
      'Up to ₹300 · Min ₹1,000',
      'Ends today',
    ])
  })

  test('a code with no limits is one line; without a car it says to add one first', () => {
    const plain = { code: 'FLAT75', metaLine: 'Code FLAT75 · Till 18 Oct, 6 PM', endsSoon: null }
    expect(offerMetaLines(plain, { hasCar: true })).toEqual(['Till 18 Oct, 6 PM'])
    expect(offerMetaLines(plain, { hasCar: false })).toEqual(['Till 18 Oct, 6 PM · Add your car first'])
  })

  test("the stub's figure", () => {
    expect(offerFigureOf({ discountType: 'percentage', percentOff: '25.00', amountOff: null })).toEqual({
      kind: 'percent',
      value: 25,
    })
    expect(offerFigureOf({ discountType: 'fixed', percentOff: null, amountOff: '75.00' })).toEqual({
      kind: 'amount',
      rupees: 75,
    })
  })
})

describe('the wash bar', () => {
  const wash = (over: Partial<WashStatus>): WashStatus => ({
    intervalDays: 10,
    isDefaultInterval: false,
    lastWashAt: '2026-10-04T10:00:00+05:30',
    daysSinceWash: 8,
    dueOn: '2026-10-14',
    daysLeft: 2,
    state: 'due_soon',
    bookedFor: null,
    ...over,
  })

  test('due, due today and overdue, counted by the server', () => {
    expect(washLine(wash({}), NOW)).toEqual({ lead: 'Due in 2 days', rest: '' })
    expect(washLine(wash({ state: 'ok', daysLeft: 1 }), NOW)).toEqual({ lead: 'Due in 1 day', rest: '' })
    expect(washLine(wash({ state: 'due_today', daysLeft: 0 }), NOW)).toEqual({ lead: 'Due today', rest: '' })
    expect(washLine(wash({ state: 'overdue', daysLeft: -3 }), NOW)).toEqual({ lead: 'Overdue by 3 days', rest: '' })
    expect(washLine(wash({ state: 'overdue', daysLeft: -1 }), NOW)).toEqual({ lead: 'Overdue by 1 day', rest: '' })
  })

  test('booked names the day of the booking, in IST', () => {
    const booked = (at: string) => washLine(wash({ state: 'booked', bookedFor: { bookingId: 'b', scheduledAt: at } }), NOW)
    expect(booked('2026-10-15T11:30:00+05:30')).toEqual({ lead: 'Booked', rest: ' for Thu' })
    expect(booked('2026-10-13T09:00:00+05:30')).toEqual({ lead: 'Booked', rest: ' for tomorrow' })
    expect(booked('2026-10-12T18:00:00+05:30')).toEqual({ lead: 'Booked', rest: ' for today' })
    expect(booked('2026-10-24T09:00:00+05:30')).toEqual({ lead: 'Booked', rest: ' for 24 Oct' })
    // 23:30 IST on the 12th is 18:00 UTC: still today in Chennai.
    expect(booked('2026-10-12T18:00:00Z')).toEqual({ lead: 'Booked', rest: ' for today' })
  })

  test('never washed through Detlio', () => {
    expect(washLine(wash({ state: 'none', daysSinceWash: null, daysLeft: null, lastWashAt: null }), NOW)).toEqual({
      lead: '',
      rest: 'No wash through Detlio yet',
    })
  })

  test('one step per day of the interval, full once overdue', () => {
    expect(washMeter(wash({}))).toEqual({ steps: 10, lit: 8, over: false })
    expect(washMeter(wash({ daysSinceWash: 13, state: 'overdue' }))).toEqual({ steps: 10, lit: 10, over: true })
    expect(washMeter(wash({ daysSinceWash: null, state: 'none' }))).toEqual({ steps: 10, lit: 0, over: false })
  })

  test('long intervals draw fewer, wider steps, so the bar stays readable', () => {
    // Up to 14 days, still one step a day.
    expect(washMeter(wash({ intervalDays: 14, daysSinceWash: 9 }))).toEqual({ steps: 14, lit: 9, over: false })
    // 21 days: two a step, 11 steps; a step lights once both days are gone.
    expect(washMeter(wash({ intervalDays: 21, daysSinceWash: 9 }))).toEqual({ steps: 11, lit: 4, over: false })
    expect(washMeter(wash({ intervalDays: 21, daysSinceWash: 21, state: 'due_today' }))).toEqual({ steps: 11, lit: 11, over: false })
    // 30 days: three a step, 10 steps.
    expect(washMeter(wash({ intervalDays: 30, daysSinceWash: 0 }))).toEqual({ steps: 10, lit: 0, over: false })
    expect(washMeter(wash({ intervalDays: 30, daysSinceWash: 16 }))).toEqual({ steps: 10, lit: 5, over: false })
    expect(washMeter(wash({ intervalDays: 30, daysSinceWash: 31, state: 'overdue' }))).toEqual({ steps: 10, lit: 10, over: true })
  })
})

describe('Updates, in Chennai time whatever the phone says', () => {
  test('just now, minutes, then the clock today', () => {
    expect(updateTimeLabel('2026-10-12T09:59:30+05:30', NOW)).toBe('Just now')
    expect(updateTimeLabel('2026-10-12T09:50:00+05:30', NOW)).toBe('10 min ago')
    expect(updateTimeLabel('2026-10-12T08:34:00+05:30', NOW)).toBe('8:34 AM')
    expect(updateTimeLabel('2026-10-12T00:05:00+05:30', NOW)).toBe('12:05 AM')
  })

  test('weekday and time this week, then the date', () => {
    expect(updateTimeLabel('2026-10-11T18:00:00+05:30', NOW)).toBe('Sun, 6:00 PM')
    expect(updateTimeLabel('2026-10-06T12:00:00+05:30', NOW)).toBe('Tue, 12:00 PM')
    expect(updateTimeLabel('2026-10-04T12:00:00+05:30', NOW)).toBe('4 Oct')
    expect(updateTimeLabel('2025-12-30T12:00:00+05:30', NOW)).toBe('30 Dec 2025')
  })

  test('the IST day decides, not UTC: 18:45 UTC is already tomorrow in Chennai', () => {
    const late = new Date('2026-10-11T18:45:00Z') // 00:15 IST on the 12th
    expect(updateTimeLabel(late.toISOString(), NOW)).toBe('12:15 AM')
    expect(istDateKey(late)).toBe('2026-10-12')
  })

  test('Today, This week and Earlier, in the order given, empty groups left out', () => {
    const items = [
      { id: 'a', at: '2026-10-12T09:00:00+05:30' },
      { id: 'b', at: '2026-10-11T23:59:00+05:30' },
      { id: 'c', at: '2026-10-06T08:00:00+05:30' },
      { id: 'd', at: '2026-10-05T23:00:00+05:30' },
      { id: 'e', at: '2026-10-11T18:45:00Z' },
    ]
    expect(groupUpdates(items, NOW)).toEqual([
      { name: 'Today', items: [items[0], items[4]] },
      { name: 'This week', items: [items[1], items[2]] },
      { name: 'Earlier', items: [items[3]] },
    ])
    expect(groupUpdates([items[3]], NOW).map((g) => g.name)).toEqual(['Earlier'])
  })

  test('booking day and time labels', () => {
    expect(bookingDayLabel('2026-10-15T06:00:00Z')).toBe('Thu 15 Oct')
    expect(istClockParts(new Date('2026-10-15T06:00:00Z'))).toEqual({ time: '11:30', meridiem: 'AM' })
  })
})
