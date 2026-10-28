/**
 * The admin Requests list and Cancel (0064) through the real admin routes
 * and auth, with only the database stood in for (the repository's methods
 * replaced on its object, put back after):
 *
 * - one entry per request (its chain put together, its latest row where it
 *   stands), Open / Accepted / Failed / All by customer reach's own state,
 *   one zone's by its slug, the customer's phone masked;
 * - Cancel: admin only, a reason, signed; only an open one, and not while
 *   the customer is paying; the customer is told as on an expiry.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAdminToken } = await import('../../lib/jwt.js')
const { personalAdminSubject } = await import('../../lib/admin-actor.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { adminLoginsRepository } = await import('../admin-logins/admin-logins.repository.js')
const { pushService } = await import('../push/push.service.js')
const { bookingRequestsRepository } = await import('./booking-requests.repository.js')

type Row = NonNullable<Awaited<ReturnType<typeof bookingRequestsRepository.findById>>>

const RAGA = 'e2e00000-0000-4000-8000-000000005951'
const CUSTOMER = 'e2e00000-0000-4000-8000-000000005952'
const G1 = 'e2e00000-0000-4000-8000-000000005953'
const G2 = 'e2e00000-0000-4000-8000-000000005954'
const id = (n: number) => `e2e00000-0000-4000-8000-${String(5960 + n).padStart(12, '0')}`

const NOW = new Date()
const MIN = 60 * 1000

function row(values: Partial<Row>): Row {
  return {
    id: id(0),
    userId: CUSTOMER,
    vendorId: G1,
    rootRequestId: null,
    forwardedFromId: null,
    chainNo: 1,
    bookingType: 'doorstep',
    vehicleId: null,
    vehicleType: 'sedan',
    addressId: null,
    lat: 13.12,
    lng: 80.23,
    zoneSlug: 'perambur',
    distanceKm: '9.0',
    coverKm: '5.0',
    outsideKm: '4.0',
    items: [{ serviceId: 's', name: 'Foam wash', category: 'car_wash', amount: '600.00', durationMins: 60 }],
    subtotalAmount: '600.00',
    durationMins: 60,
    windowDate: '2026-10-30',
    windowPart: 'morning',
    windowStart: new Date('2026-10-30T09:00:00+05:30'),
    windowEnd: new Date('2026-10-30T12:00:00+05:30'),
    status: 'pending',
    respondBy: new Date(NOW.getTime() + 80 * MIN),
    reply: null,
    repliedAt: null,
    repliedBy: null,
    travelFee: null,
    acceptedStartAt: null,
    confirmBy: null,
    bookingId: null,
    opsAlertedAt: null,
    customerToldAt: null,
    closedAt: null,
    cancelledByName: null,
    cancelReason: null,
    createdAt: new Date(NOW.getTime() - 40 * MIN),
    updatedAt: new Date(NOW.getTime() - 40 * MIN),
    ...values,
  } as Row
}

let rows: Row[] = []
let checkoutOpen = false
const cancels: Array<{ id: string; actorName: string; actorSub: string; reason: string }> = []
const pushes: Array<{ userId: string; title: string }> = []

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

beforeAll(() => {
  patch(adminLoginsRepository, 'findSession', async (sessionId: string) =>
    sessionId === RAGA
      ? { id: sessionId, username: 'raga', name: 'Raga', status: 'active', isOwner: false, sessionsFrom: new Date('2026-01-01') }
      : undefined
  )
  const r = bookingRequestsRepository
  patch(r, 'listForAdmin', async () =>
    rows.map((request) => ({
      request,
      customerName: 'Request Rani',
      customerPhone: '9000005040',
      garageName: request.vendorId === G1 ? 'Doorstep One' : 'Doorstep Two',
      garagePhone: request.vendorId === G1 ? '9000005053' : '9000005054',
    }))
  )
  patch(r, 'listZones', async () => [
    { id: 'z', slug: 'perambur', name: 'Perambur', lat: 13.1, lng: 80.2, priority: false, target: 5, liveAt: null, createdAt: NOW, updatedAt: NOW },
  ])
  patch(r, 'findById', async (requestId: string) => rows.find((x) => x.id === requestId))
  patch(r, 'cancelByAdmin', async (input: { id: string; actorName: string; actorSub: string; reason: string; now: Date }) => {
    const at = rows.findIndex((x) => x.id === input.id)
    const current = rows[at]
    if (!current || !['pending', 'accepted'].includes(current.status) || checkoutOpen) return null
    cancels.push({ id: input.id, actorName: input.actorName, actorSub: input.actorSub, reason: input.reason })
    rows[at] = { ...current, status: 'cancelled', cancelledByName: input.actorName, cancelReason: input.reason, closedAt: input.now }
    return rows[at]
  })
  patch(r, 'hasOpenCheckout', async () => checkoutOpen)
  patch(r, 'garageName', async (vendorId: string) => (vendorId === G1 ? 'Doorstep One' : 'Doorstep Two'))
  patch(r, 'markCustomerTold', async () => undefined)
  patch(pushService, 'notifyCustomer', (userId: string, message: { title: string }) => {
    pushes.push({ userId, title: message.title })
  })
})

beforeEach(() => {
  checkoutOpen = false
  cancels.length = 0
  pushes.length = 0
  rows = [
    // Waiting for its first garage, 40 minutes, no answer.
    row({ id: id(1) }),
    // Accepted: travel fee and a start, waiting for the customer.
    row({
      id: id(2),
      status: 'accepted',
      reply: 'accepted',
      repliedAt: new Date(NOW.getTime() - 10 * MIN),
      travelFee: '100.00',
      acceptedStartAt: new Date('2026-10-30T10:00:00+05:30'),
      confirmBy: new Date(NOW.getTime() + 60 * MIN),
      createdAt: new Date(NOW.getTime() - 60 * MIN),
    }),
    // Passed on: G1 said no, G2 never answered. Failed.
    row({ id: id(3), status: 'forwarded', reply: 'declined', repliedAt: new Date(NOW.getTime() - 100 * MIN), createdAt: new Date(NOW.getTime() - 300 * MIN) }),
    row({
      id: id(4),
      vendorId: G2,
      chainNo: 2,
      rootRequestId: id(3),
      forwardedFromId: id(3),
      status: 'expired',
      createdAt: new Date(NOW.getTime() - 100 * MIN),
    }),
    // Booked, from another zone.
    row({ id: id(5), zoneSlug: 'adyar', status: 'converted', reply: 'accepted', travelFee: '0.00', acceptedStartAt: NOW, confirmBy: NOW, createdAt: new Date(NOW.getTime() - 500 * MIN) }),
    // Cancelled by the customer.
    row({ id: id(6), status: 'cancelled', createdAt: new Date(NOW.getTime() - 600 * MIN) }),
  ]
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as { data?: any; code?: string; message?: string } }
}

const raga = () => signAdminToken(personalAdminSubject(RAGA))

describe('GET /admin/requests', () => {
  test('admin only; one entry per request, newest first; Open by default', async () => {
    expect((await call('GET', '/admin/requests', null)).status).toBe(401)
    const { status, body } = await call('GET', '/admin/requests', await raga())
    expect(status).toBe(200)
    expect(body.data.counts).toEqual({ open: 2, accepted: 1, failed: 1, all: 5 })
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([id(1), id(2)])
    const waiting = body.data.items[0]
    expect(waiting).toMatchObject({
      state: 'waiting',
      filter: 'open',
      customer: { id: CUSTOMER, name: 'Request Rani', phone: '••••••5040' },
      garage: { id: G1, name: 'Doorstep One', phone: '9000005053' },
      zone: { slug: 'perambur', name: 'Perambur' },
      items: [{ name: 'Foam wash', amount: '600.00' }],
      travelFee: null,
      cancelledBy: null,
    })
    // The customer's full number never leaves the API.
    expect(JSON.stringify(body.data)).not.toContain('9000005040')
    expect(body.data.items[1]).toMatchObject({ state: 'accepted', travelFee: 100, confirmBy: expect.any(String) })
  })

  test('Failed: nobody accepted, with the chain it went through', async () => {
    const { body } = await call('GET', '/admin/requests?filter=failed', await raga())
    expect(body.data.items).toHaveLength(1)
    const failed = body.data.items[0]
    expect(failed).toMatchObject({ id: id(4), rootId: id(3), state: 'no_garage', garage: { name: 'Doorstep Two' } })
    expect(failed.chain).toEqual([
      expect.objectContaining({ id: id(3), garage: { id: G1, name: 'Doorstep One' }, status: 'forwarded', reply: 'declined' }),
      expect.objectContaining({ id: id(4), garage: { id: G2, name: 'Doorstep Two' }, status: 'expired', reply: null }),
    ])
  })

  test('Accepted, All (a cancel only there), and one zone’s by its slug', async () => {
    const accepted = await call('GET', '/admin/requests?filter=accepted', await raga())
    expect(accepted.body.data.items.map((item: { state: string }) => item.state)).toEqual(['booked'])
    const all = await call('GET', '/admin/requests?filter=all', await raga())
    expect(all.body.data.items.find((item: { id: string }) => item.id === id(6))).toMatchObject({
      state: 'cancelled',
      filter: null,
      cancelledBy: 'customer',
    })
    const perambur = await call('GET', '/admin/requests?filter=all&zone=perambur', await raga())
    expect(perambur.body.data.counts).toEqual({ open: 2, accepted: 0, failed: 1, all: 4 })
    expect(perambur.body.data.zone).toEqual({ slug: 'perambur', name: 'Perambur' })
    expect((await call('GET', '/admin/requests?filter=nope', await raga())).status).toBe(400)
  })
})

describe('POST /admin/requests/:id/cancel', () => {
  test('admin only, with a reason of 3 to 200 characters', async () => {
    expect((await call('POST', `/admin/requests/${id(1)}/cancel`, null, { reason: 'Garage closed today' })).status).toBe(401)
    expect((await call('POST', `/admin/requests/${id(1)}/cancel`, await raga(), { reason: 'x' })).status).toBe(400)
    expect((await call('POST', `/admin/requests/${id(1)}/cancel`, await raga(), { reason: 'y'.repeat(201) })).status).toBe(400)
    expect((await call('POST', `/admin/requests/${id(1)}/cancel`, await raga(), {})).status).toBe(400)
    expect(cancels).toEqual([])
  })

  test('an open one: cancelled, signed by the session, the customer told; then it is under All as Detlio’s', async () => {
    const res = await call('POST', `/admin/requests/${id(1)}/cancel`, await raga(), {
      reason: '  Garage closed today  ',
      actorName: 'Someone else',
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ id: id(1), status: 'cancelled' })
    expect(cancels).toEqual([
      { id: id(1), actorName: 'Raga', actorSub: personalAdminSubject(RAGA), reason: 'Garage closed today' },
    ])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pushes).toEqual([{ userId: CUSTOMER, title: 'Your request was cancelled' }])
    const all = await call('GET', '/admin/requests?filter=all', await raga())
    expect(all.body.data.items.find((item: { id: string }) => item.id === id(1))).toMatchObject({
      state: 'cancelled',
      cancelledBy: 'detlio',
      cancelledByName: 'Raga',
      cancelReason: 'Garage closed today',
    })
  })

  test('not open any more: 409, and nobody is told', async () => {
    const res = await call('POST', `/admin/requests/${id(4)}/cancel`, await raga(), { reason: 'Too late' })
    expect([res.status, res.body.code]).toEqual([409, 'REQUEST_STATE_CHANGED'])
    expect(pushes).toEqual([])
    expect((await call('POST', `/admin/requests/${id(9)}/cancel`, await raga(), { reason: 'Gone' })).status).toBe(404)
  })

  test('an accepted one the customer is paying for right now: 409, kept', async () => {
    checkoutOpen = true
    const res = await call('POST', `/admin/requests/${id(2)}/cancel`, await raga(), { reason: 'Garage asked' })
    expect([res.status, res.body.code]).toEqual([409, 'REQUEST_CHECKOUT_OPEN'])
    expect(rows.find((x) => x.id === id(2))!.status).toBe('accepted')
  })
})
