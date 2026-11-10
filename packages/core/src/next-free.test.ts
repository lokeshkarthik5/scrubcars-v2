import { describe, expect, test } from 'bun:test'
import {
  nextFreeBatches,
  nextFreeDayLabel,
  nextFreeTimeLabels,
  upcomingNextFree,
} from './next-free'

// Monday 9 November 2026, 10:00 IST. Every label here is read on this clock.
const NOW = Date.parse('2026-11-09T10:00:00+05:30')
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString()

describe('nextFreeDayLabel', () => {
  test('Today and Tomorrow by India’s calendar, then the day', () => {
    expect(nextFreeDayLabel({ day: 'today', times: [at('2026-11-09', '16:30')] }, NOW)).toBe('Today')
    expect(nextFreeDayLabel({ day: 'tomorrow', times: [at('2026-11-10', '08:00')] }, NOW)).toBe('Tomorrow')
    expect(nextFreeDayLabel({ day: '2026-11-12', times: [at('2026-11-12', '09:00')] }, NOW)).toBe('Thu 12 Nov')
  })

  test("read from the times, not the server's word: kept past midnight, today's answer is yesterday's", () => {
    const nextMorning = Date.parse('2026-11-10T00:30:00+05:30')
    expect(nextFreeDayLabel({ day: 'tomorrow', times: [at('2026-11-10', '08:00')] }, nextMorning)).toBe('Today')
  })

  test('a quarter past midnight UTC is still the IST day', () => {
    expect(nextFreeDayLabel({ day: 'tomorrow', times: [at('2026-11-10', '05:30')] }, NOW)).toBe('Tomorrow')
  })
})

describe('nextFreeTimeLabels', () => {
  test('the clock as the picker says it', () => {
    expect(nextFreeTimeLabels({ day: 'today', times: [at('2026-11-09', '16:30'), at('2026-11-09', '09:00')] })).toEqual([
      '4:30 pm',
      '9:00 am',
    ])
  })
})

describe('upcomingNextFree', () => {
  test('drops a time that has passed, and the row once none is left', () => {
    const free = { day: 'today', times: [at('2026-11-09', '09:30'), at('2026-11-09', '11:00')] }
    expect(upcomingNextFree(free, NOW)).toEqual({ day: 'today', times: [at('2026-11-09', '11:00')] })
    expect(upcomingNextFree({ day: 'today', times: [at('2026-11-09', '09:30')] }, NOW)).toBeNull()
    expect(upcomingNextFree(null, NOW)).toBeNull()
  })
})

describe('nextFreeBatches', () => {
  test('at most twenty an ask, none twice, in order', () => {
    const ids = Array.from({ length: 45 }, (_, i) => `g${i}`)
    const batches = nextFreeBatches([...ids, 'g0', 'g1'])
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5])
    expect(batches.flat()).toEqual(ids)
  })
})
