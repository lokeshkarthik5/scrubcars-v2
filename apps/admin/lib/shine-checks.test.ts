import { describe, expect, test } from 'bun:test'
import { parseShineFilter, shineFilterHint, shineListHref } from './shine-checks'

describe('Shine checks wording', () => {
  test('the chip comes from the URL, New by default', () => {
    expect(parseShineFilter('looks_fine')).toBe('looks_fine')
    expect(parseShineFilter('nonsense')).toBe('new')
    expect(parseShineFilter(null)).toBe('new')
    expect(shineListHref('new')).toBe('/shine-checks')
    expect(shineListHref('followed_up')).toBe('/shine-checks?show=followed_up')
  })

  test('the hint says the server’s number', () => {
    expect(shineFilterHint('new', 60)).toContain('under 60')
  })
})
