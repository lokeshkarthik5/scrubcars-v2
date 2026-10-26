/**
 * Who may turn notifications on for what, through the real routes and the
 * real auth and tenant middleware. Only the database is stood in for (the
 * seat lookups and the push repository, put back afterwards), and sends go
 * to PUSH_FAKE's outbox.
 *
 * The rules: a customer acts only on their own subscriptions (the session's
 * id; there is no parameter to name anyone else). A garage seat, owner or
 * operator, subscribes only for the garage resolveTenant gives it, never
 * another by header; a Detlio support session cannot attach a device. While
 * VAPID is unset every route but /config is a 404. Admin → Alerts is
 * super-admin only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { fakePushOutbox } = await import('../../lib/web-push.js')
const { membersRepository } = await import('../members/members.repository.js')
const { pushRepository } = await import('./push.repository.js')
const { customerPushRoutes, garagePushRoutes } = await import('./push.routes.js')
const { adminAlertRoutes } = await import('../alerts/alerts.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000002410'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000002411'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000002401',
  operator: 'e2e00000-0000-4000-8000-000000002402',
  customer: 'e2e00000-0000-4000-8000-000000002403',
  otherOwner: 'e2e00000-0000-4000-8000-000000002404',
  superAdmin: 'e2e00000-0000-4000-8000-000000002405',
  otherCustomer: 'e2e00000-0000-4000-8000-000000002406',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

const P256DH = 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4'
const AUTH = 'k3vHqKPmQc5a2VRZ4bS7Cg'
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-2400-device'
const SUBSCRIPTION = { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } }

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['vapidPublicKey', 'pushFake', 'telegramBotToken', 'telegramOpsChatId', 'vercelEnv'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))
function pushOn(on: boolean) {
  envValues.vapidPublicKey = on ? P256DH : undefined
  envValues.pushFake = on
}

type Scope = { userId: string; audience: string; vendorId: string | null }
/** The subscriptions "stored", by endpoint, as the repository would keep them. */
const stored = new Map<string, Scope & { endpoint: string }>()
const sameScope = (row: Scope, scope: Scope) =>
  row.userId === scope.userId && row.audience === scope.audience && row.vendorId === scope.vendorId

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
  // requireSuperAdmin signs every admin write with the session's name (0058).
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  patch(membersRepository, 'findVendorForSupport', async (vendorId: string) =>
    [GARAGE, OTHER_GARAGE].includes(vendorId) ? { id: vendorId } : undefined
  )
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(pushRepository, 'upsertSubscription', async (input: Scope & { endpoint: string }) => {
    stored.set(input.endpoint, { endpoint: input.endpoint, userId: input.userId, audience: input.audience, vendorId: input.vendorId })
    return { id: 'sub' }
  })
  patch(pushRepository, 'pruneSubscriptions', async () => 0)
  patch(pushRepository, 'countSubscriptions', async (scope: Scope) =>
    [...stored.values()].filter((row) => sameScope(row, scope)).length
  )
  patch(pushRepository, 'findOwnSubscription', async (scope: Scope, endpoint: string) => {
    const row = stored.get(endpoint)
    return row && sameScope(row, scope) ? { id: 'sub', endpoint, p256dh: P256DH, auth: AUTH } : undefined
  })
  patch(pushRepository, 'deleteOwnSubscription', async (scope: Scope, endpoint: string) => {
    const row = stored.get(endpoint)
    if (!row || !sameScope(row, scope)) return false
    stored.delete(endpoint)
    return true
  })
  patch(pushRepository, 'getPreferences', async () => ({ pushBookingUpdates: true, pushReminders: false }))
  patch(pushRepository, 'setPreferences', async (_userId: string, set: Record<string, boolean>) => ({
    pushBookingUpdates: set.pushBookingUpdates ?? true,
    pushReminders: set.pushReminders ?? true,
  }))
  patch(pushRepository, 'markSent', async () => undefined)
  patch(pushRepository, 'markFailed', async () => 1)
  patch(pushRepository, 'deleteSubscription', async () => undefined)
})

