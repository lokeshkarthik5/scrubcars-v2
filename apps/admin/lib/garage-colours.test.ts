import { describe, expect, test } from 'bun:test'
import { DEFAULT_COLOUR_NAMES } from '@repo/core/garage-target'
import {
  callDayText,
  colourCounts,
  colourOf,
  colourSetLine,
  colourSortValue,
  colourText,
  matchesColour,
  parseColourFilter,
} from './garage-colours'

// Wed 28 Oct 2026, 3:00 pm in Chennai.
const NOW = Date.parse('2026-10-28T09:30:00.000Z')

describe('colour tags', () => {
  test('the URL filter: a colour or none; anything else is no filter', () => {
    expect(parseColourFilter('green')).toBe('green')
    expect(parseColourFilter('none')).toBe('none')
    expect(parseColourFilter('pink')).toBeNull()
    expect(parseColourFilter(null)).toBeNull()
  })

  test('a garage’s colour; an older API’s garage has none', () => {
    expect(colourOf({ colourTag: 'blue' })).toBe('blue')
    expect(colourOf({ colourTag: null })).toBeNull()
    expect(colourOf({})).toBeNull()
  })

  test('chips filter by colour or none, and count every garage once', () => {
    const rows = [
      { colourTag: 'green' as const },
      { colourTag: 'green' as const },
      { colourTag: 'red' as const },
      {},
    ]
    expect(colourCounts(rows)).toEqual({
      green: 2,
      amber: 0,
      red: 1,
      blue: 0,
      none: 1,
    })
    expect(rows.filter((v) => matchesColour(v, 'green'))).toHaveLength(2)
    expect(rows.filter((v) => matchesColour(v, 'none'))).toHaveLength(1)
    expect(rows.filter((v) => matchesColour(v, null))).toHaveLength(4)
  })

  test('sorts in the chips’ order, none last', () => {
    expect(colourSortValue({ colourTag: 'green' })).toBe(0)
    expect(colourSortValue({ colourTag: 'blue' })).toBe(3)
    expect(colourSortValue({ colourTag: null })).toBeNull()
  })
})

describe('the tag’s words', () => {
  test('its name, renamed or not; Call back with its day', () => {
    const names = { ...DEFAULT_COLOUR_NAMES, green: 'Verified on call' }
    expect(
      colourText({ colourTag: 'green', colourTagCallOn: null }, names, NOW)
    ).toBe('Verified on call')
    expect(
      colourText(
        { colourTag: 'blue', colourTagCallOn: '2026-10-29' },
        names,
        NOW
      )
    ).toBe('Call back tomorrow')
    expect(
      colourText(
        { colourTag: 'blue', colourTagCallOn: '2026-10-30' },
        names,
        NOW
      )
    ).toBe('Call back Fri')
    expect(
      colourText({ colourTag: 'blue', colourTagCallOn: null }, names, NOW)
    ).toBe('Call back')
    expect(
      colourText({ colourTag: null, colourTagCallOn: null }, names, NOW)
    ).toBeNull()
  })

  test('the call day: today, tomorrow, the weekday this week, the date beyond, and a past day', () => {
    expect(callDayText('2026-10-28', NOW)).toBe('today')
    expect(callDayText('2026-11-03', NOW)).toBe('Tue')
    expect(callDayText('2026-11-04', NOW)).toBe('4 Nov')
    expect(callDayText('2026-10-24', NOW)).toBe('was 24 Oct')
    expect(callDayText('nope', NOW)).toBe('')
  })

  test('who set it and when', () => {
    expect(
      colourSetLine(
        {
          colourTagSetBy: 'Mathew',
          colourTagSetAt: '2026-10-28T05:00:00.000Z',
        },
        NOW
      )
    ).toBe('Set by Mathew · 28 Oct')
    expect(
      colourSetLine(
        { colourTagSetBy: 'Raga', colourTagSetAt: '2025-12-31T20:00:00.000Z' },
        NOW
      )
    ).toBe('Set by Raga · 1 Jan')
    expect(
      colourSetLine({ colourTagSetBy: null, colourTagSetAt: null }, NOW)
    ).toBeNull()
  })
})
