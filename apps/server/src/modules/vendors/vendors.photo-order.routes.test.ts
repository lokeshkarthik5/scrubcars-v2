/**
 * Garage photo order (21 Nov 2026) through the real routes, auth and tenant
 * middleware, with the database stood in for: the garage's owner seat
 * (PUT /vendors/me/photos/order) and admin (PUT /admin/vendors/:id/photos/order)
 * send the whole gallery in its new order; anything but exactly the garage's
 * photos now is refused with nothing written; an operator can't; admin's
 * change carries its audit actor; a garage in the Bin is refused. The rule
 * itself: lib/photo-order.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { adminRepository } = await import('../admin/admin.repository.js')
const { adminRoutes } = await import('../admin/admin.routes.js')
const { vendorsRepository } = await import('./vendors.repository.js')
const { vendorsRoutes } = await import('./vendors.routes.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PEOPLE = { owner: id(8030), operator: id(8031) }
const GARAGE = id(8032)
const OTHER_GARAGE = id(8033)
const [P1, P2, P3] = [id(8034), id(8035), id(8036)]
const FOREIGN = id(8037)
const SEATS = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' as const },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' as const },
]

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type Photo = { id: string; vendorId: string; url: string; storageKey: string | null; sortOrder: number; createdAt: Date }
let photos: Photo[]
let audits: Array<{ vendorId: string; actor: { sub: string; name: string } | undefined }>
let writes: number
let inBin: boolean

const ordered = (vendorId: string) =>
  photos.filter((p) => p.vendorId === vendorId).sort((a, b) => a.sortOrder - b.sortOrder)

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((s) => s.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((s) => s.vendorId === vendorId && s.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async () => undefined)
  patch(vendorsRepository, 'findVendorById', async (vendorId: string) =>
    vendorId === GARAGE ? { id: GARAGE, businessName: 'Marina Auto Spa' } : undefined
  )
  patch(adminRepository, 'findVendorById', async (vendorId: string) =>
    vendorId === GARAGE || vendorId === OTHER_GARAGE
      ? { id: vendorId, deletedAt: inBin ? new Date() : null, purgedAt: null }
      : undefined
  )
  // As the repository does: the check decides on the garage's ids now, and
  // only then is everything written, with the audit when there is an actor.
  patch(
    vendorsRepository,
    'setPhotoOrder',
    async (
      vendorId: string,
      photoIds: readonly string[],
      check: (currentIds: string[]) => string | null,
      audit?: { sub: string; name: string }
    ) => {
      const problem = check(ordered(vendorId).map((p) => p.id))
      if (problem) return { problem }
      for (const [sortOrder, photoId] of photoIds.entries()) {
        const row = photos.find((p) => p.id === photoId && p.vendorId === vendorId)
        if (row) {
          row.sortOrder = sortOrder
          writes++
        }
      }
      if (audit) audits.push({ vendorId, actor: audit })
      return { problem: null, photos: ordered(vendorId) }
    }
  )
})

beforeEach(() => {
  const at = new Date('2026-11-20T10:00:00Z')
  photos = [
    { id: P1, vendorId: GARAGE, url: 'https://cdn.test/1.jpg', storageKey: null, sortOrder: 0, createdAt: at },
    { id: P2, vendorId: GARAGE, url: 'https://cdn.test/2.jpg', storageKey: null, sortOrder: 1, createdAt: at },
    { id: P3, vendorId: GARAGE, url: 'https://cdn.test/3.jpg', storageKey: null, sortOrder: 2, createdAt: at },
    { id: FOREIGN, vendorId: OTHER_GARAGE, url: 'https://cdn.test/x.jpg', storageKey: null, sortOrder: 0, createdAt: at },
  ]
  audits = []
  writes = 0
  inBin = false
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
app.route('/vendors', vendorsRoutes)
app.route('/admin', adminRoutes)

type Who = keyof typeof PEOPLE | 'admin'

async function put(path: string, who: Who, body: unknown) {
  const token =
    who === 'admin'
      ? await signAdminToken()
      : await signAccessToken({ sub: PEOPLE[who], aud: 'vendor', isCustomer: false, isVendorOwner: who === 'owner' })
  const response = await app.request(path, {
    method: 'PUT',
    headers: { Cookie: `access_token=${token}`, 'content-type': 'application/json', 'X-Vendor-Id': GARAGE },
    body: JSON.stringify(body),
  })
  return {
    status: response.status,
    body: (await response.json()) as { code?: string; data?: Array<{ id: string; sortOrder: number }> },
  }
}

const GARAGE_ORDER = '/vendors/me/photos/order'
const ADMIN_ORDER = `/admin/vendors/${GARAGE}/photos/order`

describe("the garage's own photo order", () => {
  test('Make cover: the owner sends the new order and gets it back, first = cover', async () => {
    const res = await put(GARAGE_ORDER, 'owner', { photoIds: [P3, P1, P2] })
    expect(res.status).toBe(200)
    expect(res.body.data!.map((p) => [p.id, p.sortOrder])).toEqual([
      [P3, 0],
      [P1, 1],
      [P2, 2],
    ])
    expect(ordered(GARAGE).map((p) => p.id)).toEqual([P3, P1, P2])
    // Nothing for admin's audit from the garage's own change.
    expect(audits).toEqual([])
  })

  test('a duplicate is 400, a stale or foreign list 409, and nothing is written', async () => {
    const duplicate = await put(GARAGE_ORDER, 'owner', { photoIds: [P1, P1, P2] })
    expect(duplicate.status).toBe(400)
    expect(duplicate.body.code).toBe('PHOTO_ORDER_DUPLICATE')

    const missing = await put(GARAGE_ORDER, 'owner', { photoIds: [P2, P1] })
    expect(missing.status).toBe(409)
    expect(missing.body.code).toBe('PHOTO_ORDER_STALE')

    const foreign = await put(GARAGE_ORDER, 'owner', { photoIds: [P2, P1, P3, FOREIGN] })
    expect(foreign.status).toBe(409)
    expect(foreign.body.code).toBe('PHOTO_ORDER_STALE')

    const swapped = await put(GARAGE_ORDER, 'owner', { photoIds: [P2, P1, FOREIGN] })
    expect(swapped.status).toBe(409)

    expect(writes).toBe(0)
    expect(ordered(GARAGE).map((p) => p.id)).toEqual([P1, P2, P3])
    expect(ordered(OTHER_GARAGE).map((p) => p.sortOrder)).toEqual([0])
  })

  test('the body must be a list of photo ids', async () => {
    expect((await put(GARAGE_ORDER, 'owner', { photoIds: [] })).status).toBe(400)
    expect((await put(GARAGE_ORDER, 'owner', { photoIds: ['not-an-id'] })).status).toBe(400)
    expect((await put(GARAGE_ORDER, 'owner', {})).status).toBe(400)
    expect(writes).toBe(0)
  })

  test('an operator cannot reorder, as they cannot add or delete photos', async () => {
    const res = await put(GARAGE_ORDER, 'operator', { photoIds: [P3, P1, P2] })
    expect(res.status).toBe(403)
    expect(writes).toBe(0)
  })
})

describe('admin photo order', () => {
  test('admin reorders and the change is audited with who did it', async () => {
    const res = await put(ADMIN_ORDER, 'admin', { photoIds: [P2, P1, P3] })
    expect(res.status).toBe(200)
    expect(res.body.data!.map((p) => p.id)).toEqual([P2, P1, P3])
    expect(audits).toEqual([{ vendorId: GARAGE, actor: { sub: 'admin', name: 'admin' } }])
  })

  test("another garage's photo, a stale list or a duplicate is refused", async () => {
    expect((await put(ADMIN_ORDER, 'admin', { photoIds: [P1, P2, FOREIGN] })).body.code).toBe('PHOTO_ORDER_STALE')
    expect((await put(ADMIN_ORDER, 'admin', { photoIds: [P1, P2] })).status).toBe(409)
    expect((await put(ADMIN_ORDER, 'admin', { photoIds: [P1, P2, P2] })).status).toBe(400)
    expect(writes).toBe(0)
    expect(audits).toEqual([])
  })

  test('a garage in the Bin is refused; an unknown garage is 404; a garage token never reaches it', async () => {
    inBin = true
    expect((await put(ADMIN_ORDER, 'admin', { photoIds: [P2, P1, P3] })).body.code).toBe('VENDOR_IN_BIN')
    inBin = false
    expect((await put(`/admin/vendors/${id(8039)}/photos/order`, 'admin', { photoIds: [P1] })).status).toBe(404)
    expect((await put(ADMIN_ORDER, 'owner', { photoIds: [P2, P1, P3] })).status).toBe(403)
    expect(writes).toBe(0)
  })
})
