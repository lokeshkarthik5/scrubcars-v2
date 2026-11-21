/**
 * setPhotoOrder (lib/photo-order.ts) writes under the garage's photo rows'
 * lock: the lock is its own first statement, the check sees the ids read
 * after it, nothing is written when the check says no, and otherwise each
 * photo's sort_order is written 0..n-1 in the order given, then admin's audit
 * row, all in the one transaction.
 *
 * The statements are run against a stand-in connection that records them
 * (drizzle's pg-proxy driver), never a database.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/pg-proxy'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { db } = await import('../../db/index.js')
const { vendorsRepository } = await import('./vendors.repository.js')
const { photoOrderProblem } = await import('../../lib/photo-order.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000008040'
const [P1, P2, P3] = [
  'e2e00000-0000-4000-8000-000000008041',
  'e2e00000-0000-4000-8000-000000008042',
  'e2e00000-0000-4000-8000-000000008043',
]

/** A transaction on a connection that records each statement and its params, answering with `answers` in order. */
function recordTransactions(answers: unknown[][][]) {
  const statements: Array<{ sql: string; params: unknown[] }> = []
  const tx = drizzle(async (sql, params) => {
    statements.push({ sql: sql.replace(/\s+/g, ' ').trim().toLowerCase(), params })
    return { rows: answers.shift() ?? [] }
  })
  const original = db.transaction
  ;(db as unknown as { transaction: unknown }).transaction = (work: (t: unknown) => Promise<unknown>) => work(tx)
  restore = () => {
    ;(db as unknown as { transaction: unknown }).transaction = original
  }
  return statements
}

let restore = () => {}
afterEach(() => restore())

const at = new Date('2026-11-20T10:00:00Z')
// vendor_photos' columns in schema order: id, vendor_id, url, storage_key, sort_order, created_at.
const row = (id: string, sortOrder: number) => [id, GARAGE, `https://cdn.test/${id}.jpg`, null, sortOrder, at.toISOString()]

describe('setPhotoOrder', () => {
  test('locks first, checks, then writes 0..n-1 and the audit in one transaction', async () => {
    const statements = recordTransactions([
      [[P1], [P2], [P3]], // the lock
      [[P1], [P2], [P3]], // the ids as they are shown now
      [], [], [], // three updates
      [], // the audit
      [row(P3, 0), row(P1, 1), row(P2, 2)], // the new order
    ])
    const seen: string[][] = []
    const result = await vendorsRepository.setPhotoOrder(
      GARAGE,
      [P3, P1, P2],
      (current) => {
        seen.push(current)
        return photoOrderProblem(current, [P3, P1, P2])
      },
      { sub: 'admin:7', name: 'Raga' }
    )

    expect(seen).toEqual([[P1, P2, P3]])
    expect(result.problem).toBeNull()
    expect(result.problem === null && result.photos.map((p) => [p.id, p.sortOrder])).toEqual([
      [P3, 0],
      [P1, 1],
      [P2, 2],
    ])

    expect(statements).toHaveLength(7)
    expect(statements[0]!.sql).toStartWith('select "id" from "vendor_photos"')
    expect(statements[0]!.sql).toContain('order by "vendor_photos"."id" asc')
    expect(statements[0]!.sql).toEndWith('for update')
    expect(statements[0]!.params).toEqual([GARAGE])
    expect(statements[1]!.sql).not.toContain('for update')
    expect(statements[1]!.sql).toContain('order by "vendor_photos"."sort_order" asc, "vendor_photos"."created_at" asc')

    const updates = statements.slice(2, 5)
    for (const [index, update] of updates.entries()) {
      expect(update.sql).toStartWith('update "vendor_photos" set "sort_order" = $1')
      expect(update.sql).toContain('"vendor_photos"."vendor_id" = $3')
      expect(update.params).toEqual([index, [P3, P1, P2][index], GARAGE])
    }

    expect(statements[5]!.sql).toStartWith('insert into "admin_audit_log"')
    expect(statements[5]!.params).toContain('garage_photos_reordered')
    expect(statements[5]!.params).toContain('admin:7')
    expect(statements[5]!.params).toContain('Raga')
    expect(statements[5]!.params).toContain(JSON.stringify({ before: [P1, P2, P3], after: [P3, P1, P2] }))
  })

  test('a refused list writes nothing', async () => {
    const statements = recordTransactions([
      [[P1], [P2], [P3]],
      [[P1], [P2], [P3]],
    ])
    const result = await vendorsRepository.setPhotoOrder(GARAGE, [P2, P1], (current) =>
      photoOrderProblem(current, [P2, P1])
    )
    expect(result).toEqual({ problem: 'PHOTO_ORDER_STALE' })
    expect(statements).toHaveLength(2)
    expect(statements.some((s) => s.sql.startsWith('update') || s.sql.startsWith('insert'))).toBe(false)
  })

  test("the garage's own change has no audit row", async () => {
    const statements = recordTransactions([
      [[P1], [P2]],
      [[P1], [P2]],
      [], [],
      [row(P2, 0), row(P1, 1)],
    ])
    const result = await vendorsRepository.setPhotoOrder(GARAGE, [P2, P1], (current) =>
      photoOrderProblem(current, [P2, P1])
    )
    expect(result.problem).toBeNull()
    expect(statements.some((s) => s.sql.includes('admin_audit_log'))).toBe(false)
  })
})
