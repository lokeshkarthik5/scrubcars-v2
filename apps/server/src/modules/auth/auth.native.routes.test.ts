/**
 * Native sign-in through the real routes and middleware. Only the database is
 * stood in for (the auth and members repositories; put back afterwards).
 *
 * The rules: the /auth/native routes give tokens in the body and never touch a
 * cookie; the websites' routes give cookies and never a token, and read as they
 * always did; a Bearer token opens what the cookie opens, except admin and
 * support sessions, which stay on the web.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken, verifyAccessToken } = await import('../../lib/jwt.js')
const { generateRefreshToken, hashRefreshToken } = await import('../../lib/tokens.js')
const { authMiddleware, requireSuperAdmin } = await import('../../middleware/auth.middleware.js')
const { resolveTenant } = await import('../../middleware/tenant.middleware.js')
const { membersRepository } = await import('../members/members.repository.js')
const { authRepository } = await import('./auth.repository.js')
const { authRoutes } = await import('./auth.routes.js')
const { authService } = await import('./auth.service.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CUSTOMER = id(6101)
const BOTH = id(6102)
const GARAGE = id(6103)

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const person = (userId: string, isVendorOwner: boolean) => ({
  id: userId,
  name: 'Test Person',
  phone: '9000000001',
  email: null,
  isCustomer: true,
  isVendorOwner,
  isActive: true,
  phoneVerified: true,
  deletedAt: null,
})

/** The refresh tokens "stored": hash → the row, as the table would keep it. */
let tokens: Map<string, { id: string; userId: string; revoked: boolean }>

function storeToken(userId: string) {
  const raw = generateRefreshToken()
  tokens.set(hashRefreshToken(raw), { id: raw, userId, revoked: false })
  return raw
}

const app = new Hono()
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ success: false, code: err.code }, err.statusCode as 400)
  }
  throw err
})
app.route('/auth', authRoutes)
app.get('/admin-thing', authMiddleware, requireSuperAdmin, (c) => c.json({ success: true }))
app.get('/garage-thing', authMiddleware, resolveTenant, (c) => c.json({ success: true }))

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const SESSION = {
  accessToken: 'the-access-token',
  refreshToken: 'the-refresh-token',
  user: { id: CUSTOMER },
  vendor: null,
  vendors: [],
}
const OTP = { phone: '9000000001', otp: '123456', purpose: 'login', audience: 'customer' }

beforeAll(() => {
  patch(authRepository, 'findActiveRefreshToken', async (hash: string) => {
    const row = tokens.get(hash)
    return row && !row.revoked ? row : undefined
  })
  patch(authRepository, 'revokeRefreshToken', async (rowId: string) => {
    for (const row of tokens.values()) if (row.id === rowId) row.revoked = true
    return []
  })
  patch(authRepository, 'revokeRefreshTokenByHash', async (hash: string) => {
    const row = tokens.get(hash)
    if (row) row.revoked = true
    return []
  })
  patch(authRepository, 'createRefreshToken', async (data: { userId: string; tokenHash: string }) => {
    tokens.set(data.tokenHash, { id: data.tokenHash, userId: data.userId, revoked: false })
    return []
  })
  patch(authRepository, 'findUserById', async (userId: string) => person(userId, userId === BOTH))
  patch(membersRepository, 'hasActiveVendorSeat', async (userId: string) => userId === BOTH)
  patch(membersRepository, 'listActiveVendorSeats', async () => [])
  patch(membersRepository, 'findActiveVendorSeat', async () => undefined)
  patch(membersRepository, 'findActivePlatformRow', async () => ({ role: 'super_admin' }))
  patch(membersRepository, 'findUserById', async () => person(CUSTOMER, false))
})

afterAll(() => {
  for (const [target, key, value] of originals.reverse()) target[key] = value
})

beforeEach(() => {
  tokens = new Map()
})

describe('POST /auth/native/otp/verify', () => {
  test('tokens in the body, no cookies', async () => {
    patch(authService, 'verifyOtp', async () => SESSION)
    const res = await post('/auth/native/otp/verify', OTP)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    const { data } = await res.json()
    expect(data.accessToken).toBe('the-access-token')
    expect(data.refreshToken).toBe('the-refresh-token')
    expect(data.user.id).toBe(CUSTOMER)
  })

  test('the same OTP rule: a refused code gives no tokens', async () => {
    patch(authService, 'verifyOtp', async () => {
      throw new AppError(400, 'Invalid or expired OTP', 'INVALID_OTP')
    })
    const res = await post('/auth/native/otp/verify', OTP)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, code: 'INVALID_OTP' })
  })

  test('the same validation as the website', async () => {
    patch(authService, 'verifyOtp', async () => SESSION)
    expect((await post('/auth/native/otp/verify', { ...OTP, otp: '12' })).status).toBe(400)
    expect((await post('/auth/native/otp/verify', { ...OTP, phone: '123' })).status).toBe(400)
    expect((await post('/auth/native/otp/verify', { ...OTP, purpose: 'vendor_onboard' })).status).toBe(400)
  })
})

describe('POST /auth/otp/verify, the website', () => {
  test('cookies, and no token anywhere in the body', async () => {
    patch(authService, 'verifyOtp', async () => SESSION)
    const res = await post('/auth/otp/verify', OTP)
    expect(res.status).toBe(200)
    const cookies = res.headers.getSetCookie().join('\n')
    expect(cookies).toContain('access_token=the-access-token')
    expect(cookies).toContain('refresh_token=the-refresh-token')
    expect(cookies).toContain('HttpOnly')
    const text = await res.text()
    expect(text).not.toContain('the-access-token')
    expect(text).not.toContain('the-refresh-token')
  })
})

