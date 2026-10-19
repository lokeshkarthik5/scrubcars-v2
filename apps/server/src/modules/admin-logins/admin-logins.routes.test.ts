/**
 * Personal admin logins (0058), through the real routes and the real auth
 * middleware. Only admin_logins' reads and writes are stood in for (each
 * replaced for these tests and put back afterwards), so nothing here touches
 * a database; the passwords are really hashed and checked.
 *
 * The rules: the env login still signs in and signs as 'admin'; a personal
 * login signs in with its own password and signs every write with its name,
 * whatever name the body carries; turning it off or resetting its password
 * ends its sessions at once; only the owner adds logins, resets passwords and
 * turns logins on or off (the shared login makes the first one, the owner,
 * while there is none); everyone changes their own password.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { z } from 'zod'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { env } = await import('../../lib/env.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { hashPassword } = await import('../../lib/passwords.js')
const { personalAdminSubject, signedActorName } = await import('../../lib/admin-actor.js')
const { adminSignedJson, authMiddleware, requireSuperAdmin, signedInAdmin } = await import(
  '../../middleware/auth.middleware.js'
)
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsRepository } = await import('./admin-logins.repository.js')

const RAGA = 'e2e00000-0000-4000-8000-000000004101'
const OWNER = 'e2e00000-0000-4000-8000-000000004102'
const PASSWORD = 'raga-password-1'

type Row = {
  id: string
  username: string
  name: string
  passwordHash: string
  status: 'active' | 'off'
  isOwner: boolean
  sessionsFrom: Date
  lastLoginAt: Date | null
  createdByName: string
  createdAt: Date
  updatedAt: Date
}
const rows = new Map<string, Row>()
const audits: Array<{ action: string; actorSub: string; actorName: string }> = []

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const LONG_AGO = new Date('2026-01-01T00:00:00Z')

/** Raga and the owner (Mathew); `withOwner: false` is a team with no owner yet. */
async function seed({ withOwner = true } = {}) {
  rows.clear()
  audits.length = 0
  for (const [id, username, name] of [
    [RAGA, 'raga', 'Raga'],
    [OWNER, 'owner', 'Mathew'],
  ] as const) {
    rows.set(id, {
      id,
      username,
      name,
      passwordHash: await hashPassword(PASSWORD),
      status: 'active',
      isOwner: withOwner && id === OWNER,
      sessionsFrom: LONG_AGO,
      lastLoginAt: null,
      createdByName: 'admin',
      createdAt: LONG_AGO,
      updatedAt: LONG_AGO,
    })
  }
}

const publicRow = ({ passwordHash: _hash, sessionsFrom: _from, updatedAt: _updated, ...row }: Row) => row

