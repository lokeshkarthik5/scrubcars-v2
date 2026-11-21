import { describe, expect, test } from 'bun:test'
import {
  cardGoogleRating,
  garageRating,
  GOOGLE_RATING_RULES,
  googleIsMain,
  heldGoogleRating,
} from './ratings.js'

/**
 * Google rating for new garages (21 Nov 2026): which rating a garage shows.
 * Linked to Google with fewer than 5 counted Detlio reviews: Google's (named
 * as Google's). From 5: Detlio's, Google's only as the garage page's small
 * line. Not linked: today's rule (stars from the 3rd counted review). Google's
 * figures are never shown once 30 days old, and never on a map.
 */

const NOW = new Date('2026-11-21T06:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const fresh = { googleRating: '4.6', googleReviewCount: 312, googleFetchedAt: new Date(NOW.getTime() - 3 * DAY) }
const stale = { ...fresh, googleFetchedAt: new Date(NOW.getTime() - 31 * DAY) }

describe('heldGoogleRating: Google’s 30 days', () => {
  test('a fresh read is shown, one decimal', () => {
    expect(heldGoogleRating(fresh, NOW)).toEqual({ rating: 4.6, reviewCount: 312 })
    expect(heldGoogleRating({ ...fresh, googleRating: 4.25 }, NOW)).toEqual({ rating: 4.3, reviewCount: 312 })
  })

  test('29 days 23 hours old is still shown; 30 days old is not', () => {
    const almost = new Date(NOW.getTime() - (30 * DAY - 60 * 60 * 1000))
    expect(heldGoogleRating({ ...fresh, googleFetchedAt: almost }, NOW)).not.toBeNull()
    const thirty = new Date(NOW.getTime() - 30 * DAY)
    expect(heldGoogleRating({ ...fresh, googleFetchedAt: thirty }, NOW)).toBeNull()
    expect(heldGoogleRating(stale, NOW)).toBeNull()
    expect(GOOGLE_RATING_RULES.holdDays).toBe(30)
  })

  test('nothing read, no rating, or no reviews on Google: nothing', () => {
    expect(heldGoogleRating(null, NOW)).toBeNull()
    expect(heldGoogleRating(undefined, NOW)).toBeNull()
    expect(heldGoogleRating({ ...fresh, googleFetchedAt: null }, NOW)).toBeNull()
    expect(heldGoogleRating({ ...fresh, googleRating: null }, NOW)).toBeNull()
    expect(heldGoogleRating({ ...fresh, googleReviewCount: null }, NOW)).toBeNull()
    expect(heldGoogleRating({ ...fresh, googleReviewCount: 0 }, NOW)).toBeNull()
    expect(heldGoogleRating({ ...fresh, googleRating: '7' }, NOW)).toBeNull()
  })
})

/** The card: what its first figure is, from the counted reviews and the lead. */
function card(counted: number, lead: typeof fresh | null, map = false) {
  const average = counted === 0 ? null : 4.8
  const detlio = garageRating({ average, count: counted })
  const google = cardGoogleRating(heldGoogleRating(lead, NOW), counted, { map })
  if (google) return { shows: 'google', ...google }
  if (!detlio.isNew) return { shows: 'detlio', rating: detlio.rating, reviewCount: detlio.reviewCount }
  return { shows: 'new' }
}

describe('which rating a card shows: 0/3/4/5 Detlio reviews × linked/unlinked × stale', () => {
  const cases: Array<[number, 'linked' | 'unlinked' | 'stale', string]> = [
    [0, 'linked', 'google'],
    [3, 'linked', 'google'],
    [4, 'linked', 'google'],
    [5, 'linked', 'detlio'],
    [0, 'unlinked', 'new'],
    [3, 'unlinked', 'detlio'],
    [4, 'unlinked', 'detlio'],
    [5, 'unlinked', 'detlio'],
    [0, 'stale', 'new'],
    [3, 'stale', 'detlio'],
    [4, 'stale', 'detlio'],
    [5, 'stale', 'detlio'],
  ]
  for (const [counted, link, shows] of cases) {
    test(`${counted} counted, ${link}: ${shows}`, () => {
      const lead = link === 'linked' ? fresh : link === 'stale' ? stale : null
      expect(card(counted, lead).shows).toBe(shows)
    })
  }

  test('Google’s figures are Google’s own, never mixed with Detlio’s', () => {
    expect(card(4, fresh)).toEqual({ shows: 'google', rating: 4.6, reviewCount: 312 })
    expect(card(5, fresh)).toEqual({ shows: 'detlio', rating: 4.8, reviewCount: 5 })
  })

  test('never on a map, whatever the count', () => {
    for (const counted of [0, 3, 4]) expect(card(counted, fresh, true).shows).not.toBe('google')
  })

  test('googleIsMain switches over at 5', () => {
    const google = { rating: 4.4, reviewCount: 186 }
    expect(googleIsMain(google, 4)).toBe(true)
    expect(googleIsMain(google, GOOGLE_RATING_RULES.detlioTakesOverAt)).toBe(false)
    expect(googleIsMain(null, 0)).toBe(false)
  })
})
