/**
 * The Garages page's target and colour tags (0061), through the real admin
 * routes and auth, with the repository stood in for (no database).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsRepository } = await import('../admin-logins/admin-logins.repository.js')
const { garageBoardRepository } = await import('./garage-board.repository.js')

const RAGA = 'e2e00000-0000-4000-8000-000000004160'
const A = 'e2e00000-0000-4000-8000-000000004301'
const B = 'e2e00000-0000-4000-8000-000000004302'
const BINNED = 'e2e00000-0000-4000-8000-000000004303'
const NOBODY = 'e2e00000-0000-4000-8000-000000004399'

type Row = { key: string; value: Record<string, unknown>; updatedByName: string; updatedAt: Date }
const settings = new Map<string, Row>()
const tags = new Map<string, Record<string, unknown>>()
const garages = new Map([
  [A, { id: A, deletedAt: null as Date | null, purgedAt: null as Date | null }],
  [B, { id: B, deletedAt: null, purgedAt: null }],
  [BINNED, { id: BINNED, deletedAt: new Date(), purgedAt: null }],
])

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(adminLoginsRepository, 'findSession', async (id: string) =>
    id === RAGA
      ? { id, username: 'raga', name: 'Raga', status: 'active', isOwner: false, sessionsFrom: new Date('2026-01-01') }
      : undefined
  )
  const r = garageBoardRepository
  patch(r, 'listSettings', async (keys: string[]) => keys.flatMap((key) => (settings.has(key) ? [settings.get(key)!] : [])))
  patch(r, 'saveSetting', async (key: string, value: Record<string, unknown>, updatedByName: string, now: Date) => {
    const row = { key, value, updatedByName, updatedAt: now }
    settings.set(key, row)
    return row
  })
  patch(r, 'findGarages', async (ids: string[]) => ids.flatMap((id) => (garages.has(id) ? [garages.get(id)!] : [])))
  patch(r, 'setColourTags', async (ids: string[], values: Record<string, unknown>) =>
    ids.map((id) => {
      tags.set(id, values)
      return { id, ...values }
    })
  )
})

beforeEach(() => {
  settings.clear()
  tags.clear()
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin', adminRoutes)

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(token ? { Cookie: `access_token=${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json()) as { data?: any; code?: string } }
}

const raga = () => signAdminToken(personalAdminSubject(RAGA))

describe('the target and colour names', () => {
  test('defaults until set; set by one, seen by all, with who and when', async () => {
    expect((await call('GET', '/admin/garage-board/settings', null)).status).toBe(401)
    const first = await call('GET', '/admin/garage-board/settings', await raga())
    expect(first.body.data.target).toEqual({ target: 50, endsOn: null, counts: 'live', updatedBy: null, updatedAt: null })
    expect(first.body.data.colourNames).toMatchObject({ green: 'All confirmed', blue: 'Call back', updatedBy: null })

    const set = await call('PUT', '/admin/garage-board/target', await raga(), {
      target: 60,
      endsOn: '2026-12-31',
      counts: 'onboarded',
      actorName: 'Someone else',
    })
    expect(set.status).toBe(200)
    expect(set.body.data.target).toMatchObject({ target: 60, endsOn: '2026-12-31', counts: 'onboarded', updatedBy: 'Raga' })

    const renamed = await call('PUT', '/admin/garage-board/colour-names', await signAdminToken(), {
      green: 'Verified on call',
      amber: 'A few to confirm',
      red: 'Needs details',
      blue: 'Call back',
    })
    expect(renamed.body.data.colourNames).toMatchObject({ green: 'Verified on call', updatedBy: 'admin' })
    const again = await call('GET', '/admin/garage-board/settings', await raga())
    expect(again.body.data.colourNames.green).toBe('Verified on call')
    expect(again.body.data.target.target).toBe(60)
  })

  test('a bad target is 400', async () => {
    expect(
      (await call('PUT', '/admin/garage-board/target', await raga(), { target: 0, endsOn: null, counts: 'live' })).status
    ).toBe(400)
  })
})

describe('colour tags', () => {
  test('one colour on several garages, signed; none clears who set it', async () => {
    const set = await call('POST', '/admin/garage-board/colour-tags', await raga(), {
      vendorIds: [A, B, A],
      tag: 'blue',
      callOn: '2026-10-30',
    })
    expect(set.status).toBe(200)
    expect(set.body.data.garages).toHaveLength(2)
    expect(tags.get(A)).toMatchObject({ colourTag: 'blue', colourTagCallOn: '2026-10-30', colourTagSetBy: 'Raga' })

    const cleared = await call('POST', '/admin/garage-board/colour-tags', await raga(), { vendorIds: [A], tag: null })
    expect(cleared.body.data.garages[0]).toMatchObject({
      colourTag: null,
      colourTagCallOn: null,
      colourTagSetBy: null,
      colourTagSetAt: null,
    })
  })

  test('a garage in the Bin or unknown changes none of them', async () => {
    const binned = await call('POST', '/admin/garage-board/colour-tags', await raga(), { vendorIds: [A, BINNED], tag: 'red' })
    expect(binned.status).toBe(409)
    expect(binned.body.code).toBe('VENDOR_IN_BIN')
    expect(tags.size).toBe(0)
    const unknown = await call('POST', '/admin/garage-board/colour-tags', await raga(), { vendorIds: [NOBODY], tag: 'red' })
    expect(unknown.status).toBe(404)
  })
})
