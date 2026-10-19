/**
 * GET /admin/today, through the real route and the real auth middleware.
 * Only the reads are stood in for: each of todaySources is replaced for
 * these tests and put back afterwards, so nothing here touches a database.
 *
 * The rules: only a super-admin reads it; it answers every source's open
 * tasks in deadline order with the menu's counts; and a slow Statistics read
 * leaves the Collected tile empty rather than failing the inbox.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { adminTodayRoutes } = await import('./today.routes.js')
const { todaySources, WAITING_LIMIT } = await import('./today.service.js')

const CUSTOMER = 'e2e00000-0000-4000-8000-000000004150'
const BOOKING = 'e2e00000-0000-4000-8000-000000004151'
const COMPLAINT = 'e2e00000-0000-4000-8000-000000004152'
const GARAGE = 'e2e00000-0000-4000-8000-000000004153'

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const HOUR = 60 * 60 * 1000

beforeAll(() => {
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(todaySources, 'waitingBookings', async () => [
    {
      id: BOOKING,
      scheduledAt: new Date(Date.now() + 3 * HOUR),
      amount: '899.00',
      respondBy: new Date(Date.now() + 10 * 60 * 1000),
      garageName: 'Shine Auto Spa',
      garagePhone: '9876543210',
      customerName: 'Priya Raman',
      services: 'Foam wash + Interior',
    },
  ])
  patch(todaySources, 'waitingBookingsCount', async () => {
    throw new Error('only read when the list is cut short')
  })
  patch(todaySources, 'day', async () => [
    {
      id: BOOKING,
      scheduledAt: new Date(),
      status: 'pending',
      bookingType: 'dropin',
      customerName: 'Priya Raman',
      garageName: 'Shine Auto Spa',
      services: 'Foam wash',
    },
    {
      id: COMPLAINT,
      scheduledAt: new Date(),
      status: 'cancelled',
      bookingType: 'dropin',
      customerName: 'X',
      garageName: 'Y',
      services: '',
    },
  ])
  patch(todaySources, 'complaints', async () => ({
    complaints: [
      {
        id: COMPLAINT,
        number: 'C-000101',
        status: 'open',
        message: 'Scratch on rear bumper after the wash',
        customer: { name: 'Karthik S' },
        garage: { name: 'Velachery Car Care' },
        acknowledgeBy: new Date(Date.now() - 26 * HOUR).toISOString(),
        resolveBy: new Date(Date.now() + 5 * 24 * HOUR).toISOString(),
        overdue: 'acknowledge',
      },
    ],
  }))
  patch(todaySources, 'claims', () => null)
  patch(todaySources, 'bypassReports', async () => ({ reports: [] }))
  patch(todaySources, 'refundsOwed', async () => [])
  patch(todaySources, 'payoutsDue', async () => null)
  patch(todaySources, 'garages', async () => [
    {
      id: GARAGE,
      businessName: 'Velachery Car Care',
      status: 'pending',
      live: false,
      bookingsPausedAt: null,
      deletedAt: null,
      documents: { toReview: 0 },
      readiness: [{ severity: 'blocking', short: 'map pin' }],
    },
  ])
  patch(todaySources, 'collected', async () => {
    throw new AppError(503, 'Statistics took too long', 'STATS_TIMEOUT')
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json(
        { success: false, message: err.message, code: err.code },
        err.statusCode as 400
      )
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/admin/today', adminTodayRoutes)

async function get(cookie?: string) {
  return app.request('/admin/today', {
    headers: cookie ? { Cookie: cookie } : {},
  })
}

describe('GET /admin/today', () => {
  test('is refused without a session, and to a customer', async () => {
    expect((await get()).status).toBe(401)
    const customer = await signAccessToken({
      sub: CUSTOMER,
      aud: 'customer',
      isCustomer: true,
      isVendorOwner: false,
    })
    expect((await get(`access_token=${customer}`)).status).toBe(403)
  })

  test('answers the open tasks in deadline order, with the counts and the day', async () => {
    const res = await get(`access_token=${await signAdminToken()}`)
    expect(res.status).toBe(200)
    const { data } = await res.json()

    // The late complaint first, then the booking that cancels in 10 min,
    // then the blocked garage (no clock).
    expect(data.tasks.map((task: { kind: string }) => task.kind)).toEqual([
      'complaint',
      'booking_waiting',
      'garage_blocked',
    ])
    expect(data.tasks[0]).toMatchObject({
      late: true,
      stage: 'acknowledge',
      number: 'C-000101',
    })
    expect(data.tasks[1]).toMatchObject({
      late: false,
      reference: BOOKING.slice(0, 8).toUpperCase(),
    })
    expect(data.tasks[2]).toMatchObject({ blocking: ['map pin'] })

    expect(data.counts.today).toEqual({ n: 3, late: 1 })
    expect(data.counts.bookings).toEqual({ n: 1, late: 0 })
    expect(data.counts.issues).toEqual({ n: 1, late: 1 })
    expect(data.counts.garages).toEqual({ n: 1, late: 0 })

    // Cancelled bookings are off the schedule and out of the count.
    expect(data.schedule).toHaveLength(1)
    expect(data.headline.bookingsToday).toEqual({
      total: 1,
      done: 0,
      toCome: 0,
      waiting: 1,
    })
    expect(data.headline.openIssues).toEqual({ total: 1, complaintsLate: 1 })
    // Statistics timed out: the tile is empty, the inbox is still there.
    expect(data.headline.collectedToday).toBeNull()
    expect(data.failed).toEqual(['collected'])
    expect(data.garages).toEqual({
      live: 0,
      blocked: 1,
      paused: 0,
      documentsToReview: 0,
    })
  })

  test('takes no options', async () => {
    const res = await app.request('/admin/today?days=7', {
      headers: { Cookie: `access_token=${await signAdminToken()}` },
    })
    expect(res.status).toBe(400)
  })

  test('a list cut short says how many more there are, and the menu counts them', async () => {
    const one = {
      scheduledAt: new Date(Date.now() + 3 * HOUR),
      amount: '499.00',
      respondBy: new Date(Date.now() + HOUR),
      garageName: 'Shine Auto Spa',
      garagePhone: '9876543210',
      customerName: 'A',
      services: 'Foam wash',
    }
    const rows = Array.from({ length: WAITING_LIMIT }, (_, i) => ({
      ...one,
      id: `e2e00000-0000-4000-8000-${String(4160 + i).padStart(12, '0')}`,
    }))
    const before = [
      todaySources.waitingBookings,
      todaySources.waitingBookingsCount,
    ]
    todaySources.waitingBookings = (async () => rows) as never
    todaySources.waitingBookingsCount = async () => WAITING_LIMIT + 30
    try {
      const res = await get(`access_token=${await signAdminToken()}`)
      const { data } = await res.json()
      expect(data.more).toEqual({ bookings: 30 })
      expect(data.counts.bookings.n).toBe(WAITING_LIMIT + 30)
      expect(
        data.tasks.filter((t: { kind: string }) => t.kind === 'booking_waiting')
      ).toHaveLength(WAITING_LIMIT)
    } finally {
      ;[todaySources.waitingBookings, todaySources.waitingBookingsCount] =
        before as [
          typeof todaySources.waitingBookings,
          typeof todaySources.waitingBookingsCount,
        ]
    }
  })

  test('a source that fails leaves its section marked, not the whole inbox', async () => {
    const before = todaySources.complaints
    todaySources.complaints = async () => {
      throw new Error('complaints table locked')
    }
    try {
      const res = await get(`access_token=${await signAdminToken()}`)
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.failed).toEqual(['complaints', 'collected'])
      // Everything else is still there.
      expect(data.tasks.map((task: { kind: string }) => task.kind)).toEqual([
        'booking_waiting',
        'garage_blocked',
      ])
      expect(data.counts.bookings).toEqual({ n: 1, late: 0 })
    } finally {
      todaySources.complaints = before
    }
  })
})
