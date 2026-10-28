/**
 * "Delete test booking" (0061) through the real admin routes and auth: the
 * per-booking routes work with the reset switched off (unlike the rest of
 * /data-reset), are super-admin only, and sign the delete with the session.
 * The service is stood in for; its rules are lib/data-reset.test.ts's.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
// The reset's switch stays off: these routes must not need it.
delete process.env.ADMIN_DATA_RESET

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { dataResetService } = await import('./data-reset.service.js')
const { env } = await import('../../lib/env.js')

const BOOKING = 'e2e00000-0000-4000-8000-000000004201'
const HASH = 'a'.repeat(64)

const calls: Array<{ kind: string; args: unknown[] }> = []
type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(dataResetService, 'previewTestBooking', async (...args: unknown[]) => {
    calls.push({ kind: 'preview', args })
    return { chains: [{ rootId: BOOKING }], selectionHash: HASH }
  })
  patch(dataResetService, 'deleteTestBooking', async (...args: unknown[]) => {
    calls.push({ kind: 'delete', args })
    if ((args[2] as { confirmText: string }).confirmText !== 'DELETE 1 BOOKING') {
      throw new AppError(400, 'Type DELETE 1 BOOKING exactly as shown to confirm.', 'CONFIRM_PHRASE_MISMATCH')
    }
    return { auditId: 'audit-1', by: (args[2] as { actorName: string }).actorName }
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

async function call(path: string, body: unknown, token?: string) {
  const res = await app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: `access_token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { data?: any; code?: string } }
}

describe('delete test booking routes', () => {
  test('the reset switch is off, and the reset itself is a 404', async () => {
    expect(env.adminDataReset).toBe(false)
    const token = await signAdminToken()
    expect((await call('/admin/data-reset/preview', { scope: { kind: 'marked_test' } }, token)).status).toBe(404)
  })

  test('the dry run works without the switch, for an admin only', async () => {
    expect((await call(`/admin/bookings/${BOOKING}/test-delete/preview`, {})).status).toBe(401)
    const token = await signAdminToken()
    const res = await call(`/admin/bookings/${BOOKING}/test-delete/preview`, {}, token)
    expect(res.status).toBe(200)
    expect(res.body.data.selectionHash).toBe(HASH)
    expect(calls.at(-1)).toEqual({ kind: 'preview', args: [BOOKING, { unknownIds: [] }] })
    expect((await call('/admin/bookings/not-a-uuid/test-delete/preview', {}, token)).status).toBe(400)
    expect((await call(`/admin/bookings/${BOOKING}/test-delete/preview`, { scope: 'x' }, token)).status).toBe(400)
  })

  test('the delete is signed with the session and needs the fingerprint and the phrase', async () => {
    const token = await signAdminToken()
    expect(
      (await call(`/admin/bookings/${BOOKING}/test-delete`, { confirmText: 'DELETE 1 BOOKING' }, token)).status
    ).toBe(400)
    const wrong = await call(
      `/admin/bookings/${BOOKING}/test-delete`,
      { selectionHash: HASH, confirmText: 'delete 1 booking' },
      token
    )
    expect(wrong.body.code).toBe('CONFIRM_PHRASE_MISMATCH')
    const done = await call(
      `/admin/bookings/${BOOKING}/test-delete`,
      { selectionHash: HASH, confirmText: 'DELETE 1 BOOKING', actorName: 'Typed Name' },
      token
    )
    expect(done.status).toBe(200)
    // The shared env login signs as admin, whatever was typed.
    expect(done.body.data.by).toBe('admin')
    expect((await call(`/admin/bookings/${BOOKING}/test-delete`, { selectionHash: HASH, confirmText: 'x' })).status).toBe(401)
  })
})