describe('POST /auth/native/refresh', () => {
  const bodyOf = async (res: Response) => (await res.json()).data

  test('a new pair in the body, the old token dead, no cookies', async () => {
    const raw = storeToken(CUSTOMER)
    const res = await post('/auth/native/refresh', { refreshToken: raw, audience: 'customer' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    const data = await bodyOf(res)
    expect(data.refreshToken).not.toBe(raw)
    expect((await verifyAccessToken(data.accessToken)).sub).toBe(CUSTOMER)

    const again = await post('/auth/native/refresh', { refreshToken: raw, audience: 'customer' })
    expect(again.status).toBe(401)
  })

  test('the customer app keeps a customer session for someone who also owns a garage', async () => {
    const res = await post('/auth/native/refresh', { refreshToken: storeToken(BOTH), audience: 'customer' })
    expect((await verifyAccessToken((await bodyOf(res)).accessToken)).aud).toBe('customer')
  })

  test('the garage app gets a garage session', async () => {
    const res = await post('/auth/native/refresh', { refreshToken: storeToken(BOTH), audience: 'vendor' })
    expect((await verifyAccessToken((await bodyOf(res)).accessToken)).aud).toBe('vendor')
  })

  test('the garage app with no garage falls back to customer, as the website does', async () => {
    const res = await post('/auth/native/refresh', { refreshToken: storeToken(CUSTOMER), audience: 'vendor' })
    expect((await verifyAccessToken((await bodyOf(res)).accessToken)).aud).toBe('customer')
  })

  test('never reads the cookie: a script on a website cannot swap one for a token', async () => {
    const raw = storeToken(CUSTOMER)
    const res = await post('/auth/native/refresh', { audience: 'customer' }, { Cookie: `refresh_token=${raw}` })
    expect(res.status).toBe(400)
    expect(tokens.get(hashRefreshToken(raw))?.revoked).toBe(false)
  })

  test('an unknown token is refused', async () => {
    const res = await post('/auth/native/refresh', { refreshToken: 'a'.repeat(64), audience: 'customer' })
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/refresh, the website', () => {
  test('still reads only the cookie and answers with cookies, keeping its audience rule', async () => {
    const raw = storeToken(BOTH)
    const res = await app.request('/auth/refresh', { method: 'POST', headers: { Cookie: `refresh_token=${raw}` } })
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().join('\n')).toContain('access_token=')
    const { data } = await res.json()
    expect(data.accessToken).toBeUndefined()
    expect(data.refreshToken).toBeUndefined()
    const access = /access_token=([^;]+)/.exec(res.headers.getSetCookie().join('\n'))?.[1] ?? ''
    expect((await verifyAccessToken(access)).aud).toBe('vendor')
  })

  test('a token in the body is ignored', async () => {
    const res = await post('/auth/refresh', { refreshToken: storeToken(CUSTOMER) })
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/native/logout', () => {
  test('ends that session and touches no cookie', async () => {
    const raw = storeToken(CUSTOMER)
    const res = await post('/auth/native/logout', { refreshToken: raw })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(tokens.get(hashRefreshToken(raw))?.revoked).toBe(true)
  })

  test('refuses a body with no token', async () => {
    expect((await post('/auth/native/logout', {})).status).toBe(400)
  })
})

describe('reading the access token', () => {
  const customerToken = () =>
    signAccessToken({ sub: CUSTOMER, aud: 'customer', isCustomer: true, isVendorOwner: false })
  const me = (headers: Record<string, string>) => app.request('/auth/me', { headers })

  beforeAll(() => {
    patch(authService, 'getMe', async (userId: string) => ({ id: userId }))
  })

  test('Bearer opens what the cookie opens', async () => {
    const token = await customerToken()
    expect((await me({ Authorization: `Bearer ${token}` })).status).toBe(200)
    expect((await me({ Cookie: `access_token=${token}` })).status).toBe(200)
  })

  test('no token, a forged one or another scheme is a 401', async () => {
    const token = await customerToken()
    expect((await me({})).status).toBe(401)
    expect((await me({ Authorization: 'Bearer not-a-token' })).status).toBe(401)
    expect((await me({ Authorization: `Basic ${token}` })).status).toBe(401)
    expect((await me({ Authorization: `Bearer ${token.slice(0, -2)}xx` })).status).toBe(401)
  })

  test('the cookie is read first, so a browser session cannot change', async () => {
    const token = await customerToken()
    const res = await me({ Cookie: `access_token=${token}`, Authorization: 'Bearer not-a-token' })
    expect(res.status).toBe(200)
  })
})

describe('admin stays on the web', () => {
  test('an admin token opens admin by cookie, never by Bearer', async () => {
    const token = await signAdminToken()
    const cookie = await app.request('/admin-thing', { headers: { Cookie: `access_token=${token}` } })
    expect(cookie.status).toBe(200)
    const bearer = await app.request('/admin-thing', { headers: { Authorization: `Bearer ${token}` } })
    expect(bearer.status).toBe(403)
  })

  test('a platform admin on a native app gets no admin', async () => {
    const token = await signAccessToken({ sub: CUSTOMER, aud: 'customer', isCustomer: true, isVendorOwner: false })
    const bearer = await app.request('/admin-thing', { headers: { Authorization: `Bearer ${token}` } })
    expect(bearer.status).toBe(403)
    const cookie = await app.request('/admin-thing', { headers: { Cookie: `access_token=${token}` } })
    expect(cookie.status).toBe(200)
  })

  test('no support session into a garage they have no seat in', async () => {
    const token = await signAccessToken({ sub: CUSTOMER, aud: 'vendor', isCustomer: true, isVendorOwner: false })
    const res = await app.request('/garage-thing', {
      headers: { Authorization: `Bearer ${token}`, 'X-Vendor-Id': GARAGE },
    })
    expect(res.status).toBe(404)
  })
})
