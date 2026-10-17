import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  LISTED_TO_CUSTOMERS,
  isListedToCustomers,
  type ListedRow,
} from './vendors.predicates.js'

const STATUSES = ['pending', 'active', 'suspended', 'archived'] as const

/** Every garage the three facts can describe. */
const everyRow = (): ListedRow[] =>
  STATUSES.flatMap((status) =>
    [true, false].flatMap((isVerified) =>
      [null, new Date('2026-10-01T04:30:00Z')].map((bookingsPausedAt) => ({
        status,
        isVerified,
        bookingsPausedAt,
      }))
    )
  )

describe('isListedToCustomers', () => {
  test('only an Active, verified garage that is not paused is listed', () => {
    const listed = everyRow().filter(isListedToCustomers)
    expect(listed).toEqual([{ status: 'active', isVerified: true, bookingsPausedAt: null }])
  })

  test('Active is not enough: unverified or paused garages are not listed', () => {
    expect(isListedToCustomers({ status: 'active', isVerified: false, bookingsPausedAt: null })).toBe(false)
    expect(
      isListedToCustomers({ status: 'active', isVerified: true, bookingsPausedAt: '2026-10-01T04:30:00Z' })
    ).toBe(false)
  })
})

describe('the SQL the customer lists run', () => {
  const { sql, params } = new PgDialect().sqlToQuery(LISTED_TO_CUSTOMERS)

  // The twin above is what the tests can run; the SQL is what the lists run.
  // Pinned word for word, so neither can gain or lose a condition alone.
  test('is the same three conditions as the twin', () => {
    expect(sql).toBe(
      "(v.status = 'active' AND v.is_verified = true AND v.bookings_paused_at IS NULL)"
    )
    expect(params).toEqual([])
  })

  test('evaluated as the twin reads it, it agrees on every garage', () => {
    // A tiny reading of exactly the three clauses above, so a row the SQL
    // would list is a row the twin calls listed, and no other.
    const clauses = sql.slice(1, -1).split(' AND ')
    const sqlListed = (row: ListedRow) =>
      clauses.every((clause) => {
        if (clause === "v.status = 'active'") return row.status === 'active'
        if (clause === 'v.is_verified = true') return row.isVerified === true
        if (clause === 'v.bookings_paused_at IS NULL') return row.bookingsPausedAt === null
        throw new Error(`a condition the twin does not know: ${clause}`)
      })
    for (const row of everyRow()) {
      expect(sqlListed(row)).toBe(isListedToCustomers(row))
    }
  })
})
