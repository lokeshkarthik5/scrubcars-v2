/**
 * Who may read a car's history and act on its reminders, through the real
 * routes and the real auth middleware, wired as users.routes.ts wires them.
 * Only the database is stood in for (the repository, put back afterwards),
 * holding two customers' cars and reminders.
 *
 * The rules: a signed-in customer reads only their own current cars (anyone
 * else's, or one they removed, is a 404 — never a 403, which would confirm
 * it exists), and dismisses or snoozes only their own reminders. The user is
 * always the session's; there is no parameter to name anyone else. A garage
 * session is not a customer.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')
const { carHistoryRepository } = await import('./car-history.repository.js')
const { carHistoryRoutes } = await import('./car-history.routes.js')

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000002601',
  other: 'e2e00000-0000-4000-8000-000000002602',
  garage: 'e2e00000-0000-4000-8000-000000002603',
}
const CARS = {
  own: 'e2e00000-0000-4000-8000-000000002611',
  others: 'e2e00000-0000-4000-8000-000000002612',
  removed: 'e2e00000-0000-4000-8000-000000002613',
}
const REMINDERS = {
  own: 'e2e00000-0000-4000-8000-000000002621',
  others: 'e2e00000-0000-4000-8000-000000002622',
}

/** The cars "stored": whose, and whether removed. */
const cars = [
  { id: CARS.own, userId: PEOPLE.owner, archived: false },
  { id: CARS.others, userId: PEOPLE.other, archived: false },
  { id: CARS.removed, userId: PEOPLE.owner, archived: true },
]
const reminders = new Map<string, { userId: string; vehicleId: string; status: string; snoozedUntil: string | null }>()

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

/** Every repository read the routes made, with the user it was scoped to. */
const reads: Array<{ what: string; userId: string }> = []

beforeAll(() => {
  patch(carHistoryRepository, 'findOwnCar', async (userId: string, vehicleId: string) => {
    reads.push({ what: 'car', userId })
    const car = cars.find((c) => c.id === vehicleId && c.userId === userId && !c.archived)
    return car
      ? { id: car.id, make: 'Honda', model: 'City', color: null, licensePlate: null, vehicleType: 'sedan', isDefault: true }
      : undefined
  })
  patch(carHistoryRepository, 'listCarRows', async (userId: string) => {
    reads.push({ what: 'rows', userId })
    return []
  })
  patch(carHistoryRepository, 'listOpenReminders', async (userId: string) => {
    reads.push({ what: 'reminders', userId })
    return []
  })
  patch(carHistoryRepository, 'findOwnReminder', async (userId: string, reminderId: string) => {
    const row = reminders.get(reminderId)
    const car = row && cars.find((c) => c.id === row.vehicleId)
    return row && row.userId === userId && car && !car.archived
      ? { id: reminderId, vehicleId: row.vehicleId, status: row.status }
      : undefined
  })
  patch(carHistoryRepository, 'dismiss', async (userId: string, reminderId: string) => {
    const row = reminders.get(reminderId)
    if (!row || row.userId !== userId || row.status !== 'open') return false
    row.status = 'dismissed'
    return true
  })
  patch(carHistoryRepository, 'snooze', async (userId: string, reminderId: string, until: string) => {
    const row = reminders.get(reminderId)
    if (!row || row.userId !== userId || row.status !== 'open') return false
    row.snoozedUntil = until
    return true
  })
})

