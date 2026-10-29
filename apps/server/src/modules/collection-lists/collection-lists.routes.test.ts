/**
 * Collection lists' Reopen and Delete list (0065) through the real admin
 * routes and auth, with the database stood in for. Reopen only a closed list
 * with something left to collect; Delete any list, with its items; both
 * signed by the session.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { collectionListsRepository } = await import('./collection-lists.repository.js')
const { onboardingMarksService } = await import('../onboarding-marks/onboarding-marks.service.js')
const { adminCollectionListRoutes } = await import('./collection-lists.routes.js')

const LIST = 'e2e00000-0000-4000-8000-000000005460'
const GARAGE = 'e2e00000-0000-4000-8000-000000005461'
const NOW = new Date()

let list: { id: string; closedAt: Date | null; [key: string]: unknown } | null
let items: Array<{ id: string; listId: string; vendorId: string; kind: string; status: 'to_collect' | 'collected'; [key: string]: unknown }>
let actions: string[] = []

const originals: Array<[Record<string, unknown>, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Record<string, unknown>
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(collectionListsRepository, 'listByIds', async () => (list ? [list] : []))
  patch(collectionListsRepository, 'listItems', async () => items)
  patch(collectionListsRepository, 'listGarageBriefs', async () => [
    { id: GARAGE, businessName: 'Round Garage', address: '', city: 'Chennai', pincode: '', mapsUrl: null, lat: null, lng: null, ownerName: null, ownerPhone: null },
  ])
  patch(collectionListsRepository, 'closeFinished', async () => undefined)
  patch(collectionListsRepository, 'reopen', async (_id: string, actor: { name: string }) => {
    if (!list?.closedAt) return null
    list.closedAt = null
    actions.push(`reopened by ${actor.name}`)
    return { id: LIST }
  })
  patch(collectionListsRepository, 'deleteList', async (_id: string, actor: { name: string }) => {
    if (!list) return null
    list = null
    actions.push(`deleted by ${actor.name}`)
    return { id: LIST }
  })
  // The garage still misses its photos: an item for them is not cleared.
  patch(onboardingMarksService, 'missingFor', async () => new Map([[GARAGE, ['photos']]]))
})
afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})
beforeEach(() => {
  list = {
    id: LIST, assigneeLoginId: null, assigneeName: 'Raga', dueOn: null, note: null,
    createdByName: 'Mathew', createdAt: NOW, telegramSentAt: null, closedAt: NOW,
  }
  items = [
    { id: 'i1', listId: LIST, vendorId: GARAGE, kind: 'photos', label: null, status: 'to_collect', collectedAt: null, collectedByName: null, note: null },
  ]
  actions = []
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminCollectionListRoutes)

async function call(method: string, path: string, body?: unknown, signedIn = true) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(signedIn ? { Cookie: `access_token=${await signAdminToken()}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, body: (await res.json()) as { code?: string; data?: any } }
}

describe('Reopen and Delete list (0065)', () => {
  test('a closed list with something left opens again, signed by the session', async () => {
    expect((await call('POST', `/admin/collection-lists/${LIST}/reopen`, {}, false)).status).toBe(401)
    const res = await call('POST', `/admin/collection-lists/${LIST}/reopen`, {})
    expect(res.status).toBe(200)
    expect(actions).toEqual(['reopened by admin'])
    expect(res.body.data).toMatchObject({ id: LIST, closedAt: null, open: true })
  })

  test('not an open list, and not one with everything done', async () => {
    list!.closedAt = null
    expect((await call('POST', `/admin/collection-lists/${LIST}/reopen`, {})).body.code).toBe('COLLECTION_LIST_OPEN')
    list!.closedAt = NOW
    items[0]!.status = 'collected'
    expect((await call('POST', `/admin/collection-lists/${LIST}/reopen`, {})).body.code).toBe('COLLECTION_LIST_DONE')
    expect(actions).toEqual([])
  })

  test('Delete list takes it with its items; a second press is a 404', async () => {
    const res = await call('DELETE', `/admin/collection-lists/${LIST}`)
    expect(res.status).toBe(200)
    expect(actions).toEqual(['deleted by admin'])
    expect((await call('DELETE', `/admin/collection-lists/${LIST}`)).status).toBe(404)
  })
})
