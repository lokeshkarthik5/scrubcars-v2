import { describe, expect, test } from 'bun:test'
import { inSlotAlertWindow, slotAlertDayLabel, slotAlertSummary } from './slot-alerts'

const IST = (iso: string) => new Date(`${iso}+05:30`).toISOString()

describe('slot alerts', () => {
  test('a start is in its window in IST, start included, end not', () => {
    expect(inSlotAlertWindow(IST('2026-10-24T06:00:00'), 'morning')).toBe(true)
    expect(inSlotAlertWindow(IST('2026-10-24T12:00:00'), 'morning')).toBe(false)
    expect(inSlotAlertWindow(IST('2026-10-24T12:00:00'), 'afternoon')).toBe(true)
    expect(inSlotAlertWindow(IST('2026-10-24T17:00:00'), 'evening')).toBe(true)
    expect(inSlotAlertWindow(IST('2026-10-24T22:00:00'), 'evening')).toBe(false)
    expect(inSlotAlertWindow(IST('2026-10-24T05:00:00'), 'any')).toBe(true)
  })

  test('the day and the window, as the screens say them', () => {
    expect(slotAlertDayLabel('2026-10-24')).toBe('Sat 24 Oct')
    expect(slotAlertSummary({ date: '2026-10-24', window: 'morning' })).toBe('Sat 24 Oct · Morning, 6 AM–12 PM')
    expect(slotAlertSummary({ date: '2026-10-24', window: 'any' })).toBe('Sat 24 Oct · Any time')
  })
})
