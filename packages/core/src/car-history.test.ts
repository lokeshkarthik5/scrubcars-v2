import { describe, expect, test } from 'bun:test'
import {
  canSnoozeReminder,
  dueDayLabel,
  historyDateLabel,
  reminderBookHref,
  reminderDueLine,
  servicesLine,
  sinceLabel,
  washCount,
} from './car-history'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const NOW = IST('2026-10-18T12:00:00')

describe('dates', () => {
  test('a due day, with the year only when it is another', () => {
    expect(dueDayLabel('2026-10-24', NOW)).toBe('Sat 24 Oct')
    expect(dueDayLabel('2027-01-15', NOW)).toBe('Fri 15 Jan 2027')
  })

  test('a job date in IST', () => {
    expect(historyDateLabel(IST('2026-10-02T11:00:00').toISOString(), NOW)).toBe('2 Oct')
    // 00:30 IST on 1 Jan is still 31 Dec in UTC.
    expect(historyDateLabel(IST('2026-01-01T00:30:00').toISOString(), NOW)).toBe('1 Jan')
    expect(historyDateLabel(IST('2025-12-28T11:00:00').toISOString(), NOW)).toBe('28 Dec 2025')
    expect(sinceLabel('2025-12-28')).toBe('Dec 2025')
  })
})

describe('the reminder line', () => {
  const r = (state: 'upcoming' | 'due_soon' | 'due' | 'overdue', daysLeft: number, dueOn = '2026-11-20') => ({
    state,
    daysLeft,
    dueOn,
    booked: null,
  })

  test('far off, near, today, overdue', () => {
    expect(reminderDueLine(r('upcoming', 33), NOW)).toBe('Due Fri 20 Nov')
    expect(reminderDueLine(r('due_soon', 5), NOW)).toBe('Due in 5 days')
    expect(reminderDueLine(r('due_soon', 1), NOW)).toBe('Due tomorrow')
    expect(reminderDueLine(r('due', 0), NOW)).toBe('Due today')
    expect(reminderDueLine(r('overdue', -1), NOW)).toBe('1 day overdue')
    expect(reminderDueLine(r('overdue', -12), NOW)).toBe('12 days overdue')
  })

  test('booked', () => {
    expect(
      reminderDueLine(
        { state: 'booked', daysLeft: null, dueOn: '2026-10-20', booked: { bookingId: 'b', scheduledAt: IST('2026-10-22T10:00:00').toISOString() } },
        NOW
      )
    ).toBe('Booked for Thu 22 Oct')
  })

  test('snooze only once it is close', () => {
    expect(canSnoozeReminder({ state: 'upcoming' })).toBe(false)
    expect(canSnoozeReminder({ state: 'booked' })).toBe(false)
    expect(canSnoozeReminder({ state: 'due_soon' })).toBe(true)
    expect(canSnoozeReminder({ state: 'overdue' })).toBe(true)
  })

  test('Book searches the service that answers it', () => {
    expect(reminderBookHref({ bookCategory: 'car_wash' })).toBe('/search?category=car_wash')
  })
})

describe('words', () => {
  test('services and counts', () => {
    expect(servicesLine([{ name: 'Exterior Wash' }, { name: 'Interior Vacuum' }])).toBe('Exterior Wash, Interior Vacuum')
    expect(servicesLine([])).toBe('Service')
    expect(washCount(1)).toBe('1 wash')
    expect(washCount(3)).toBe('3 washes')
  })
})