beforeAll(() => {
  const repo = adminLoginsRepository
  patch(repo, 'findByUsername', async (username: string) => [...rows.values()].find((r) => r.username === username))
  patch(repo, 'findSession', async (id: string) => rows.get(id))
  patch(repo, 'findById', async (id: string) => rows.get(id))
  patch(repo, 'list', async () => [...rows.values()].map(publicRow))
  patch(repo, 'ownerExists', async () => [...rows.values()].some((r) => r.isOwner))
  patch(repo, 'recordLogin', async (id: string, at: Date) => {
    rows.get(id)!.lastLoginAt = at
  })
  patch(repo, 'create', async (input: { username: string; name: string; passwordHash: string; isOwner: boolean }, actor: { actorSub: string; actorName: string }) => {
    // The unique indexes: the username, the name in any case, one owner.
    const all = [...rows.values()]
    if (all.some((r) => r.username === input.username || r.name.toLowerCase() === input.name.toLowerCase() || (input.isOwner && r.isOwner))) return undefined
    const row: Row = { id: `e2e00000-0000-4000-8000-0000000041${40 + rows.size}`, ...input, status: 'active', sessionsFrom: new Date(), lastLoginAt: null, createdByName: actor.actorName, createdAt: new Date(), updatedAt: new Date() }
    rows.set(row.id, row)
    audits.push({ action: 'admin_login_created', ...actor })
    return publicRow(row)
  })
  patch(repo, 'setPassword', async (id: string, passwordHash: string, actor: { actorSub: string; actorName: string }, action: string, now: Date) => {
    const row = rows.get(id)
    if (!row) return undefined
    Object.assign(row, { passwordHash, sessionsFrom: now })
    audits.push({ action, ...actor })
    return publicRow(row)
  })
  patch(repo, 'setStatus', async (id: string, status: 'active' | 'off', actor: { actorSub: string; actorName: string }, now: Date) => {
    const row = rows.get(id)
    if (!row) return undefined
    row.status = status
    if (status === 'off') row.sessionsFrom = now
    audits.push({ action: status === 'off' ? 'admin_login_turned_off' : 'admin_login_turned_on', ...actor })
    return publicRow(row)
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
// A signed write, as every admin write with a typed name used to be.
const signed = new Hono()
signed.post('/', authMiddleware, requireSuperAdmin, adminSignedJson(z.object({ actorName: signedActorName, note: z.string() }).strict()), (c) =>
  c.json({ data: c.req.valid('json'), sub: signedInAdmin(c).sub })
)
app.route('/admin/test-signed', signed)

type Body = { success?: boolean; code?: string; data?: Record<string, unknown> & { logins?: Array<Record<string, unknown>> }; sub?: string }

// Sign-in is rate limited per IP: each request comes from its own address.
let requests = 0

async function call(method: string, path: string, token: string | null, body?: unknown) {
  requests += 1
  const res = await app.request(path, {
    method,
    headers: {
      'X-Forwarded-For': `10.41.${Math.floor(requests / 250)}.${requests % 250}`,
      ...(token ? { Cookie: `access_token=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: (await res.json()) as Body, cookie: res.headers.get('set-cookie') }
}

/** Signs in and returns the session token from the cookie. */
async function signIn(username: string, password: string) {
  const res = await call('POST', '/admin/login', null, { username, password })
  const token = res.cookie?.match(/access_token=([^;]+)/)?.[1] ?? null
  return { ...res, token }
}

describe('signing in', () => {
  test('the env login still works and signs as admin', async () => {
    await seed()
    const { status, token } = await signIn(env.adminUsername, env.adminPassword)
    expect(status).toBe(200)
    expect((await call('GET', '/admin/me', token)).body.data).toEqual({ isSuperAdmin: true, kind: 'shared', name: 'admin', username: null, isOwner: false })
    const write = await call('POST', '/admin/test-signed', token, { actorName: 'Someone Else', note: 'x' })
    expect(write.body).toEqual({ data: { actorName: 'admin', note: 'x' }, sub: 'admin' })
  })

  test('a personal login signs in with its own password, any case of its username, and signs every write with its name', async () => {
    await seed()
    const { status, token } = await signIn(' Raga ', PASSWORD)
    expect(status).toBe(200)
    expect(rows.get(RAGA)!.lastLoginAt).not.toBeNull()
    expect((await call('GET', '/admin/me', token)).body.data).toEqual({ isSuperAdmin: true, kind: 'personal', name: 'Raga', username: 'raga', isOwner: false })
    const typed = await call('POST', '/admin/test-signed', token, { actorName: 'Mathew', note: 'x' })
    expect(typed.body).toEqual({ data: { actorName: 'Raga', note: 'x' }, sub: personalAdminSubject(RAGA) })
    const untyped = await call('POST', '/admin/test-signed', token, { note: 'y' })
    expect(untyped.body.data).toEqual({ actorName: 'Raga', note: 'y' })
  })

  test('one refusal for a wrong password, an unknown username and a login that is off', async () => {
    await seed()
    rows.get(OWNER)!.status = 'off'
    for (const [username, password] of [['raga', 'wrong-password'], ['nobody', PASSWORD], ['owner', PASSWORD]]) {
      const res = await signIn(username!, password!)
      expect({ username, status: res.status, code: res.body.code, token: res.token }).toEqual({ username, status: 401, code: 'INVALID_CREDENTIALS', token: null })
    }
  })
})

describe('a personal session', () => {
  test('ends at once when the login is turned off, and stays ended when it is turned on again', async () => {
    await seed()
    const raga = (await signIn('raga', PASSWORD)).token
    const owner = (await signIn('owner', PASSWORD)).token
    expect((await call('GET', '/admin/me', raga)).status).toBe(200)

    const off = await call('POST', `/admin/logins/${RAGA}/status`, owner, { status: 'off' })
    expect(off.status).toBe(200)
    expect(off.body.data).toMatchObject({ status: 'off', username: 'raga' })
    expect(JSON.stringify(off.body)).not.toContain('scrypt')
    expect(await call('GET', '/admin/me', raga)).toMatchObject({ status: 401, body: { code: 'ADMIN_SESSION_ENDED' } })

    await call('POST', `/admin/logins/${RAGA}/status`, owner, { status: 'active' })
    expect((await call('GET', '/admin/me', raga)).status).toBe(401)
    expect(audits.map((a) => [a.action, a.actorName])).toEqual([
      ['admin_login_turned_off', 'Mathew'],
      ['admin_login_turned_on', 'Mathew'],
    ])
  })

  test('a token minted before a password reset is refused; one minted after works', async () => {
    await seed()
    const before = await signAdminToken(personalAdminSubject(RAGA))
    rows.get(RAGA)!.sessionsFrom = new Date(Date.now() + 1)
    expect((await call('GET', '/admin/me', before)).status).toBe(401)
    rows.get(RAGA)!.sessionsFrom = new Date(Date.now() - 2000)
    expect((await call('GET', '/admin/me', before)).status).toBe(200)
  })

  test('a token for a login that does not exist, or with no mint time, is refused', async () => {
    await seed()
    expect((await call('GET', '/admin/me', await signAdminToken(personalAdminSubject('e2e00000-0000-4000-8000-000000004148')))).status).toBe(401)
    expect((await call('GET', '/admin/me', await signAdminToken('admin:not-a-uuid'))).status).toBe(401)
  })
})

describe('Team logins: only the owner changes them', () => {
  test('the shared login makes the first login, which is the owner; after that it cannot add another', async () => {
    await seed({ withOwner: false })
    const shared = (await signIn(env.adminUsername, env.adminPassword)).token
    expect((await call('GET', '/admin/logins', shared)).body.data).toMatchObject({ ownerExists: false, canManage: true })
    const made = await call('POST', '/admin/logins', shared, { username: 'Priya', name: '  Priya  Ops ', password: 'priya-password' })
    expect(made.status).toBe(201)
    expect(made.body.data).toMatchObject({ username: 'priya', name: 'Priya Ops', status: 'active', isOwner: true, createdByName: 'admin' })
    expect(JSON.stringify(made.body)).not.toContain('priya-password')

    expect((await call('GET', '/admin/logins', shared)).body.data).toMatchObject({ ownerExists: true, canManage: false })
    const second = await call('POST', '/admin/logins', shared, { username: 'kavya', name: 'Kavya', password: 'kavya-password' })
    expect(second).toMatchObject({ status: 403, body: { code: 'ADMIN_OWNER_ONLY' } })

    const owner = (await signIn('priya', 'priya-password')).token
    expect((await call('GET', '/admin/me', owner)).body.data).toMatchObject({ kind: 'personal', isOwner: true })
  })

  test('the owner adds logins (never a second owner); the username and name are the rules’, and unique', async () => {
    await seed()
    const owner = (await signIn('owner', PASSWORD)).token
    expect((await call('GET', '/admin/logins', owner)).body.data).toMatchObject({ canManage: true, ownerExists: true })
    const made = await call('POST', '/admin/logins', owner, { username: 'kavya', name: 'Kavya', password: 'kavya-password' })
    expect(made.status).toBe(201)
    expect(made.body.data).toMatchObject({ username: 'kavya', isOwner: false, createdByName: 'Mathew' })
    expect((await signIn('kavya', 'kavya-password')).status).toBe(200)

    expect((await call('POST', '/admin/logins', owner, { username: 'raga', name: 'Raga 2', password: 'another-password' })).body.code).toBe('ADMIN_USERNAME_TAKEN')
    expect((await call('POST', '/admin/logins', owner, { username: 'raga2', name: 'RAGA', password: 'another-password' })).body.code).toBe('ADMIN_USERNAME_TAKEN')
    expect((await call('POST', '/admin/logins', owner, { username: env.adminUsername, name: 'Shadow', password: 'another-password' })).body.code).toBe('ADMIN_USERNAME_TAKEN')
    expect((await call('POST', '/admin/logins', owner, { username: 'ra ga', name: 'Ravi', password: 'another-password' })).status).toBe(400)
    expect((await call('POST', '/admin/logins', owner, { username: 'ravi', name: 'Ravi', password: 'short' })).status).toBe(400)
    expect((await call('POST', '/admin/logins', owner, { username: 'ravi', name: 'Ravi', password: 'long-enough-1', isOwner: true })).status).toBe(400)
  })

  test('anyone but the owner is refused (403) adding, resetting and turning logins on or off', async () => {
    await seed()
    const raga = (await signIn('raga', PASSWORD)).token
    const shared = (await signIn(env.adminUsername, env.adminPassword)).token
    for (const token of [raga, shared]) {
      expect((await call('GET', '/admin/logins', token)).body.data).toMatchObject({ canManage: false })
      for (const [path, body] of [
        ['/admin/logins', { username: 'kavya', name: 'Kavya', password: 'kavya-password' }],
        [`/admin/logins/${OWNER}/password`, { password: 'taken-over-1' }],
        [`/admin/logins/${OWNER}/status`, { status: 'off' }],
        [`/admin/logins/${RAGA}/status`, { status: 'off' }],
      ] as const) {
        const res = await call('POST', path, token, body)
        expect({ path, status: res.status, code: res.body.code }).toEqual({ path, status: 403, code: 'ADMIN_OWNER_ONLY' })
      }
    }
    expect(rows.get(OWNER)!.status).toBe('active')
    expect((await signIn('owner', PASSWORD)).status).toBe(200)
    expect(audits).toEqual([])
  })

  test('the list never carries a hash, says which row is you and who the owner is', async () => {
    await seed()
    const raga = (await signIn('raga', PASSWORD)).token
    const { body } = await call('GET', '/admin/logins', raga)
    expect(body.data!.youId).toBe(RAGA)
    expect(body.data!.logins!.map((l) => [l.username, l.isOwner])).toEqual([['raga', false], ['owner', true]])
    expect(JSON.stringify(body)).not.toContain('scrypt')
  })

  test('the owner never turns off or resets their own login here', async () => {
    await seed()
    const owner = (await signIn('owner', PASSWORD)).token
    expect((await call('POST', `/admin/logins/${OWNER}/status`, owner, { status: 'off' })).body.code).toBe('ADMIN_LOGIN_SELF')
    expect((await call('POST', `/admin/logins/${OWNER}/password`, owner, { password: 'new-password-1' })).body.code).toBe('ADMIN_LOGIN_SELF')
    expect((await call('POST', `/admin/logins/e2e00000-0000-4000-8000-000000004148/status`, owner, { status: 'off' })).status).toBe(404)
  })

  test('an owner’s reset signs the person out; the new password works', async () => {
    await seed()
    const owner = (await signIn('owner', PASSWORD)).token
    const raga = (await signIn('raga', PASSWORD)).token
    await new Promise((resolve) => setTimeout(resolve, 2))
    expect((await call('POST', `/admin/logins/${RAGA}/password`, owner, { password: 'fresh-password-1' })).status).toBe(200)
    expect((await call('GET', '/admin/me', raga)).status).toBe(401)
    expect((await signIn('raga', PASSWORD)).status).toBe(401)
    expect((await signIn('raga', 'fresh-password-1')).status).toBe(200)
    expect(audits.at(-1)).toMatchObject({ action: 'admin_login_password_reset', actorName: 'Mathew' })
  })

  test('everyone changes their own password with the current one, keeping this session; not the shared login', async () => {
    await seed()
    const raga = (await signIn('raga', PASSWORD)).token
    const wrong = await call('POST', '/admin/me/password', raga, { currentPassword: 'nope', newPassword: 'fresh-password-2' })
    expect(wrong).toMatchObject({ status: 400, body: { code: 'ADMIN_PASSWORD_WRONG' } })
    const changed = await call('POST', '/admin/me/password', raga, { currentPassword: PASSWORD, newPassword: 'fresh-password-2' })
    expect(changed.status).toBe(200)
    const fresh = changed.cookie?.match(/access_token=([^;]+)/)?.[1] ?? null
    expect((await call('GET', '/admin/me', fresh)).status).toBe(200)
    expect(audits.at(-1)).toMatchObject({ action: 'admin_password_changed', actorName: 'Raga' })

    const shared = (await signIn(env.adminUsername, env.adminPassword)).token
    expect((await call('POST', '/admin/me/password', shared, { currentPassword: 'x', newPassword: 'fresh-password-3' })).body.code).toBe('ADMIN_LOGIN_SHARED')
  })
})
