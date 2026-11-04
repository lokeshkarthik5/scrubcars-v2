import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { tstz } from './sql-dates.js'

const dialect = new PgDialect()

describe('tstz', () => {
  test('binds the ISO string and casts it, so no Date reaches the driver', () => {
    const at = new Date('2026-10-18T06:30:00.000Z')
    const query = dialect.sqlToQuery(
      sql`select 1 from t where created_at > ${tstz(at)}`
    )
    expect(query.sql).toBe('select 1 from t where created_at > $1::timestamptz')
    expect(query.params).toEqual(['2026-10-18T06:30:00.000Z'])
    expect(query.params.some((p) => p instanceof Date)).toBe(false)
  })

  test('a raw Date in a template is what the driver is handed unchanged', () => {
    // The mistake the helper exists for: Drizzle does not convert it, the
    // param is still a Date, and postgres.js (prepare: false) cannot send it.
    const at = new Date('2026-10-18T06:30:00.000Z')
    const query = dialect.sqlToQuery(
      sql`select 1 from t where created_at > ${at}`
    )
    expect(query.params[0]).toBeInstanceOf(Date)
  })

  test('works several times in one query, in order', () => {
    const start = new Date('2026-10-01T00:00:00.000Z')
    const end = new Date('2026-11-01T00:00:00.000Z')
    const query = dialect.sqlToQuery(
      sql`where a >= ${tstz(start)} and a < ${tstz(end)}`
    )
    expect(query.sql).toBe('where a >= $1::timestamptz and a < $2::timestamptz')
    expect(query.params).toEqual([start.toISOString(), end.toISOString()])
  })
})
