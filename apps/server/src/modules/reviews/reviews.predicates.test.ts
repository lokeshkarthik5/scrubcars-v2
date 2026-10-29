import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { COUNTED_REVIEW, countedReview } from './reviews.predicates.js'

const dialect = new PgDialect()
const text = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) =>
  dialect.sqlToQuery(fragment).sql

/**
 * The SQL twins of lib/ratings.ts isCountedReview: both leave out a hidden
 * review and a Test booking's, and nothing else. Every rating reader uses
 * one of them; ratings.test.ts pins the rule itself.
 */
describe('COUNTED_REVIEW and countedReview()', () => {
  test('the raw SQL over `r`: not hidden, and its booking not marked Test', () => {
    const sql = text(COUNTED_REVIEW)
    expect(sql).toContain('r.hidden_at IS NULL')
    expect(sql).toContain('counted_b.id = r.booking_id')
    expect(sql).toContain('counted_b.marked_test_at IS NOT NULL')
    expect(sql).toContain('NOT EXISTS')
  })

  test('the Drizzle twin says the same over the reviews table', () => {
    const sql = text(countedReview())
    expect(sql).toContain('"reviews"."hidden_at" is null')
    expect(sql).toContain('counted_b.id = "reviews"."booking_id"')
    expect(sql).toContain('counted_b.marked_test_at IS NOT NULL')
    expect(sql).toContain('NOT EXISTS')
  })
})
