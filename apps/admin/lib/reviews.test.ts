import { describe, expect, test } from 'bun:test'
import { reviewCountsLabel } from './reviews'

describe('the Reviews tab\'s "Counts?" column (0065)', () => {
  test('a Test booking\'s never counts, a hidden one is out, the rest count', () => {
    expect(reviewCountsLabel({ counts: false, test: true, hidden: null })).toBe('Test: never counts')
    // A hidden Test review still reads as Test: deleting the booking is its fix.
    expect(reviewCountsLabel({ counts: false, test: true, hidden: { at: '', by: 'Mathew', reason: 'x' } })).toBe(
      'Test: never counts'
    )
    expect(reviewCountsLabel({ counts: false, test: false, hidden: { at: '', by: 'Mathew', reason: 'Abusive' } })).toBe(
      'Hidden'
    )
    expect(reviewCountsLabel({ counts: true, test: false, hidden: null })).toBe('Counts')
  })
})
