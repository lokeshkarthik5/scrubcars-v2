import { describe, expect, test } from 'bun:test'
import { bookedLine } from './bookings'

// 28 Oct 2026, 3:00 pm in Chennai.
const NOW = Date.parse('2026-10-28T09:30:00.000Z')

describe('bookedLine', () => {
  test('when the booking was made, in Chennai time, under its slot', () => {
    expect(bookedLine('2026-10-28T03:42:00.000Z', NOW)).toBe('Booked today, 9:12 am')
    expect(bookedLine('2026-10-27T13:10:00.000Z', NOW)).toBe('Booked yesterday, 6:40 pm')
    expect(bookedLine('2026-10-20T05:35:00.000Z', NOW)).toBe('Booked Tue 20 Oct, 11:05 am')
  })

  test('a day in Chennai, not in UTC: 11:30 pm the night before is yesterday', () => {
    expect(bookedLine('2026-10-27T18:00:00.000Z', NOW)).toBe('Booked yesterday, 11:30 pm')
    expect(bookedLine('2026-10-27T18:31:00.000Z', NOW)).toBe('Booked today, 12:01 am')
  })

  test('another year says the year; a bad date says nothing', () => {
    expect(bookedLine('2025-12-31T06:30:00.000Z', NOW)).toBe('Booked Wed 31 Dec 2025, 12:00 pm')
    expect(bookedLine('not a date', NOW)).toBe('')
  })
})