beforeEach(() => {
  stored.clear()
  fakePushOutbox.length = 0
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

// ─── The app, wired the way users.routes.ts, vendors.routes.ts and admin.routes.ts wire it ──

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
app.route('/admin/alerts', adminAlertRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const customer = who === 'customer' || who === 'otherCustomer'
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({
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

describe('while VAPID is unset', () => {
  test('every push route but /config is a 404, and /config says off', async () => {
    pushOn(false)
    for (const path of ['/users/me/push/subscriptions', '/users/me/push/test', '/users/me/push/status']) {
      const { status, body } = await call('POST', path, 'customer', SUBSCRIPTION)
      expect(status).toBe(404)
      expect(body.code).toBe('NOT_FOUND')
    }
    for (const who of [null, 'owner'] as const) {
      const { status, body } = await call('POST', '/vendors/me/push/subscriptions', who, SUBSCRIPTION)
      expect(status).toBe(404)
      expect(body.code).toBe('NOT_FOUND')
    }
    expect((await call('GET', '/users/me/push/config', 'customer')).body.data).toEqual({ enabled: false, publicKey: null })
    expect((await call('GET', '/vendors/me/push/config', 'operator')).body.data).toEqual({ enabled: false, publicKey: null })
    expect(stored.size).toBe(0)
  })
})

describe('customers: only their own subscriptions', () => {
  beforeAll(() => pushOn(true))

  test('config gives the public key and the two switches', async () => {
    const { body } = await call('GET', '/users/me/push/config', 'customer')
    expect(body.data).toEqual({ enabled: true, publicKey: P256DH, bookingUpdates: true, reminders: false })
  })

  test('a subscription is stored for the session’s customer; naming anyone else is refused', async () => {
    expect((await call('POST', '/users/me/push/subscriptions', 'customer', SUBSCRIPTION)).status).toBe(200)
    expect(stored.get(ENDPOINT)).toEqual({ endpoint: ENDPOINT, userId: PEOPLE.customer, audience: 'customer', vendorId: null })

    const sneaky = await call('POST', '/users/me/push/subscriptions', 'customer', { ...SUBSCRIPTION, userId: PEOPLE.otherCustomer })
    expect(sneaky.status).toBe(400)
  })

  test('an endpoint that is not a browser push service is refused', async () => {
    const { status } = await call('POST', '/users/me/push/subscriptions', 'customer', {
      ...SUBSCRIPTION,
      endpoint: 'https://169.254.169.254/latest/meta-data',
    })
    expect(status).toBe(400)
    expect(stored.size).toBe(0)
  })

  test('another customer can neither test, read nor remove this device', async () => {
    await call('POST', '/users/me/push/subscriptions', 'customer', SUBSCRIPTION)
    const test = await call('POST', '/users/me/push/test', 'otherCustomer', { endpoint: ENDPOINT })
    expect(test.status).toBe(404)
    expect(test.body.code).toBe('PUSH_NOT_SUBSCRIBED')
    expect((await call('POST', '/users/me/push/status', 'otherCustomer', { endpoint: ENDPOINT })).body.data?.subscribed).toBe(false)
    await call('POST', '/users/me/push/unsubscribe', 'otherCustomer', { endpoint: ENDPOINT })
    expect(stored.has(ENDPOINT)).toBe(true)
    expect(fakePushOutbox).toHaveLength(0)
  })

  test('the owner of the device gets a test notification, and can turn it off', async () => {
    await call('POST', '/users/me/push/subscriptions', 'customer', SUBSCRIPTION)
    const { status, body } = await call('POST', '/users/me/push/test', 'customer', { endpoint: ENDPOINT })
    expect(status).toBe(200)
    expect(body.data?.result).toBe('sent')
    expect(fakePushOutbox).toHaveLength(1)
    await call('POST', '/users/me/push/unsubscribe', 'customer', { endpoint: ENDPOINT })
    expect(stored.has(ENDPOINT)).toBe(false)
  })

  test('a garage seat’s session is not a customer here, and nobody signed in gets a 401', async () => {
    expect((await call('POST', '/users/me/push/subscriptions', 'owner', SUBSCRIPTION)).status).toBe(403)
    expect((await call('POST', '/users/me/push/subscriptions', null, SUBSCRIPTION)).status).toBe(401)
  })
})

describe('garage seats: only for their own garage', () => {
  beforeAll(() => pushOn(true))

  test('the owner and an operator both subscribe, for the garage resolveTenant gives them', async () => {
    expect((await call('POST', '/vendors/me/push/subscriptions', 'owner', SUBSCRIPTION)).status).toBe(200)
    expect(stored.get(ENDPOINT)?.vendorId).toBe(GARAGE)

    const operatorDevice = { ...SUBSCRIPTION, endpoint: `${ENDPOINT}-operator` }
    expect((await call('POST', '/vendors/me/push/subscriptions', 'operator', operatorDevice)).status).toBe(200)
    expect(stored.get(operatorDevice.endpoint)).toMatchObject({ userId: PEOPLE.operator, audience: 'garage', vendorId: GARAGE })
  })

  test('another garage’s owner cannot subscribe for this garage by header', async () => {
    const { status, body } = await call('POST', '/vendors/me/push/subscriptions', 'otherOwner', SUBSCRIPTION, {
      'X-Vendor-Id': GARAGE,
    })
    expect(status).toBe(404)
    expect(body.code).toBe('VENDOR_NOT_FOUND')
    expect(stored.size).toBe(0)

    // Without the header it is their own garage.
    await call('POST', '/vendors/me/push/subscriptions', 'otherOwner', SUBSCRIPTION)
    expect(stored.get(ENDPOINT)?.vendorId).toBe(OTHER_GARAGE)
  })

  test('a vendorId in the body is refused, never read', async () => {
    const { status } = await call('POST', '/vendors/me/push/subscriptions', 'owner', { ...SUBSCRIPTION, vendorId: OTHER_GARAGE })
    expect(status).toBe(400)
  })

  test('a customer has no seat (404); a Detlio support session cannot attach a device (403)', async () => {
    expect((await call('POST', '/vendors/me/push/subscriptions', 'customer', SUBSCRIPTION)).status).toBe(404)
    const support = await call('POST', '/vendors/me/push/subscriptions', 'superAdmin', SUBSCRIPTION, { 'X-Vendor-Id': GARAGE })
    expect(support.status).toBe(403)
    expect(support.body.code).toBe('PUSH_SUPPORT_SESSION')
    expect(stored.size).toBe(0)
  })

  test('a test goes only to the seat’s own device for this garage', async () => {
    await call('POST', '/vendors/me/push/subscriptions', 'owner', SUBSCRIPTION)
    expect((await call('POST', '/vendors/me/push/test', 'otherOwner', { endpoint: ENDPOINT })).status).toBe(404)
    expect((await call('POST', '/vendors/me/push/test', 'operator', { endpoint: ENDPOINT })).status).toBe(404)
    const own = await call('POST', '/vendors/me/push/test', 'owner', { endpoint: ENDPOINT })
    expect(own.body.data?.result).toBe('sent')
    expect(fakePushOutbox).toEqual([expect.objectContaining({ tag: 'test', url: '/settings/notifications' })])
  })
})

describe('Admin → Alerts: super-admin only', () => {
  test('the status says whether Telegram is set up, never the token or chat id', async () => {
    envValues.telegramBotToken = undefined
    envValues.telegramOpsChatId = undefined
    const { status, body } = await call('GET', '/admin/alerts/telegram', 'superAdmin')
    expect(status).toBe(200)
    expect(body.data).toEqual({ configured: false, liveHere: false })
    expect((await call('GET', '/admin/alerts/telegram', 'breakGlass')).status).toBe(200)
  })

  test('nobody else may read it or send a test', async () => {
    for (const who of ['owner', 'operator', 'customer'] as const) {
      expect((await call('GET', '/admin/alerts/telegram', who)).status).toBe(403)
      expect((await call('POST', '/admin/alerts/telegram/test', who, { actorName: 'Asha' })).status).toBe(403)
    }
    expect((await call('POST', '/admin/alerts/telegram/test', null, { actorName: 'Asha' })).status).toBe(401)
  })

  test('not set up: the test says so', async () => {
    envValues.telegramBotToken = undefined
    envValues.telegramOpsChatId = undefined
    const { status, body } = await call('POST', '/admin/alerts/telegram/test', 'superAdmin', { actorName: 'Asha' })
    expect(status).toBe(409)
    expect(body.code).toBe('TELEGRAM_NOT_CONFIGURED')
  })

  test('set up: it posts to the ops chat even outside Production, signed by the session (a typed name is ignored)', async () => {
    envValues.telegramBotToken = 'test-token'
    envValues.telegramOpsChatId = '-100123'
    envValues.vercelEnv = 'preview'
    const sent: Array<{ chat_id: string; text: string }> = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const { status, body } = await call('POST', '/admin/alerts/telegram/test', 'superAdmin', { actorName: '  Asha   K ' })
      expect(status).toBe(200)
      expect(body.data?.sent).toBe(true)
      expect(sent).toEqual([{ chat_id: '-100123', text: '✅ Detlio test alert from Signed-in Sam', link_preview_options: { is_disabled: true } } as never])
      const status2 = await call('GET', '/admin/alerts/telegram', 'superAdmin')
      expect(status2.body.data).toEqual({ configured: true, liveHere: false })
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
