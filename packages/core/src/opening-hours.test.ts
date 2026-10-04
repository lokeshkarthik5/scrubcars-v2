import { describe, expect, test } from 'bun:test'
import { openStatus, type OpeningDay } from './opening-hours'

// Every clock here is fixed and written in IST, so the answers do not depend
// on when or where the suite runs. 5 Oct 2026 is a Monday.
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`)

/** Open 9 AM–7 PM every day, Sunday off. */
const WEEK: OpeningDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: '09:00:00',
  closeTime: '19:00:00',
  isClosed: dayOfWeek === 0,
}))

describe('openStatus', () => {
  test('says nothing when the hours are unknown', () => {
    expect(openStatus(null, at('2026-10-05', '10:00'))).toBeNull()
    expect(openStatus([], at('2026-10-05', '10:00'))).toBeNull()
  })

  test('is open inside the hours and says when it closes', () => {
    expect(openStatus(WEEK, at('2026-10-05', '10:00'))).toEqual({
      isOpen: true,
      closedToday: false,
      detail: 'closes 7 PM',
    })
  })

  test('before opening, says when it opens today', () => {
    expect(openStatus(WEEK, at('2026-10-05', '08:00'))).toEqual({
      isOpen: false,
      closedToday: false,
      detail: 'opens 9 AM',
    })
  })

  test('steps over the weekly off day', () => {
    // Saturday evening: Sunday is off, so the next opening is Monday.
    expect(openStatus(WEEK, at('2026-10-10', '20:00'))?.detail).toBe('opens Mon 9 AM')
  })

  test('on a holiday it is "Closed today" even inside the weekly hours', () => {
    expect(openStatus(WEEK, at('2026-10-05', '10:00'), ['2026-10-05'])).toEqual({
      isOpen: false,
      closedToday: true,
      detail: 'opens 9 AM tomorrow',
    })
  })

  test('the next opening skips a holiday tomorrow', () => {
    expect(
      openStatus(WEEK, at('2026-10-05', '20:00'), ['2026-10-06'])
    ).toEqual({ isOpen: false, closedToday: false, detail: 'opens Wed 9 AM' })
  })

  test('a holiday on another day changes nothing today', () => {
    expect(openStatus(WEEK, at('2026-10-05', '10:00'), ['2026-10-09'])).toEqual({
      isOpen: true,
      closedToday: false,
      detail: 'closes 7 PM',
    })
  })

  test('a week of holidays leaves nothing to promise', () => {
    const fortnight = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10)
    )
    expect(openStatus(WEEK, at('2026-10-05', '10:00'), fortnight)).toEqual({
      isOpen: false,
      closedToday: true,
      detail: null,
    })
  })
})
