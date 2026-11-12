import { describe, expect, test } from 'bun:test'

// No query is made, so the address is never dialled: postgres() connects lazily.
process.env.DATABASE_URL ??= 'postgresql://nobody:nothing@127.0.0.1:1/none?sslmode=disable'
const { DB_STALE_AFTER_MS, abandonDb, db, dbGeneration, tableOf, useFreshDb } = await import('./index.js')

describe('useFreshDb', () => {
  test('requests close together share the connection', () => {
    const before = dbGeneration()
    useFreshDb()()
    useFreshDb(Date.now() + 1_000)()
    expect(dbGeneration()).toBe(before)
  })

  test('after a quiet spell the next request gets a new connection', () => {
    const before = dbGeneration()
    useFreshDb()()
    useFreshDb(Date.now() + DB_STALE_AFTER_MS + 1)()
    expect(dbGeneration()).toBe(before + 1)
  })

  test('never while another request is still using it', () => {
    const first = useFreshDb()
    const before = dbGeneration()
    const second = useFreshDb(Date.now() + DB_STALE_AFTER_MS + 1)
    expect(dbGeneration()).toBe(before)
    second()
    first()
  })

  test('a stuck request lets the connection go at once', () => {
    const before = dbGeneration()
    const stuck = useFreshDb()
    abandonDb()
    expect(dbGeneration()).toBe(before + 1)
    // The stuck one finishing later must not unbalance the count: a quiet
    // spell afterwards still brings a fresh connection.
    stuck()
    useFreshDb()()
    useFreshDb(Date.now() + DB_STALE_AFTER_MS + 1)()
    expect(dbGeneration()).toBe(before + 2)
  })

  test('db reads through to drizzle', () => {
    expect(typeof db.select).toBe('function')
    expect(typeof db.transaction).toBe('function')
    expect(db.query).toBeDefined()
  })
})

describe('tableOf', () => {
  test('names the table, never a value', () => {
    expect(tableOf('select "id" from "reviews" where "vendor_id" = $1')).toBe('reviews')
    expect(tableOf('insert into "bookings" ("id") values ($1)')).toBe('bookings')
    expect(tableOf('update "vendors" set "name" = $1')).toBe('vendors')
    expect(tableOf('select 1')).toBeNull()
  })
})
