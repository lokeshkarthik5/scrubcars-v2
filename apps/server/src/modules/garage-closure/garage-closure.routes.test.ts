/**
 * "Close my garage" (0066) through the real routes, auth and tenant
 * middleware; only the database is stood in for. The garage's own owner
 * asks (with a reason) and may cancel until Detlio acts; anyone else at the
 * garage (another admin seat, an operator) and a Detlio support session are
 * refused. One open request at a time. Admin lists the open ones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { garageClosureRepository } = await import('./garage-closure.repository.js')
const { garageClosureRoutes, adminGarageClosureRoutes } = await import('./garage-closure.routes.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PEOPLE = { owner: id(5201), coAdmin: id(5202), operator: id(5203), superAdmin: id(5204) }
const GARAGE = id(5210)
const SEATS = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' as const },
  { userId: PEOPLE.coAdmin, vendorId: GARAGE, role: 'vendor_admin' as const },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' as const },
]

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type Row = { id: string; vendorId: string; status: string; reason: string; requestedByName: string; createdAt: Date }
let requests: Row[]

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((s) => s.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((s) => s.vendorId === vendorId && s.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  patch(membersRepository, 'findVendorForSupport', async (vendorId: string) => (vendorId === GARAGE ? { id: vendorId } : undefined))
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(garageClosureRepository, 'findGarage', async (vendorId: string) =>
    vendorId === GARAGE ? { id: GARAGE, businessName: 'Marina Auto Spa', ownerId: PEOPLE.owner, deletedAt: null } : null
  )
  patch(garageClosureRepository, 'userName', async () => 'Ravi Kumar')
  patch(garageClosureRepository, 'findOpen', async (vendorId: string) =>
    requests.find((r) => r.vendorId === vendorId && r.status === 'open') ?? null
  )
  patch(garageClosureRepository, 'insert', async (values: { vendorId: string; requestedByName: string; reason: string }) => {
    if (requests.some((r) => r.vendorId === values.vendorId && r.status === 'open')) return null
    const row = { id: id(5220 + requests.length), status: 'open', createdAt: new Date(), ...values }
    requests.push(row)
    return row
  })
  patch(garageClosureRepository, 'cancelOpen', async (vendorId: string) => {
    const open = requests.find((r) => r.vendorId === vendorId && r.status === 'open')
    if (!open) return null
    open.status = 'cancelled'
    return open
  })
  patch(garageClosureRepository, 'listOpen', async () =>
    requests.filter((r) => r.status === 'open').map((request) => ({ request, garageName: 'Marina Auto Spa' }))
  )
})

beforeEach(() => {
  requests = []
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
app.route('/vendors/me/closure', garageClosureRoutes)
app.route('/admin', adminGarageClosureRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass'

async function call(method: string, path: string, who: Who, body?: unknown, headers: Record<string, string> = {}) {
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({ sub: PEOPLE[who], aud: 'vendor', isCustomer: false, isVendorOwner: true })
  const response = await app.request(path, {
    method,
    headers: { Cookie: `access_token=${token}`, 'content-type': 'application/json', 'X-Vendor-Id': GARAGE, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: (await response.json()) as { code?: string; data?: unknown } }
}

describe('Close my garage', () => {
  test('the owner asks with a reason, sees it, and can cancel it', async () => {
    expect((await call('GET', '/vendors/me/closure', 'owner')).body.data).toBeNull()
    const asked = await call('POST', '/vendors/me/closure', 'owner', { reason: 'Moving to Coimbatore' })
    expect(asked.status).toBe(201)
    expect(asked.body.data).toMatchObject({ status: 'open', reason: 'Moving to Coimbatore', requestedByName: 'Ravi Kumar' })
    expect((await call('GET', '/vendors/me/closure', 'owner')).body.data).toMatchObject({ status: 'open' })

    const cancelled = await call('POST', '/vendors/me/closure/cancel', 'owner')
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.data).toMatchObject({ status: 'cancelled' })
    expect((await call('GET', '/vendors/me/closure', 'owner')).body.data).toBeNull()
  })

  test('one open request at a time, and nothing to cancel is a 409', async () => {
    await call('POST', '/vendors/me/closure', 'owner', { reason: 'Moving away' })
    const again = await call('POST', '/vendors/me/closure', 'owner', { reason: 'Moving away' })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('CLOSURE_ALREADY_REQUESTED')
    await call('POST', '/vendors/me/closure/cancel', 'owner')
    expect((await call('POST', '/vendors/me/closure/cancel', 'owner')).body.code).toBe('CLOSURE_NOT_OPEN')
  })

  test('a reason is required', async () => {
    expect((await call('POST', '/vendors/me/closure', 'owner', { reason: ' ' })).status).toBe(400)
    expect((await call('POST', '/vendors/me/closure', 'owner', {})).status).toBe(400)
    expect(requests).toEqual([])
  })

  test('another admin seat is refused, an operator never reaches it, nor does a support session', async () => {
    expect((await call('POST', '/vendors/me/closure', 'coAdmin', { reason: 'Closing down' })).body.code).toBe('GARAGE_OWNER_ONLY')
    expect((await call('POST', '/vendors/me/closure', 'operator', { reason: 'Closing down' })).status).toBe(403)
    const support = await call('POST', '/vendors/me/closure', 'superAdmin', { reason: 'Closing down' })
    expect(support.status).toBe(403)
    expect(requests).toEqual([])
  })

  test('admin lists the open requests and reads a garage’s', async () => {
    await call('POST', '/vendors/me/closure', 'owner', { reason: 'Moving to Coimbatore' })
    const list = await call('GET', '/admin/garage-closures', 'breakGlass')
    expect(list.status).toBe(200)
    expect(list.body.data).toMatchObject([{ vendorId: GARAGE, garageName: 'Marina Auto Spa', reason: 'Moving to Coimbatore' }])
    const one = await call('GET', `/admin/vendors/${GARAGE}/closure-request`, 'breakGlass')
    expect(one.body.data).toMatchObject({ status: 'open' })
    expect((await call('GET', '/admin/garage-closures', 'owner')).status).toBe(403)
  })
})
