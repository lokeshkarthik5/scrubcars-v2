/**
 * The backup's SQL against its sheets (lib/garage-backup.ts), with no
 * database: every column a sheet names has exactly one expression, in the
 * same order, and nothing secret is ever selected. The queries themselves
 * run against a real Postgres in garage-backup.db.test.ts.
 */
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { BACKUP_SOURCES, backupPageQuery } = await import('./garage-backup.repository.js')
const { BACKUP_TABLES } = await import('../../lib/garage-backup.js')

describe('the backup SQL', () => {
  test('one expression per column, in the sheet’s order, for every sheet and no other', () => {
    expect(Object.keys(BACKUP_SOURCES).sort()).toEqual(BACKUP_TABLES.map((t) => t.key).sort())
    for (const table of BACKUP_TABLES) {
      expect([table.key, ...Object.keys(BACKUP_SOURCES[table.key].select)]).toEqual([
        table.key,
        ...table.columns.map((column) => column.key),
      ])
    }
  })

  test('never a secret: no hash, OTP, token, handover code, storage key or Razorpay key', () => {
    const forbidden =
      /password|otp_|otp\b|token|_hash|pickup_code|delivery_code|qr_key|storage_key|secret|key_id|webhook|client_id|refresh/i
    for (const source of Object.values(BACKUP_SOURCES)) {
      for (const expression of [source.from, ...Object.values(source.select)]) {
        expect(expression).not.toMatch(forbidden)
      }
    }
  })

  test('the cursor and the page size are bound, never written into the SQL', () => {
    const cursor = 'e2e00000-0000-4000-8000-000000007851'
    const query = new PgDialect().sqlToQuery(backupPageQuery(BACKUP_SOURCES.bookings, cursor, 500))
    expect(query.sql).not.toContain(cursor)
    expect(query.params).toEqual([cursor, 501])
    expect(query.sql).toMatch(/where b\.id > \$1::uuid\s+order by b\.id\s+limit \$2/)

    const first = new PgDialect().sqlToQuery(backupPageQuery(BACKUP_SOURCES.bookings, null, 500))
    expect(first.params).toEqual([501])
    expect(first.sql).toMatch(/where true\s+order by b\.id/)
  })
})
