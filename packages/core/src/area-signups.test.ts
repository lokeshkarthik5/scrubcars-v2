import { describe, expect, test } from 'bun:test'
import {
  cardClosesKey,
  closeOnce,
  freeWashCardVisible,
  freeWashesGone,
  parseCardCloses,
  waitingLine,
} from './area-signups'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-29T10:00:00Z')

describe('the free-wash card’s ×', () => {
  test('shown until closed; back after 7 days; never after the third close', () => {
    expect(freeWashCardVisible(null, NOW)).toBe(true)
    const once = closeOnce(null, NOW)
    expect(once).toEqual({ count: 1, lastAt: NOW })
    expect(freeWashCardVisible(once, NOW + 6 * DAY)).toBe(false)
    expect(freeWashCardVisible(once, NOW + 7 * DAY)).toBe(true)
    const twice = closeOnce(once, NOW + 7 * DAY)
    expect(freeWashCardVisible(twice, NOW + 14 * DAY)).toBe(true)
    const thrice = closeOnce(twice, NOW + 14 * DAY)
    expect(freeWashCardVisible(thrice, NOW + 365 * DAY)).toBe(false)
  })

  test('kept per area; a bad value reads as never closed', () => {
    expect(cardClosesKey('velachery')).toBe('detlio:free-wash-closed:velachery')
    expect(parseCardCloses(JSON.stringify({ count: 2, lastAt: NOW }))).toEqual({ count: 2, lastAt: NOW })
    expect(parseCardCloses('nope')).toBeNull()
    expect(parseCardCloses(null)).toBeNull()
    expect(parseCardCloses('{"count":"x"}')).toBeNull()
  })
})

describe('honest counts', () => {
  test('"N waiting here" only from 10; otherwise "Be the first"', () => {
    expect(waitingLine('Velachery', 24)).toBe('24 waiting here')
    expect(waitingLine('Velachery', 9)).toBe('Be the first in Velachery')
    expect(waitingLine('Velachery', null)).toBe('Be the first in Velachery')
  })

  test('the free washes are gone only when the API says none are left', () => {
    expect(freeWashesGone(0)).toBe(true)
    expect(freeWashesGone(1)).toBe(false)
    expect(freeWashesGone(undefined)).toBe(false)
  })
})
