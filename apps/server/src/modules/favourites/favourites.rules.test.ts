import { describe, expect, test } from 'bun:test'
import { AppError } from '../../lib/errors.js'
import { MAX_FAVOURITES } from '../../lib/favourites.js'
import { favouritesWith, type FavouritesStore } from './favourites.rules.js'

// The service's rules over an in-memory store that answers as the SQL does:
// a saved garage customers can no longer open (moved to the Bin, suspended,
// unverified) stays saved but is not read back, which is what
// vendorPagesOpen does (pinned in vendors.predicates.test.ts).

const USER = 'e2e00000-0000-4000-8000-000000000169'
const OTHER_USER = 'e2e00000-0000-4000-8000-000000000170'
const garage = (n: number) => `e2e00000-0000-4000-8000-${String(400 + n).padStart(12, '0')}`

function memoryStore(options: { closed?: Set<string>; paused?: Set<string>; status?: string } = {}) {
  const rows: Array<{ userId: string; vendorId: string }> = []
  const closed = options.closed ?? new Set<string>()
  const paused = options.paused ?? new Set<string>()
  const store: FavouritesStore = {
    async findUser(userId) {
      return { id: userId, status: options.status ?? 'active' }
    },
    async listOpen(userId) {
      return rows
        .filter((row) => row.userId === userId && !closed.has(row.vendorId))
        .reverse()
        .map((row) => ({ vendorId: row.vendorId, pausedAt: paused.has(row.vendorId) ? new Date() : null }))
    },
    async garageOpen(vendorId) {
      return !closed.has(vendorId)
    },
    async saveUnderLimit({ userId, vendorId, decide }) {
      const alreadySaved = rows.some((row) => row.userId === userId && row.vendorId === vendorId)
      const count = rows.filter((row) => row.userId === userId && !closed.has(row.vendorId)).length
      const refusal = decide({ alreadySaved, count })
      if (refusal) return { refusal }
      if (!alreadySaved) rows.push({ userId, vendorId })
      return { refusal: null }
    },
    async remove(userId, vendorId) {
      const at = rows.findIndex((row) => row.userId === userId && row.vendorId === vendorId)
      if (at >= 0) rows.splice(at, 1)
    },
  }
  const service = favouritesWith({
    store,
    cards: async (page) => page.map((p) => ({ id: p.id }) as never),
  })
  return { rows, closed, service }
}

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(AppError)
    return err as AppError
  }
  throw new Error('expected a refusal')
}

describe('saving', () => {
  test('is idempotent: twice is one row, answering the same', async () => {
    const { rows, service } = memoryStore()
    expect(await service.save(USER, garage(1))).toEqual({ vendorId: garage(1), saved: true })
    expect(await service.save(USER, garage(1))).toEqual({ vendorId: garage(1), saved: true })
    expect(rows).toHaveLength(1)
  })

  test(`stops at ${MAX_FAVOURITES}: the next is 409 FAVOURITES_LIMIT, one already saved still answers`, async () => {
    const { rows, service } = memoryStore()
    for (let n = 0; n < MAX_FAVOURITES; n++) await service.save(USER, garage(n))
    const err = await refusal(service.save(USER, garage(MAX_FAVOURITES)))
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('FAVOURITES_LIMIT')
    expect(rows).toHaveLength(MAX_FAVOURITES)
    expect(await service.save(USER, garage(0))).toEqual({ vendorId: garage(0), saved: true })
  })

  test("the cap is each customer's own", async () => {
    const { service } = memoryStore()
    for (let n = 0; n < MAX_FAVOURITES; n++) await service.save(USER, garage(n))
    expect(await service.save(OTHER_USER, garage(1))).toEqual({ vendorId: garage(1), saved: true })
  })

  test('a garage that left the app frees its place', async () => {
    const { closed, service } = memoryStore()
    for (let n = 0; n < MAX_FAVOURITES; n++) await service.save(USER, garage(n))
    closed.add(garage(3))
    expect(await service.save(USER, garage(MAX_FAVOURITES))).toMatchObject({ saved: true })
  })

  test('a garage customers cannot open is a 404', async () => {
    const { rows, service } = memoryStore({ closed: new Set([garage(9)]) })
    const err = await refusal(service.save(USER, garage(9)))
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('VENDOR_NOT_FOUND')
    expect(rows).toHaveLength(0)
  })

  test('a suspended account cannot save', async () => {
    const { service } = memoryStore({ status: 'suspended' })
    expect((await refusal(service.save(USER, garage(1)))).statusCode).toBe(403)
  })
})

describe('unsaving', () => {
  test('is idempotent: one never saved, or already gone, answers the same', async () => {
    const { rows, service } = memoryStore()
    await service.save(USER, garage(1))
    expect(await service.remove(USER, garage(1))).toEqual({ vendorId: garage(1), saved: false })
    expect(await service.remove(USER, garage(1))).toEqual({ vendorId: garage(1), saved: false })
    expect(rows).toHaveLength(0)
  })

  test("never touches another customer's", async () => {
    const { rows, service } = memoryStore()
    await service.save(OTHER_USER, garage(1))
    await service.remove(USER, garage(1))
    expect(rows).toEqual([{ userId: OTHER_USER, vendorId: garage(1) }])
  })
})

describe('Saved garages', () => {
  test('newest first, hidden garages left out, paused ones named', async () => {
    const paused = new Set([garage(2)])
    const closed = new Set<string>()
    const store = memoryStore({ paused, closed })
    await store.service.save(USER, garage(1))
    await store.service.save(USER, garage(2))
    await store.service.save(USER, garage(3))
    await store.service.save(OTHER_USER, garage(4))
    closed.add(garage(3)) // moved to the Bin after it was saved

    const result = await store.service.list(USER)
    expect(result.items.map((card) => card.id)).toEqual([garage(2), garage(1)])
    expect(result.pausedVendorIds).toEqual([garage(2)])
    expect(result.max).toBe(MAX_FAVOURITES)
  })
})
