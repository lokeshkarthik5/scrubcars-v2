/**
 * Phones (push_devices, 0067): who may register one, through the real routes
 * and the real auth and tenant middleware. Only the database is stood in for
 * (the seat lookups and the push repository, put back afterwards).
 *
 * The rules mirror the browsers': a customer acts only on their own devices
 * (the session's id; no parameter names anyone else). A garage seat, owner or
 * operator, registers only for the garage resolveTenant gives it, never
 * another by header; a Detlio support session cannot attach a phone. Without
 * the Expo access token every device route is a 404 before auth. A token that
 * is not an Expo push token is a 400.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { pushRepository } = await import('./push.repository.js')
const { customerPushRoutes, garagePushRoutes } = await import('./push.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000006710'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000006711'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000006701',
  operator: 'e2e00000-0000-4000-8000-000000006702',
  customer: 'e2e00000-0000-4000-8000-000000006703',
  otherOwner: 'e2e00000-0000-4000-8000-000000006704',
  superAdmin: 'e2e00000-0000-4000-8000-000000006705',
  otherCustomer: 'e2e00000-0000-4000-8000-000000006706',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

const TOKEN = 'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]'
const TOKEN_2 = 'ExponentPushToken[ZyXwVuTsRqPoNmLkJiHgFe]'
const DEVICE = { token: TOKEN, platform: 'ios' }

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['expoPushAccessToken', 'vapidPublicKey', 'pushFake'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))
function devicesOn(on: boolean) {
  envValues.expoPushAccessToken = on ? 'test-access-token' : undefined
}

type Scope = { userId: string; audience: string; vendorId: string | null }
/** The devices "stored", by token, as the repository would keep them. */
const stored = new Map<string, Scope & { token: string; platform: string }>()
const sameScope = (row: Scope, scope: Scope) =>
  row.userId === scope.userId && row.audience === scope.audience && row.vendorId === scope.vendorId
let pruned: Array<{ scope: Scope; keep: number }> = []

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) =>
    SEATS.filter((seat) => seat.userId === userId)
  )
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((seat) => seat.vendorId === vendorId && seat.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  patch(membersRepository, 'findVendorForSupport', async (vendorId: string) =>
    [GARAGE, OTHER_GARAGE].includes(vendorId) ? { id: vendorId } : undefined
  )
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(pushRepository, 'upsertDevice', async (input: Scope & { token: string; platform: string }) => {
    stored.set(input.token, {
      token: input.token,
      platform: input.platform,
      userId: input.userId,
      audience: input.audience,
      vendorId: input.vendorId,
    })
    return { id: 'device' }
  })
  patch(pushRepository, 'pruneDevices', async (scope: Scope, keep: number) => {
    pruned.push({ scope, keep })
    return 0
  })
  patch(pushRepository, 'countDevices', async (scope: Scope) =>
    [...stored.values()].filter((row) => sameScope(row, scope)).length
  )
  patch(pushRepository, 'deleteOwnDevice', async (scope: Scope, token: string) => {
    const row = stored.get(token)
    if (!row || !sameScope(row, scope)) return false
    stored.delete(token)
    return true
  })
  patch(pushRepository, 'getPreferences', async () => ({ pushBookingUpdates: true, pushReminders: false }))
  patch(pushRepository, 'setPreferences', async (_userId: string, set: Record<string, boolean>) => ({
    pushBookingUpdates: set.pushBookingUpdates ?? true,
    pushReminders: set.pushReminders ?? true,
  }))
})

