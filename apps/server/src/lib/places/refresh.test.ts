import { describe, expect, test } from 'bun:test'
import {
  googleHoldEnded,
  googleRefreshDue,
  googleRefreshOutcome,
  isGoogleRefreshHour,
} from './refresh.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-29T21:30:00Z') // 03:00 IST on the 30th
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

const DETAILS = {
  name: 'Shine Pro Detailing',
  address: '3rd Main Road',
  phone: '9840022417',
  rating: 4.8,
  reviewCount: 320,
  lat: 13.09,
  lng: 80.21,
}

describe('when', () => {
  test('due from day 29; the hold ends on day 30', () => {
    expect(googleRefreshDue(ago(28.9), NOW)).toBe(false)
    expect(googleRefreshDue(ago(29), NOW)).toBe(true)
    expect(googleHoldEnded(ago(29.9), NOW)).toBe(false)
    expect(googleHoldEnded(ago(30), NOW)).toBe(true)
    expect(googleRefreshDue(null, NOW)).toBe(false)
    expect(googleHoldEnded(null, NOW)).toBe(false)
  })

  test('only the 01:00–04:59 IST runs', () => {
    expect(isGoogleRefreshHour(new Date('2026-10-29T19:29:00Z'))).toBe(false) // 00:59 IST
    expect(isGoogleRefreshHour(new Date('2026-10-29T19:30:00Z'))).toBe(true) // 01:00 IST
    expect(isGoogleRefreshHour(new Date('2026-10-29T23:29:00Z'))).toBe(true) // 04:59 IST
    expect(isGoogleRefreshHour(new Date('2026-10-29T23:30:00Z'))).toBe(false) // 05:00 IST
  })
})

describe('googleRefreshOutcome', () => {
  test('Google answered: its fields again, dated now; the team’s own fields are not in the patch', () => {
    const outcome = googleRefreshOutcome(
      { pinSource: 'ola', lat: 13, lng: 80, googleFetchedAt: ago(29) },
      DETAILS,
      NOW
    )
    expect(outcome).toEqual({
      kind: 'refreshed',
      patch: {
        googleName: 'Shine Pro Detailing',
        googlePhone: '9840022417',
        googleAddress: '3rd Main Road',
        googleRating: '4.8',
        googleReviewCount: 320,
        googleFetchedAt: NOW,
      },
    })
    if (outcome.kind !== 'kept') {
      expect(Object.keys(outcome.patch)).not.toContain('name')
      expect(Object.keys(outcome.patch)).not.toContain('phone')
    }
  })

  test('a pin from Google moves with the refresh, and stays when Google gives none', () => {
    const lead = {
      pinSource: 'google',
      lat: 13,
      lng: 80,
      googleFetchedAt: ago(29),
    }
    const moved = googleRefreshOutcome(lead, DETAILS, NOW)
    expect(moved.kind === 'refreshed' && moved.patch.pin).toEqual({
      lat: 13.09,
      lng: 80.21,
    })
    const kept = googleRefreshOutcome(
      lead,
      { ...DETAILS, lat: null, lng: null },
      NOW
    )
    expect(kept.kind === 'refreshed' && 'pin' in kept.patch).toBe(false)
  })

  test('Google no longer has the place: everything from Google is cleared, a Google pin too', () => {
    const outcome = googleRefreshOutcome(
      { pinSource: 'google', lat: 13, lng: 80, googleFetchedAt: ago(29) },
      null,
      NOW
    )
    expect(outcome).toEqual({
      kind: 'cleared',
      patch: {
        googleName: null,
        googlePhone: null,
        googleAddress: null,
        googleRating: null,
        googleReviewCount: null,
        googleFetchedAt: null,
        pin: null,
      },
    })
    // A pin the team set (or Ola gave) is not Google's and stays.
    const own = googleRefreshOutcome(
      { pinSource: 'maps_link', lat: 13, lng: 80, googleFetchedAt: ago(29) },
      null,
      NOW
    )
    expect(own.kind === 'cleared' && 'pin' in own.patch).toBe(false)
  })

  test('Google could not be asked: kept inside the 30 days, cleared after', () => {
    expect(
      googleRefreshOutcome(
        { pinSource: null, lat: null, lng: null, googleFetchedAt: ago(29.5) },
        undefined,
        NOW
      )
    ).toEqual({ kind: 'kept' })
    expect(
      googleRefreshOutcome(
        { pinSource: null, lat: null, lng: null, googleFetchedAt: ago(30) },
        undefined,
        NOW
      ).kind
    ).toBe('cleared')
  })
})
