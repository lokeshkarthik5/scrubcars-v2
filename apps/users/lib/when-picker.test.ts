import { describe, expect, test } from 'bun:test'
import {
  addDaysToKey,
  dateChipOf,
  firstOpenDayAfter,
  splitByMorning,
  weekOf,
} from './when-picker'

describe('when-picker', () => {
  test('adds days across a month end', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  test('names a day for its chip', () => {
    expect(dateChipOf('2026-10-20')).toEqual({
      value: '2026-10-20',
      dayOfWeek: 2,
      dayName: 'Tue',
      day: 20,
      monthName: 'Oct',
    })
  })

  test('a week starts today', () => {
    const week = weekOf('2026-10-19', 7)
    expect(week).toHaveLength(7)
    expect(week[0].value).toBe('2026-10-19')
    expect(week[6].value).toBe('2026-10-25')
  })

  test('finds the first open day, today included', () => {
    const sundaysShut = (key: string) => dateChipOf(key).dayOfWeek === 0
    // Sun 18 Oct is shut, so Mon 19.
    expect(firstOpenDayAfter('2026-10-18', -1, sundaysShut, 7)).toBe(
      '2026-10-19'
    )
    // From Mon 19, the next open day after it.
    expect(firstOpenDayAfter('2026-10-19', 0, sundaysShut, 7)).toBe(
      '2026-10-20'
    )
    expect(firstOpenDayAfter('2026-10-19', -1, () => true, 7)).toBeNull()
  })

  test('splits times at noon in Chennai', () => {
    const nineAm = '2026-10-20T03:30:00.000Z'
    const elevenThirty = '2026-10-20T06:00:00.000Z'
    const noon = '2026-10-20T06:30:00.000Z'
    const ninePm = '2026-10-20T15:30:00.000Z'
    expect(splitByMorning([nineAm, elevenThirty, noon, ninePm])).toEqual({
      morning: [nineAm, elevenThirty],
      later: [noon, ninePm],
    })
  })
})
