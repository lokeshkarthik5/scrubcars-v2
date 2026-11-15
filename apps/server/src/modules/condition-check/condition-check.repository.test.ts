/**
 * The car condition check's writes that must never change a sent check
 * (0075): each takes the per-job lock Send takes (`job-photos:<booking>`)
 * before it reads "not sent", so a Remove or a before photo's reading that
 * races "Send to customer" waits for it and then sees the check as sent.
 * Rendered, never run: the transaction is a stand-in that records what it
 * was asked, in order, and nothing here touches a database.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { db } = await import('../../db/index.js')
const { conditionCheckRepository } = await import('./condition-check.repository.js')

const BOOKING = 'e2e00000-0000-4000-8000-000000002620'
const dialect = new PgDialect()

type Step = { kind: 'lock'; key: unknown } | { kind: 'update' } | { kind: 'insert' }

/** A transaction that records each step; every write finds nothing to change. */
function recordingTransaction(steps: Step[]) {
  const chain: Record<string, unknown> = {}
  for (const name of ['set', 'where', 'values']) chain[name] = () => chain
  chain.returning = async () => []
  const tx = {
    execute: async (query: SQL) => {
      const { sql, params } = dialect.sqlToQuery(query)
      if (sql.includes('pg_advisory_xact_lock')) steps.push({ kind: 'lock', key: params[0] })
      return []
    },
    update: () => {
      steps.push({ kind: 'update' })
      return chain
    },
    insert: () => {
      steps.push({ kind: 'insert' })
      return chain
    },
  }
  return tx
}

const realTransaction = db.transaction
function standIn(steps: Step[]) {
  ;(db as unknown as { transaction: unknown }).transaction = async (run: (tx: unknown) => Promise<unknown>) =>
    run(recordingTransaction(steps))
}

afterEach(() => {
  ;(db as unknown as { transaction: unknown }).transaction = realTransaction
})

describe('writes that read "not sent" wait for Send', () => {
  test('Remove / Undo a mark: the lock, then the conditional update', async () => {
    const steps: Step[] = []
    standIn(steps)
    expect(await conditionCheckRepository.setRemoved(BOOKING, crypto.randomUUID(), new Date())).toBeNull()
    expect(steps).toEqual([{ kind: 'lock', key: `job-photos:${BOOKING}` }, { kind: 'update' }])
  })

  test("a before photo's reading: the lock, then the conditional update", async () => {
    const steps: Step[] = []
    standIn(steps)
    const saved = await conditionCheckRepository.saveReading({
      bookingId: BOOKING,
      photoId: crypto.randomUUID(),
      stage: 'before',
      comparedPhotoId: null,
      marks: [],
      at: new Date(),
    })
    expect(saved).toBe(false)
    expect(steps).toEqual([{ kind: 'lock', key: `job-photos:${BOOKING}` }, { kind: 'update' }])
  })

  test("an after photo's reading does not touch a sent check, so it takes no lock", async () => {
    const steps: Step[] = []
    standIn(steps)
    await conditionCheckRepository.saveReading({
      bookingId: BOOKING,
      photoId: crypto.randomUUID(),
      stage: 'after',
      comparedPhotoId: null,
      marks: [],
      at: new Date(),
    })
    expect(steps).toEqual([{ kind: 'update' }])
  })
})