beforeEach(() => {
  stored.clear()
  pruned = []
  devicesOn(true)
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

// ─── The app, wired the way users.routes.ts and vendors.routes.ts wire it ────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me/push', customerPushRoutes)
app.route('/users', users)
app.route('/vendors/me/push', garagePushRoutes)

type Who = keyof typeof PEOPLE | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const customer = who === 'customer' || who === 'otherCustomer'
  const token = await signAccessToken({
    sub: PEOPLE[who],
    aud: customer ? 'customer' : 'vendor',
    isCustomer: customer,
    isVendorOwner: !customer,
  })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Who, body?: unknown, headers: Record<string, string> = {}) {
  const response = await app.request(path, {
    method,
    headers: { ...(await cookieFor(who)), 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; message?: string; data?: Record<string, unknown> }
  return { status: response.status, body: json }
}

describe('while the Expo access token is unset', () => {
  test('every device route is a 404, and the garage ones before auth too; nothing is stored', async () => {
    devicesOn(false)
    for (const method of ['POST', 'DELETE']) {
      // The customer routes sit behind users.routes.ts's own sign-in check.
      const customer = await call(method, '/users/me/push/devices', 'customer', DEVICE)
      expect(customer.status).toBe(404)
      expect(customer.body.code).toBe('NOT_FOUND')
      for (const who of [null, 'owner'] as const) {
        const { status, body } = await call(method, '/vendors/me/push/devices', who, DEVICE)
        expect(status).toBe(404)
        expect(body.code).toBe('NOT_FOUND')
      }
    }
    expect(stored.size).toBe(0)
  })

  test('the customer’s switches stay a 404 while neither kind is on, and work for phones alone', async () => {
    devicesOn(false)
    envValues.vapidPublicKey = undefined
    envValues.pushFake = false
    expect((await call('PATCH', '/users/me/push/preferences', 'customer', { reminders: true })).status).toBe(404)

    devicesOn(true)
    const { status, body } = await call('PATCH', '/users/me/push/preferences', 'customer', { reminders: false })
    expect(status).toBe(200)
    expect(body.data).toEqual({ bookingUpdates: true, reminders: false })
  })
})

describe('customers: only their own phones', () => {
  test('a phone is stored for the session’s customer, and the switches come back', async () => {
    const { status, body } = await call('POST', '/users/me/push/devices', 'customer', DEVICE)
    expect(status).toBe(200)
    expect(body.data).toEqual({ registered: true, devices: 1, bookingUpdates: true, reminders: false })
    expect(stored.get(TOKEN)).toEqual({
      token: TOKEN,
      platform: 'ios',
      userId: PEOPLE.customer,
      audience: 'customer',
      vendorId: null,
    })
    expect(pruned).toEqual([{ scope: { userId: PEOPLE.customer, audience: 'customer', vendorId: null }, keep: 10 }])
  })

  test('naming anyone else, a garage, or anything extra is refused', async () => {
    for (const extra of [{ userId: PEOPLE.otherCustomer }, { vendorId: GARAGE }, { audience: 'garage' }, { label: 'x' }]) {
      expect((await call('POST', '/users/me/push/devices', 'customer', { ...DEVICE, ...extra })).status).toBe(400)
    }
    expect(stored.size).toBe(0)
  })

  test('a token that is not an Expo push token is refused, in every shape', async () => {
    for (const token of [
      '',
      'not-a-token',
      'ExponentPushToken[short]',
      'https://169.254.169.254/latest/meta-data',
      'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]; DROP TABLE users',
      `ExponentPushToken[${'a'.repeat(300)}]`,
      12345,
      null,
    ]) {
      const { status } = await call('POST', '/users/me/push/devices', 'customer', { token, platform: 'ios' })
      expect(status).toBe(400)
    }
    expect(stored.size).toBe(0)
  })

  test('the platform is ios or android, and required', async () => {
    for (const platform of ['web', 'IOS', '', undefined, 3]) {
      expect((await call('POST', '/users/me/push/devices', 'customer', { token: TOKEN, platform })).status).toBe(400)
    }
    expect((await call('POST', '/users/me/push/devices', 'customer', { token: TOKEN })).status).toBe(400)
    expect((await call('POST', '/users/me/push/devices', 'customer', { token: TOKEN, platform: 'android' })).status).toBe(200)
  })

  test('registering again is not an error and does not add a second row', async () => {
    await call('POST', '/users/me/push/devices', 'customer', DEVICE)
    const again = await call('POST', '/users/me/push/devices', 'customer', DEVICE)
    expect(again.status).toBe(200)
    expect(again.body.data?.devices).toBe(1)
    const second = await call('POST', '/users/me/push/devices', 'customer', { token: TOKEN_2, platform: 'android' })
    expect(second.body.data?.devices).toBe(2)
  })

  test('another customer cannot remove this phone', async () => {
    await call('POST', '/users/me/push/devices', 'customer', DEVICE)
    const attempt = await call('DELETE', '/users/me/push/devices', 'otherCustomer', { token: TOKEN })
    expect(attempt.status).toBe(200)
    expect(attempt.body.data).toEqual({ registered: false, devices: 0 })
    expect(stored.has(TOKEN)).toBe(true)
  })

  test('the owner of the phone removes it, and removing it again is fine', async () => {
    await call('POST', '/users/me/push/devices', 'customer', DEVICE)
    const first = await call('DELETE', '/users/me/push/devices', 'customer', { token: TOKEN })
    expect(first.status).toBe(200)
    expect(first.body.data).toEqual({ registered: false, devices: 0 })
    expect(stored.has(TOKEN)).toBe(false)
    expect((await call('DELETE', '/users/me/push/devices', 'customer', { token: TOKEN })).status).toBe(200)
  })

  test('removing takes a valid token and nothing else', async () => {
    expect((await call('DELETE', '/users/me/push/devices', 'customer', { token: 'nope' })).status).toBe(400)
    expect((await call('DELETE', '/users/me/push/devices', 'customer', { token: TOKEN, platform: 'ios' })).status).toBe(400)
    expect((await call('DELETE', '/users/me/push/devices', 'customer', {})).status).toBe(400)
  })

  test('a garage seat’s session is not a customer here, and nobody signed in gets a 401', async () => {
    expect((await call('POST', '/users/me/push/devices', 'owner', DEVICE)).status).toBe(403)
    expect((await call('POST', '/users/me/push/devices', null, DEVICE)).status).toBe(401)
    expect((await call('DELETE', '/users/me/push/devices', null, DEVICE)).status).toBe(401)
    expect(stored.size).toBe(0)
  })
})

describe('garage seats: only for their own garage', () => {
  test('the owner and an operator both register, for the garage resolveTenant gives them', async () => {
    const owner = await call('POST', '/vendors/me/push/devices', 'owner', DEVICE)
    expect(owner.status).toBe(200)
    expect(owner.body.data).toEqual({ registered: true, devices: 1 })
    expect(stored.get(TOKEN)).toMatchObject({ userId: PEOPLE.owner, audience: 'garage', vendorId: GARAGE })

    expect((await call('POST', '/vendors/me/push/devices', 'operator', { token: TOKEN_2, platform: 'android' })).status).toBe(200)
    expect(stored.get(TOKEN_2)).toMatchObject({ userId: PEOPLE.operator, audience: 'garage', vendorId: GARAGE })
  })

  test('another garage’s owner cannot register for this garage by header', async () => {
    const { status, body } = await call('POST', '/vendors/me/push/devices', 'otherOwner', DEVICE, { 'X-Vendor-Id': GARAGE })
    expect(status).toBe(404)
    expect(body.code).toBe('VENDOR_NOT_FOUND')
    expect(stored.size).toBe(0)

    await call('POST', '/vendors/me/push/devices', 'otherOwner', DEVICE)
    expect(stored.get(TOKEN)?.vendorId).toBe(OTHER_GARAGE)
  })

  test('a vendorId in the body is refused, never read', async () => {
    expect((await call('POST', '/vendors/me/push/devices', 'owner', { ...DEVICE, vendorId: OTHER_GARAGE })).status).toBe(400)
  })

  test('a customer has no seat (404); a Detlio support session cannot attach a phone (403)', async () => {
    expect((await call('POST', '/vendors/me/push/devices', 'customer', DEVICE)).status).toBe(404)
    const support = await call('POST', '/vendors/me/push/devices', 'superAdmin', DEVICE, { 'X-Vendor-Id': GARAGE })
    expect(support.status).toBe(403)
    expect(support.body.code).toBe('PUSH_SUPPORT_SESSION')
    expect(stored.size).toBe(0)
  })

  test('removal is scoped to the seat’s own garage', async () => {
    await call('POST', '/vendors/me/push/devices', 'owner', DEVICE)
    // The other garage's owner, and the customer-side scope, find nothing to remove.
    await call('DELETE', '/vendors/me/push/devices', 'otherOwner', { token: TOKEN })
    expect(stored.has(TOKEN)).toBe(true)
    await call('DELETE', '/users/me/push/devices', 'customer', { token: TOKEN })
    expect(stored.has(TOKEN)).toBe(true)

    const own = await call('DELETE', '/vendors/me/push/devices', 'owner', { token: TOKEN })
    expect(own.body.data).toEqual({ registered: false, devices: 0 })
    expect(stored.has(TOKEN)).toBe(false)
  })
})
