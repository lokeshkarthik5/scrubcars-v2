/**
 * Who may set, see and cancel slot alerts (0047), through the real routes
 * and the real auth middleware, wired as users.routes.ts wires them. Only
 * the database is stood in for (the repository, put back afterwards).
 *
 * The rules: signed-in customers only; the customer is always the
 * session's (the body cannot name anyone, it is strict); a customer sees
 * and cancels only their own, and anyone else's alert is a 404, the same
 * answer as one that does not exist.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')
const { slotAlertsRepository } = await import('./slot-alerts.repository.js')
const { slotAlertsRoutes } = await import('./slot-alerts.routes.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PEOPLE = { customer: id(2701), otherCustomer: id(2702), garageOwner: id(2703) }
const GARAGE = id(2710)
const SERVICE = id(2720)
const IST = (iso: string) => new Date(`${iso}+05:30`)

// A date a week ahead, so the rules' "today" never makes it past.
const DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type Row = {
  id: string
  userId: string
  vendorId: string
  date: string
  window: 'any' | 'morning' | 'afternoon' | 'evening'
  bookingType: 'dropin' | 'doorstep' | 'pickup'
  durationMins: number
  serviceIds: string[]
  createdAt: Date
  expiresAt: Date
  notifiedAt: Date | null
}
const rows: Row[] = []
let counter = 0

const originals: Array<[Record<string, unknown>, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Record<string, unknown>
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(slotAlertsRepository, 'findUser', async (userId: string) => ({ id: userId, status: 'active' }))
  patch(slotAlertsRepository, 'findGarage', async (vendorId: string) =>
    vendorId === GARAGE
      ? {
          id: GARAGE, businessName: 'Slot Alert Spa', bookingsPausedAt: null, slotIntervalMins: 60, bays: 1,
          jobsPerDay: 1, dropinEnabled: true, doorstepEnabled: false, pickup: 'no', pickupRadiusKm: null,
          pickupTermsAcceptedAt: null,
        }
      : undefined
  )
  patch(slotAlertsRepository, 'findServices', async (_vendorId: string, ids: string[]) =>
    ids.includes(SERVICE) ? [{ id: SERVICE, durationMins: 60 }] : []
  )
  // One job a day, and the day has it: full.
  patch(slotAlertsRepository, 'readDay', async (_vendorId: string, date: string) => ({
    hours: { openTime: '09:00:00', closeTime: '18:00:00', isClosed: false },
    isHoliday: false,
    busy: [{ start: IST(`${date}T10:00:00`), durationMins: 60 }],
  }))
  patch(slotAlertsRepository, 'setUnderLimit', async (input: { alert: Omit<Row, 'id' | 'createdAt' | 'notifiedAt'> }) => {
    const row: Row = { ...input.alert, id: id(2760 + counter++), createdAt: new Date(), notifiedAt: null }
    rows.push(row)
    return { refusal: null, row, replaced: false }
  })
  patch(slotAlertsRepository, 'listWaiting', async (userId: string) =>
    rows.filter((row) => row.userId === userId).map((row) => ({ ...row, vendorName: 'Slot Alert Spa' }))
  )
  patch(slotAlertsRepository, 'removeWaiting', async (userId: string, alertId: string) => {
    const index = rows.findIndex((row) => row.id === alertId && row.userId === userId)
    if (index < 0) return false
    rows.splice(index, 1)
    return true
  })
})

beforeEach(() => {
  rows.length = 0
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
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me', slotAlertsRoutes)
app.route('/users', users)

type Who = keyof typeof PEOPLE | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const customer = who !== 'garageOwner'
  const token = await signAccessToken({
    sub: PEOPLE[who],
    aud: customer ? 'customer' : 'vendor',
    isCustomer: customer,
    isVendorOwner: !customer,
  })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Who, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { ...(await cookieFor(who)), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; data?: Record<string, unknown> & { alert?: Row; items?: Row[] } }
  return { status: response.status, body: json }
}

const ASK = { vendorId: GARAGE, date: DATE, window: 'morning', bookingType: 'dropin', serviceIds: [SERVICE] }

describe('slot alerts: signed-in customers, their own only', () => {
  test('signed out, or a garage login, is refused and stores nothing', async () => {
    expect((await call('POST', '/users/me/slot-alerts', null, ASK)).status).toBe(401)
    expect((await call('GET', '/users/me/slot-alerts', null)).status).toBe(401)
    expect((await call('POST', '/users/me/slot-alerts', 'garageOwner', ASK)).status).toBe(403)
    expect(rows).toHaveLength(0)
  })

  test('an alert is stored for the session’s customer; the body cannot name anyone', async () => {
    const created = await call('POST', '/users/me/slot-alerts', 'customer', ASK)
    expect(created.status).toBe(201)
    expect(rows.map((row) => row.userId)).toEqual([PEOPLE.customer])
    expect(created.body.data?.alert).toMatchObject({ vendorId: GARAGE, date: DATE, window: 'morning', durationMins: 60 })

    const naming = await call('POST', '/users/me/slot-alerts', 'customer', { ...ASK, userId: PEOPLE.otherCustomer })
    expect(naming.status).toBe(400)
    expect(rows).toHaveLength(1)
  })

  test('a customer lists only their own and cannot cancel anyone else’s', async () => {
    await call('POST', '/users/me/slot-alerts', 'customer', ASK)
    await call('POST', '/users/me/slot-alerts', 'otherCustomer', ASK)
    const [mine, theirs] = rows

    const listed = await call('GET', '/users/me/slot-alerts', 'customer')
    expect(listed.body.data?.items?.map((item) => item.id)).toEqual([mine.id])
    expect(listed.body.data?.max).toBe(5)

    const notTheirs = await call('DELETE', `/users/me/slot-alerts/${theirs.id}`, 'customer')
    expect(notTheirs.status).toBe(404)
    expect(notTheirs.body.code).toBe('SLOT_ALERT_NOT_FOUND')
    expect(rows).toHaveLength(2)

    expect((await call('DELETE', `/users/me/slot-alerts/${mine.id}`, 'customer')).status).toBe(200)
    expect(rows.map((row) => row.id)).toEqual([theirs.id])
  })

  test('bad input is a 400 before anything is read', async () => {
    for (const body of [
      { ...ASK, window: 'night' },
      { ...ASK, date: '2026-02-31' },
      { ...ASK, serviceIds: [] },
      { ...ASK, serviceIds: [SERVICE, SERVICE] },
      { ...ASK, vendorId: 'not-an-id' },
    ]) {
      expect((await call('POST', '/users/me/slot-alerts', 'customer', body)).status).toBe(400)
    }
    expect((await call('DELETE', '/users/me/slot-alerts/not-an-id', 'customer')).status).toBe(400)
    expect(rows).toHaveLength(0)
  })
})
