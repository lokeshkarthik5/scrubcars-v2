import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_COLOUR_NAMES,
  DEFAULT_GARAGE_TARGET,
  isColourTag,
  parseColourNames,
  parseGarageTarget,
} from './admin-settings.js'

describe('colour names', () => {
  test('the stored names over the defaults; blank, missing or not text is the default', () => {
    expect(parseColourNames(null)).toEqual(DEFAULT_COLOUR_NAMES)
    expect(parseColourNames({ green: ' Verified on call ', amber: '', red: 3, extra: 'x' })).toEqual({
      ...DEFAULT_COLOUR_NAMES,
      green: 'Verified on call',
    })
    expect(parseColourNames({ blue: 'b'.repeat(40) }).blue).toHaveLength(30)
  })

  test('only the four colours are tags', () => {
    for (const tag of ['green', 'amber', 'red', 'blue']) expect(isColourTag(tag)).toBe(true)
    for (const tag of ['Green', 'purple', '', null, 1]) expect(isColourTag(tag)).toBe(false)
  })
})

describe('the onboarding target', () => {
  test('defaults to 50 live garages with no end date', () => {
    expect(DEFAULT_GARAGE_TARGET).toEqual({ target: 50, endsOn: null, counts: 'live' })
    expect(parseGarageTarget(undefined)).toEqual(DEFAULT_GARAGE_TARGET)
  })

  test('each stored field is taken when valid, else the default', () => {
    expect(parseGarageTarget({ target: 80, endsOn: '2026-12-31', counts: 'onboarded' })).toEqual({
      target: 80,
      endsOn: '2026-12-31',
      counts: 'onboarded',
    })
    expect(parseGarageTarget({ target: 0, endsOn: '31 Dec', counts: 'all' })).toEqual(DEFAULT_GARAGE_TARGET)
    expect(parseGarageTarget({ target: 2.5 }).target).toBe(50)
    expect(parseGarageTarget({ target: 10_001 }).target).toBe(50)
  })
})
