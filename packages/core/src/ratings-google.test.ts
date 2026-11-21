import { afterEach, describe, expect, test } from 'bun:test'
import { useLang } from './i18n/store'
import {
  alsoGoogleRating,
  detlioRatingLabel,
  GOOGLE_MAPS_ATTRIBUTION,
  googleRatingSpoken,
  mainGoogleRating,
  ratingShown,
} from './ratings'

/**
 * Google rating for new garages (21 Nov 2026), the apps' side: which rating
 * a garage's cell shows from what the API sent, and the marks' spoken names.
 */

afterEach(() => useLang.getState().setLang('en'))

const google = { rating: 4.6, reviewCount: 312 }

describe('which rating shows', () => {
  test('linked, under 5 counted Detlio reviews: Google’s, even with a Detlio score (3 or 4)', () => {
    for (const reviewCount of [0, 2, 3, 4]) {
      const rating = reviewCount >= 3 ? 4.8 : null
      expect(ratingShown({ rating, reviewCount, isNew: reviewCount < 3, google })).toEqual({ kind: 'google', google })
      expect(alsoGoogleRating({ reviewCount, google })).toBeNull()
    }
  })

  test('5 or more: Detlio’s own (the d.), Google’s only for the quiet “Also” line', () => {
    const vendor = { rating: 4.8, reviewCount: 23, isNew: false, google: { rating: 4.4, reviewCount: 186 } }
    expect(ratingShown(vendor)).toEqual({ kind: 'detlio', rating: 4.8, reviewCount: 23 })
    expect(mainGoogleRating(vendor)).toBeNull()
    expect(alsoGoogleRating(vendor)).toEqual({ rating: 4.4, reviewCount: 186 })
  })

  test('not linked (or stale, which the API sends as null): today’s rule', () => {
    expect(ratingShown({ rating: null, reviewCount: 0, isNew: true, google: null })).toEqual({ kind: 'new' })
    expect(ratingShown({ rating: null, reviewCount: 2, isNew: true })).toEqual({ kind: 'new' })
    expect(ratingShown({ rating: 4.7, reviewCount: 3, isNew: false, google: null })).toEqual({
      kind: 'detlio',
      rating: 4.7,
      reviewCount: 3,
    })
  })
})

describe('the marks’ words', () => {
  test('the d. says whose rating it is', () => {
    expect(detlioRatingLabel(4.8)).toBe('Detlio rating 4.8')
    expect(detlioRatingLabel(4)).toBe('Detlio rating 4.0')
  })

  test('Google’s rating is spoken with Google Maps, never translated', () => {
    expect(googleRatingSpoken(google)).toBe('Google rating 4.6, 312 reviews, Google Maps.')
    expect(googleRatingSpoken({ rating: 5, reviewCount: 1 })).toBe('Google rating 5.0, 1 review, Google Maps.')
    useLang.getState().setLang('ta')
    expect(googleRatingSpoken(google)).toBe('Google ரேட்டிங் 4.6, 312 மதிப்பாய்வுகள், Google Maps.')
    expect(googleRatingSpoken(google)).toContain(GOOGLE_MAPS_ATTRIBUTION)
    expect(detlioRatingLabel(4.8)).toBe('Detlio ரேட்டிங் 4.8')
  })
})
