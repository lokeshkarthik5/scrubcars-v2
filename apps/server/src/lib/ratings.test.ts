import { describe, expect, test } from 'bun:test'
import {
  NEGATIVE_REVIEW_TAGS,
  NEW_GARAGE_SORT_RATING,
  POSITIVE_REVIEW_TAGS,
  RATING_RULES,
  REVIEW_TAG_LABELS,
  garageRating,
  isCountedReview,
  knownFor,
  orderedTagCounts,
  reasonProblem,
  replyEditable,
  replyRefusal,
  reviewTagsRefusal,
  tagsForRating,
} from './ratings.js'

const HOUR = 60 * 60 * 1000
const AT = new Date('2026-10-29T10:00:00.000Z')
const later = (hours: number) => new Date(AT.getTime() + hours * HOUR)

describe('the counted-review rule', () => {
  test('a review counts unless its booking is marked Test or admin hid it', () => {
    expect(isCountedReview({ hiddenAt: null, bookingMarkedTest: false })).toBe(true)
    expect(isCountedReview({ hiddenAt: null, bookingMarkedTest: true })).toBe(false)
    expect(isCountedReview({ hiddenAt: AT, bookingMarkedTest: false })).toBe(false)
    expect(isCountedReview({ hiddenAt: AT, bookingMarkedTest: true })).toBe(false)
  })
})

describe('the new-garage rule', () => {
  test('fewer than 3 counted reviews: no score, new on Detlio', () => {
    expect(RATING_RULES.minCountedReviews).toBe(3)
    expect(garageRating(null)).toEqual({ rating: null, reviewCount: 0, isNew: true })
    expect(garageRating({ average: 5, count: 1 })).toEqual({ rating: null, reviewCount: 1, isNew: true })
    expect(garageRating({ average: 4.5, count: 2 })).toEqual({ rating: null, reviewCount: 2, isNew: true })
  })

  test('from 3 counted reviews the score shows, to two places', () => {
    expect(garageRating({ average: 4.666666, count: 3 })).toEqual({ rating: 4.67, reviewCount: 3, isNew: false })
    expect(garageRating({ average: 4.6, count: 23 })).toEqual({ rating: 4.6, reviewCount: 23, isNew: false })
  })

  test('a new garage sorts in the middle, not as a 5.0', () => {
    expect(NEW_GARAGE_SORT_RATING).toBeLessThan(5)
    expect(NEW_GARAGE_SORT_RATING).toBeGreaterThan(1)
  })
})

describe('tags', () => {
  test('good ones for 4-5 stars, problems for 1-3', () => {
    expect(tagsForRating(5)).toEqual(POSITIVE_REVIEW_TAGS)
    expect(tagsForRating(4)).toEqual(POSITIVE_REVIEW_TAGS)
    expect(tagsForRating(3)).toEqual(NEGATIVE_REVIEW_TAGS)
    expect(tagsForRating(1)).toEqual(NEGATIVE_REVIEW_TAGS)
    expect(Object.keys(REVIEW_TAG_LABELS)).toEqual([...POSITIVE_REVIEW_TAGS, ...NEGATIVE_REVIEW_TAGS])
    expect(REVIEW_TAG_LABELS.damp_interior).toBe('Damp/wet interior')
  })

  test('refused: unknown words, the wrong tone for the stars, a tag twice', () => {
    expect(reviewTagsRefusal(5, [])).toBeNull()
    expect(reviewTagsRefusal(5, ['on_time', 'friendly'])).toBeNull()
    expect(reviewTagsRefusal(2, ['late', 'rude'])).toBeNull()
    expect(reviewTagsRefusal(5, ['amazing'])).toBe('unknown_tag')
    expect(reviewTagsRefusal(5, ['late'])).toBe('wrong_tone')
    expect(reviewTagsRefusal(3, ['on_time'])).toBe('wrong_tone')
    expect(reviewTagsRefusal(4, ['on_time', 'on_time'])).toBe('duplicate')
  })

  test('known for: the top good tag once 5 or more customers picked it', () => {
    expect(RATING_RULES.knownForMinCustomers).toBe(5)
    expect(knownFor([{ tag: 'on_time', count: 4 }])).toBeNull()
    expect(knownFor([{ tag: 'on_time', count: 5 }])).toBe('on_time')
    expect(knownFor([{ tag: 'on_time', count: 5 }, { tag: 'friendly', count: 9 }])).toBe('friendly')
    // A tie goes to the earlier in the list; a problem is never "known for".
    expect(knownFor([{ tag: 'friendly', count: 6 }, { tag: 'spotless_finish', count: 6 }])).toBe('spotless_finish')
    expect(knownFor([{ tag: 'late', count: 40 }])).toBeNull()
  })

  test('counts in the list\'s order, zeros left out', () => {
    expect(
      orderedTagCounts([
        { tag: 'late', count: 2 },
        { tag: 'on_time', count: 18 },
        { tag: 'friendly', count: 0 },
        { tag: 'nonsense', count: 3 },
      ])
    ).toEqual([
      { tag: 'on_time', label: 'On time', count: 18, positive: true },
      { tag: 'late', label: 'Late', count: 2, positive: false },
    ])
  })
})

describe('the garage\'s reply: one, editable for 24 hours', () => {
  test('the first reply may come at any time', () => {
    expect(replyRefusal({ hiddenAt: null, repliedAt: null }, 'Thank you!', later(24 * 90))).toBeNull()
  })

  test('changed within 24 hours of the first, never after', () => {
    const replied = { hiddenAt: null, repliedAt: AT }
    expect(replyRefusal(replied, 'Updated', later(23.9))).toBeNull()
    expect(replyRefusal(replied, 'Updated', later(24))).toBe('window_closed')
    expect(replyEditable(AT, later(23.99))).toBe(true)
    expect(replyEditable(AT, later(24))).toBe(false)
  })

  test('none on a hidden review, and words within the limit', () => {
    expect(replyRefusal({ hiddenAt: AT, repliedAt: null }, 'Hi', AT)).toBe('review_hidden')
    expect(replyRefusal({ hiddenAt: null, repliedAt: null }, '   ', AT)).toBe('empty')
    expect(replyRefusal({ hiddenAt: null, repliedAt: null }, 'x'.repeat(1001), AT)).toBe('too_long')
  })
})

describe('a typed reason', () => {
  test('3 characters to the limit, trimmed', () => {
    expect(reasonProblem('  ab ', 300)).toBe('too_short')
    expect(reasonProblem('Abusive', 300)).toBeNull()
    expect(reasonProblem('x'.repeat(301), 300)).toBe('too_long')
  })
})
