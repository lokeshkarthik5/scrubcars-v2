/**
 * The owner's deletes (10 Nov 2026) through the real admin routes and auth:
 * only the owner's login and the shared break-glass login reach them; any
 * other admin login is 403 ADMIN_OWNER_ONLY before anything is read. Each
 * write is signed with the session, and a delete that touches money or a
 * customer needs its typed confirmation. The services are stood in for;
 * their rules are lib/owner-delete.test.ts's and the E2E specs'.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsService } = await import('../admin-logins/admin-logins.service.js')
const { ownerDeleteService } = await import('./owner-delete.service.js')
const { adminCustomersService } = await import('../admin-customers/admin-customers.service.js')
const { coverageService } = await import('../coverage/coverage.service.js')

const OWNER = 'e2e00000-0000-4000-8000-000000006901'
const TEAMMATE = 'e2e00000-0000-4000-8000-000000006902'
const ROW = 'e2e00000-0000-4000-8000-000000006990'

const calls: Array<{ kind: string; args: unknown[] }> = []
type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  // Two personal logins: the owner and a teammate who is not.
  patch(adminLoginsService, 'sessionActor', async (sub: string) => {
    const id = sub.slice('admin:'.length)
    if (id === OWNER) return { sub, kind: 'personal', name: 'Mathew', username: 'owner', loginId: OWNER, isOwner: true }
    if (id === TEAMMATE) return { sub, kind: 'personal', name: 'Raga', username: 'raga', loginId: TEAMMATE, isOwner: false }
    return null
  })
  for (const key of ['deleteReview', 'deleteComplaint', 'deleteAdminLogin'] as const) {
    patch(ownerDeleteService, key, async (...args: unknown[]) => {
      calls.push({ kind: key, args })
      return { id: ROW, deleted: true }
    })
  }
  patch(adminCustomersService, 'deleteCustomer', async (...args: unknown[]) => {
    calls.push({ kind: 'deleteCustomer', args })
    return { id: ROW, deleted: true }
  })
  patch(adminCustomersService, 'search', async () => ({ customers: [] }))
  patch(coverageService, 'removeZoneAnyway', async (...args: unknown[]) => {
    calls.push({ kind: 'removeZoneAnyway', args })
    return { removed: true }
  })
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

async function call(method: string, path: string, body: unknown, token?: string) {
  const res = await app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: `access_token=${token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { data?: any; code?: string } }
}

const asOwner = () => signAdminToken(personalAdminSubject(OWNER))
const asTeammate = () => signAdminToken(personalAdminSubject(TEAMMATE))

describe('only the owner deletes anything', () => {
  test('GET /admin/me says who may', async () => {
    expect((await call('GET', '/admin/me', null, await asOwner())).body.data.canDeleteAnything).toBe(true)
    expect((await call('GET', '/admin/me', null, await asTeammate())).body.data.canDeleteAnything).toBe(false)
    expect((await call('GET', '/admin/me', null, await signAdminToken())).body.data.canDeleteAnything).toBe(true)
  })

  test('another admin login is 403 ADMIN_OWNER_ONLY, and nothing is asked of the service', async () => {
    const before = calls.length
    const token = await asTeammate()
    for (const [method, path, body] of [
      ['DELETE', `/admin/owner-delete/reviews/${ROW}`, {}],
      ['DELETE', `/admin/owner-delete/complaints/${ROW}`, { confirmText: 'C-000001' }],
      ['DELETE', `/admin/owner-delete/admin-logins/${ROW}`, { confirmText: 'raga' }],
      ['DELETE', `/admin/owner-delete/coupon-batches/${ROW}/codes`, { code: 'DTL-7K4QM-92MXA' }],
      ['DELETE', `/admin/customers/${ROW}`, { confirmText: '9000000001' }],
      ['DELETE', `/admin/coverage/zones/${ROW}/anyway`, { confirmText: 'Perambur' }],
    ] as const) {
      const res = await call(method, path, body, token)
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('ADMIN_OWNER_ONLY')
    }
    expect(calls.length).toBe(before)
    // The Customers page itself is for the whole team.
    expect((await call('GET', '/admin/customers?q=raga', null, token)).status).toBe(200)
  })

  test('signed out is 401', async () => {
    expect((await call('DELETE', `/admin/owner-delete/reviews/${ROW}`, {})).status).toBe(401)
  })

  test('the owner deletes, signed with the session whatever name is sent', async () => {
    const res = await call('DELETE', `/admin/owner-delete/reviews/${ROW}`, { actorName: 'Typed Name' }, await asOwner())
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: ROW, deleted: true })
    expect(calls.at(-1)).toEqual({
      kind: 'deleteReview',
      args: [{ sub: personalAdminSubject(OWNER), name: 'Mathew', loginId: OWNER }, ROW],
    })
  })

  test('the shared break-glass login is the owner\'s too', async () => {
    const res = await call('DELETE', `/admin/customers/${ROW}`, { confirmText: '9000000001' }, await signAdminToken())
    expect(res.status).toBe(200)
    expect(calls.at(-1)).toEqual({
      kind: 'deleteCustomer',
      args: [{ sub: 'admin', name: 'admin' }, ROW, '9000000001'],
    })
  })

  test('a delete that touches a customer needs its typed confirmation; a bad id is a 400', async () => {
    const token = await asOwner()
    expect((await call('DELETE', `/admin/owner-delete/complaints/${ROW}`, {}, token)).status).toBe(400)
    expect((await call('DELETE', '/admin/owner-delete/complaints/not-a-uuid', { confirmText: 'x' }, token)).status).toBe(400)
    const done = await call('DELETE', `/admin/owner-delete/complaints/${ROW}`, { confirmText: 'C-000001' }, token)
    expect(done.status).toBe(200)
    expect(calls.at(-1)!.args.slice(1)).toEqual([ROW, 'C-000001'])
    // One printed code is typed in full, as Void asks; a code that can't be
    // one is refused before anything is read (the real service, no database).
    expect((await call('DELETE', `/admin/owner-delete/coupon-batches/${ROW}/codes`, {}, token)).status).toBe(400)
    const typo = await call('DELETE', `/admin/owner-delete/coupon-batches/${ROW}/codes`, { code: 'DTL-NOT-A-CODE' }, token)
    expect(typo.status).toBe(400)
    expect(typo.body.code).toBe('COUPON_CODE_TYPO')
    // Nothing else may ride along.
    expect(
      (await call('DELETE', `/admin/owner-delete/reviews/${ROW}`, { reason: 'extra' }, token)).status
    ).toBe(400)
  })
})
