import { describe, expect, test } from 'bun:test'
import {
  bookingListTab,
  parseBookingListTab,
  splitBookingList,
} from './my-bookings'
import type { BookingStatus } from './types'

const booking = (
  id: string,
  status: BookingStatus,
  scheduledAtIso: string,
  moved = false
) => ({ id, status, scheduledAtIso, moved })

describe('bookingListTab', () => {
  test('still to happen is Upcoming', () => {
    for (const status of ['pending', 'confirmed', 'in_progress'] as const) {
      expect(bookingListTab({ status, moved: false })).toBe('upcoming')
    }
  })

  test('over is Past: completed, and cancelled for any reason', () => {
    // Declined by the garage, cancelled by anyone and a no-show of either
    // side are all `cancelled` on the row.
    expect(bookingListTab({ status: 'completed', moved: false })).toBe('past')
    expect(bookingListTab({ status: 'cancelled', moved: false })).toBe('past')
  })

  test('the old half of a move is in neither', () => {
    expect(bookingListTab({ status: 'rescheduled', moved: false })).toBeNull()
    // Today a move cancels the old row; `moved` is what tells it apart.
    expect(bookingListTab({ status: 'cancelled', moved: true })).toBeNull()
  })

  test('a status from a newer server is shown under Past, not lost', () => {
    const unknown = { status: 'on_hold' as BookingStatus, moved: false }
    expect(bookingListTab(unknown)).toBe('past')
  })
})

describe('parseBookingListTab', () => {
  test('only "past" opens Past; anything else is Upcoming', () => {
    expect(parseBookingListTab('past')).toBe('past')
    expect(parseBookingListTab('upcoming')).toBe('upcoming')
    expect(parseBookingListTab(null)).toBe('upcoming')
    expect(parseBookingListTab('PAST')).toBe('upcoming')
  })
})

describe('splitBookingList', () => {
  test('Upcoming soonest first, Past most recent first', () => {
    const { upcoming, past } = splitBookingList([
      booking('a', 'confirmed', '2026-10-09T04:30:00.000Z'),
      booking('b', 'completed', '2026-10-01T04:30:00.000Z'),
      booking('c', 'pending', '2026-10-06T04:30:00.000Z'),
      booking('d', 'cancelled', '2026-10-03T04:30:00.000Z'),
      booking('e', 'in_progress', '2026-10-05T04:30:00.000Z'),
    ])
    expect(upcoming.map((b) => b.id)).toEqual(['e', 'c', 'a'])
    expect(past.map((b) => b.id)).toEqual(['d', 'b'])
  })

  test('by the real time, not the display string: 1 Nov is after 9 Oct', () => {
    const { upcoming } = splitBookingList([
      booking('nov', 'confirmed', '2026-11-01T04:30:00.000Z'),
      booking('oct', 'confirmed', '2026-10-09T04:30:00.000Z'),
    ])
    expect(upcoming.map((b) => b.id)).toEqual(['oct', 'nov'])
  })

  test('a moved booking is left out, and the booking it became is kept', () => {
    const { upcoming, past } = splitBookingList([
      booking('old', 'cancelled', '2026-10-06T04:30:00.000Z', true),
      booking('legacy', 'rescheduled', '2026-10-06T05:30:00.000Z'),
      booking('new', 'pending', '2026-10-07T04:30:00.000Z'),
    ])
    expect(upcoming.map((b) => b.id)).toEqual(['new'])
    expect(past).toEqual([])
  })

  test('the same time keeps a steady order', () => {
    const at = '2026-10-06T04:30:00.000Z'
    const { upcoming } = splitBookingList([
      booking('y', 'confirmed', at),
      booking('x', 'confirmed', at),
    ])
    expect(upcoming.map((b) => b.id)).toEqual(['x', 'y'])
  })

  test('leaves the list it was given alone', () => {
    const list = [
      booking('a', 'confirmed', '2026-10-09T04:30:00.000Z'),
      booking('b', 'confirmed', '2026-10-06T04:30:00.000Z'),
    ]
    splitBookingList(list)
    expect(list.map((b) => b.id)).toEqual(['a', 'b'])
  })
})