beforeEach(() => {
  reads.length = 0
  reminders.clear()
  reminders.set(REMINDERS.own, { userId: PEOPLE.owner, vehicleId: CARS.own, status: 'open', snoozedUntil: null })
  reminders.set(REMINDERS.others, { userId: PEOPLE.other, vehicleId: CARS.others, status: 'open', snoozedUntil: null })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

// ─── The app, wired the way users.routes.ts wires it ─────────────────────────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me', carHistoryRoutes)
app.route('/users', users)

type Who = keyof typeof PEOPLE | null

async function call(method: string, path: string, who: Who) {
  const headers: Record<string, string> = {}
  if (who) {
    const customer = who !== 'garage'
    const token = await signAccessToken({
      sub: PEOPLE[who],
      aud: customer ? 'customer' : 'vendor',
      isCustomer: customer,
      isVendorOwner: !customer,
    })
    headers.Cookie = `access_token=${token}`
  }
  const response = await app.request(path, { method, headers })
  const json = (await response.json()) as { code?: string; data?: Record<string, unknown> }
  return { status: response.status, body: json }
}

describe('a car’s history: only your own cars', () => {
  test('your own car opens, read as you', async () => {
    const { status, body } = await call('GET', `/users/me/vehicles/${CARS.own}/history`, 'owner')
    expect(status).toBe(200)
    expect((body.data?.car as { id: string }).id).toBe(CARS.own)
    expect(body.data?.items).toEqual([])
    expect(reads.every((read) => read.userId === PEOPLE.owner)).toBe(true)
  })

  test('someone else’s car is a 404, and nothing of it is read', async () => {
    const { status, body } = await call('GET', `/users/me/vehicles/${CARS.others}/history`, 'owner')
    expect(status).toBe(404)
    expect(body.code).toBe('VEHICLE_NOT_FOUND')
    expect(reads.map((read) => read.what)).toEqual(['car'])
  })

  test('a car you removed is a 404', async () => {
    expect((await call('GET', `/users/me/vehicles/${CARS.removed}/history`, 'owner')).status).toBe(404)
  })

  test('signed out is a 401; a garage session is not a customer', async () => {
    expect((await call('GET', `/users/me/vehicles/${CARS.own}/history`, null)).status).toBe(401)
    expect((await call('GET', `/users/me/vehicles/${CARS.own}/history`, 'garage')).status).toBe(403)
  })

  test('a bad id or an unknown category is a 400', async () => {
    expect((await call('GET', '/users/me/vehicles/not-a-uuid/history', 'owner')).status).toBe(400)
    expect((await call('GET', `/users/me/vehicles/${CARS.own}/history?category=polish`, 'owner')).status).toBe(400)
    expect((await call('GET', `/users/me/vehicles/${CARS.own}/history?category=coating`, 'owner')).status).toBe(200)
  })
})

describe('reminders: only your own', () => {
  test('dismiss your own; twice is fine', async () => {
    expect((await call('POST', `/users/me/service-reminders/${REMINDERS.own}/dismiss`, 'owner')).status).toBe(200)
    expect(reminders.get(REMINDERS.own)?.status).toBe('dismissed')
    expect((await call('POST', `/users/me/service-reminders/${REMINDERS.own}/dismiss`, 'owner')).status).toBe(200)
  })

  test('snooze your own for two weeks; a closed one is a 409', async () => {
    const { status, body } = await call('POST', `/users/me/service-reminders/${REMINDERS.own}/snooze`, 'owner')
    expect(status).toBe(200)
    expect(typeof body.data?.snoozedUntil).toBe('string')
    expect(reminders.get(REMINDERS.own)?.snoozedUntil).toBe(body.data?.snoozedUntil as string)

    reminders.get(REMINDERS.own)!.status = 'done'
    const closed = await call('POST', `/users/me/service-reminders/${REMINDERS.own}/snooze`, 'owner')
    expect(closed.status).toBe(409)
    expect(closed.body.code).toBe('REMINDER_CLOSED')
  })

  test('someone else’s reminder is a 404 and is left as it was', async () => {
    for (const action of ['dismiss', 'snooze']) {
      const { status, body } = await call('POST', `/users/me/service-reminders/${REMINDERS.others}/${action}`, 'owner')
      expect(status).toBe(404)
      expect(body.code).toBe('REMINDER_NOT_FOUND')
    }
    expect(reminders.get(REMINDERS.others)).toEqual({
      userId: PEOPLE.other,
      vehicleId: CARS.others,
      status: 'open',
      snoozedUntil: null,
    })
  })

  test('signed out is a 401', async () => {
    expect((await call('POST', `/users/me/service-reminders/${REMINDERS.own}/dismiss`, null)).status).toBe(401)
  })
})
