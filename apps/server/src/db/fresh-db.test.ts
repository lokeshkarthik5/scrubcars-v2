import { describe, expect, test } from 'bun:test'

// No query is made, so the address is never dialled: postgres() connects lazily.
process.env.DATABASE_URL ??= 'postgresql://nobody:nothing@127.0.0.1:1/none?sslmode=disable'
const { DB_STALE_AFTER_MS, db, dbGeneration, useFreshDb } = await import('./index.js')

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

  test('db reads through to drizzle', () => {
    expect(typeof db.select).toBe('function')
    expect(typeof db.transaction).toBe('function')
    expect(db.query).toBeDefined()
  })
})
