/**
 * Luxury car specialists (0083) through the real routes and the real auth
 * and tenant middleware: the garage applies (owner seat, Silver or Gold,
 * its own photos), the team approves, asks for more, declines and removes
 * (super-admin, signed, audited, a note where the garage reads one), and the
 * garage is told. Only the database and the push are stood in for, on the
 * repositories' and services' objects, put back afterwards.
 *
 * Ids in the luxury range (8200–8249, AGENTS.md).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { tiersService } = await import('../tiers/tiers.service.js')
const { pushService } = await import('../push/push.service.js')
const { luxuryRepository } = await import('./luxury.repository.js')
const { adminLuxuryRoutes, garageLuxuryRoutes } = await import('./luxury.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000008230'
const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000008231',
  operator: 'e2e00000-0000-4000-8000-000000008232',
  superAdmin: 'e2e00000-0000-4000-8000-000000008233',
}
const SEATS = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' as const },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' as const },
]
const BASE = 'https://cdn.example.test'
const photo = (n: number) => ({
  url: `${BASE}/vendors/${GARAGE}/luxury/0f8fad5b-d9cb-469f-a165-7086772895${String(n).padStart(2, '0')}.jpg`,
  caption: n === 1 ? 'BMW 5 Series' : null,
})
const APPLICATION = {
  brands: ['Mini', 'BMW', 'Audi'],
  photos: [photo(1), photo(2), photo(3)],
  coveredBay: true,
  products: 'Gtechniq Crystal Serum',
  staff: '',
}

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type Row = Record<string, unknown> & { status: string; sentAt: Date; timesSent: number; brands: string[] }
let tier: 'gold' | 'silver' | 'bronze' | null
let application: Row | undefined
let vendor: {
  id: string
  businessName: string
  deletedAt: Date | null
  luxuryApprovedAt: Date | null
  luxuryApprovedBy: string | null
  luxuryBrands: string[] | null
}
let audits: Array<{ action: string; actorName: string; detail: Record<string, unknown> }>
let pushes: Array<{ vendorId: string; title: string; body: string }>
const savedBase = env.r2PublicBaseUrl

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((s) => s.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((s) => s.vendorId === vendorId && s.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Mathew', phone: '9000008299' } : undefined
  )
  patch(tiersService, 'heldTiers', async (ids: string[]) => new Map(ids.map((id) => [id, tier])))
  patch(pushService, 'notifyGarage', (vendorId: string, message: { title: string; body: string }) => {
    pushes.push({ vendorId, title: message.title, body: message.body })
  })

  const reads = {
    findApplication: async () => application,
    findVendor: async (id: string) => (id === GARAGE ? vendor : undefined),
  }
  patch(luxuryRepository, 'findApplication', reads.findApplication)
  patch(luxuryRepository, 'findVendor', reads.findVendor)
  patch(luxuryRepository, 'locked', async (_id: string, work: (w: unknown) => Promise<unknown>) =>
    work({
      ...reads,
      async saveApplication(_vendorId: string, values: Row) {
        application = {
          ...(application ?? {}),
          ...values,
          teamNote: null,
          decidedBy: application?.decidedBy ?? null,
          decidedAt: application?.decidedAt ?? null,
          updatedAt: new Date(),
        }
        return application
      },
      async decide(_vendorId: string, patch: { status: string; teamNote: string | null; decidedBy: string }) {
        application = { ...application!, ...patch, decidedAt: new Date(), updatedAt: new Date() }
        return application
      },
      async setBadge(_vendorId: string, badge: { approvedBy: string; brands: string[] } | null) {
        vendor = badge
          ? { ...vendor, luxuryApprovedAt: new Date(), luxuryApprovedBy: badge.approvedBy, luxuryBrands: badge.brands }
          : { ...vendor, luxuryApprovedAt: null, luxuryApprovedBy: null, luxuryBrands: null }
      },
      async setBrands(_vendorId: string, brands: string[]) {
        vendor = { ...vendor, luxuryBrands: brands }
      },
      async audit(action: string, actor: { name: string }, _garage: unknown, detail: Record<string, unknown>) {
        audits.push({ action, actorName: actor.name, detail })
      },
    })
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  ;(env as unknown as Record<string, unknown>).r2PublicBaseUrl = savedBase
})

beforeEach(() => {
  tier = 'silver'
  application = undefined
  vendor = {
    id: GARAGE,
    businessName: 'Luxury Test Garage',
    deletedAt: null,
    luxuryApprovedAt: null,
    luxuryApprovedBy: null,
    luxuryBrands: null,
  }
  audits = []
  pushes = []
  ;(env as unknown as Record<string, unknown>).r2PublicBaseUrl = BASE
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/vendors/me/luxury', garageLuxuryRoutes)
app.route('/admin/luxury', adminLuxuryRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass'

async function call(method: string, path: string, who: Who, body?: unknown) {
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({ sub: PEOPLE[who], aud: 'vendor', isCustomer: false, isVendorOwner: who === 'owner' })
  const response = await app.request(path, {
    method,
    headers: {
      Cookie: `access_token=${token}`,
      ...(who === 'owner' || who === 'operator' ? { 'X-Vendor-Id': GARAGE } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return {
    status: response.status,
    body: (await response.json()) as { code?: string; data?: Record<string, unknown> & { application?: Record<string, unknown> | null; badge?: Record<string, unknown> | null } },
  }
}

const ADMIN = `/admin/luxury/vendors/${GARAGE}`

describe('the garage applies', () => {
  test('a Silver garage sends its application; brands come back in the form order', async () => {
    const before = await call('GET', '/vendors/me/luxury', 'owner')
    expect(before.status).toBe(200)
    expect(before.body.data).toMatchObject({ tier: 'silver', silverOrGold: true, application: null, badge: null })

    const sent = await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    expect(sent.status).toBe(200)
    expect(sent.body.data?.application).toMatchObject({
      status: 'review',
      brands: ['BMW', 'Audi', 'Mini'],
      coveredBay: true,
      products: 'Gtechniq Crystal Serum',
      staff: null,
      timesSent: 1,
    })
    expect(application?.sentBy).toBe(PEOPLE.owner)
  })

  test('a Bronze garage cannot apply', async () => {
    tier = 'bronze'
    const sent = await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    expect(sent.status).toBe(409)
    expect(sent.body.code).toBe('LUXURY_NEEDS_SILVER')
  })

  test('fewer than 3 photos, or a photo that is not its own upload, is refused', async () => {
    const two = await call('PUT', '/vendors/me/luxury', 'owner', { ...APPLICATION, photos: APPLICATION.photos.slice(0, 2) })
    expect(two.status).toBe(400)
    const foreign = await call('PUT', '/vendors/me/luxury', 'owner', {
      ...APPLICATION,
      photos: [...APPLICATION.photos.slice(0, 2), { url: 'https://elsewhere.example/x.jpg', caption: null }],
    })
    expect(foreign.status).toBe(400)
    expect(foreign.body.code).toBe('INVALID_PHOTO_URL')
    const unknownBrand = await call('PUT', '/vendors/me/luxury', 'owner', { ...APPLICATION, brands: ['Ferrari'] })
    expect(unknownBrand.status).toBe(400)
  })

  test('an operator seat cannot read or send (owner seat only)', async () => {
    expect((await call('GET', '/vendors/me/luxury', 'operator')).status).toBe(403)
    expect((await call('PUT', '/vendors/me/luxury', 'operator', APPLICATION)).status).toBe(403)
  })

  test('a garage cannot reach the team routes', async () => {
    expect((await call('GET', ADMIN, 'owner')).status).toBe(403)
    expect((await call('POST', `${ADMIN}/approve`, 'owner', {})).status).toBe(403)
  })
})

describe("the team's decisions", () => {
  test('Approve shows the badge at once, signed and audited, and the garage is told', async () => {
    await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    const panel = await call('GET', ADMIN, 'superAdmin')
    expect(panel.body.data).toMatchObject({ onApplicationsList: true, silverOrGold: true })

    const approved = await call('POST', `${ADMIN}/approve`, 'superAdmin', {})
    expect(approved.status).toBe(200)
    expect(approved.body.data?.badge).toMatchObject({ approvedBy: 'Signed-in Mathew', brands: ['BMW', 'Audi', 'Mini'], shown: true })
    expect(audits).toEqual([
      expect.objectContaining({ action: 'luxury_approved', actorName: 'Signed-in Mathew' }),
    ])
    expect(pushes).toHaveLength(1)
    expect(pushes[0]!.title).toBe("You're a Luxury car specialist")

    // Below Silver the badge hides, and the garage sees why.
    tier = 'bronze'
    const garage = await call('GET', '/vendors/me/luxury', 'owner')
    expect(garage.body.data).toMatchObject({ silverOrGold: false, badge: { shown: false } })
  })

  test('Ask for more and Decline need a note, which the garage reads; the push never carries it', async () => {
    await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    const bare = await call('POST', `${ADMIN}/ask-more`, 'superAdmin', {})
    expect(bare.status).toBe(400)
    const more = await call('POST', `${ADMIN}/ask-more`, 'superAdmin', { note: 'Please add a photo inside your covered bay.' })
    expect(more.status).toBe(200)
    const garage = await call('GET', '/vendors/me/luxury', 'owner')
    expect(garage.body.data?.application).toMatchObject({
      status: 'more',
      teamNote: 'Please add a photo inside your covered bay.',
      decidedBy: 'Signed-in Mathew',
    })
    expect(JSON.stringify(pushes)).not.toContain('covered bay')

    // Sending again goes back to review in the same place in the queue.
    const sentAt = garage.body.data?.application?.sentAt
    const again = await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    expect(again.body.data?.application).toMatchObject({ status: 'review', sentAt, timesSent: 1, teamNote: null })

    const declined = await call('POST', `${ADMIN}/decline`, 'superAdmin', { note: 'Not enough luxury jobs yet.' })
    expect(declined.status).toBe(200)
    const after = await call('GET', '/vendors/me/luxury', 'owner')
    expect(after.body.data?.application).toMatchObject({ status: 'declined' })
    expect(after.body.data?.reapplyOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const wait = await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    expect(wait.body.code).toBe('LUXURY_WAIT')
    expect(audits.map((a) => a.action)).toEqual(['luxury_asked_for_more', 'luxury_declined'])
  })

  test('an answered application cannot be answered twice; Approve needs Silver', async () => {
    await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    tier = 'bronze'
    expect((await call('POST', `${ADMIN}/approve`, 'superAdmin', {})).body.code).toBe('LUXURY_NEEDS_SILVER')
    tier = 'gold'
    expect((await call('POST', `${ADMIN}/approve`, 'superAdmin', {})).status).toBe(200)
    expect((await call('POST', `${ADMIN}/approve`, 'superAdmin', {})).body.code).toBe('LUXURY_NOT_PENDING')
  })

  test('Edit brands and Remove badge on an approved garage, each audited', async () => {
    await call('PUT', '/vendors/me/luxury', 'owner', APPLICATION)
    await call('POST', `${ADMIN}/approve`, 'superAdmin', {})
    const edited = await call('PATCH', `${ADMIN}/brands`, 'superAdmin', { brands: ['Porsche', 'BMW'] })
    expect(edited.body.data?.badge).toMatchObject({ brands: ['BMW', 'Porsche'] })

    expect((await call('POST', `${ADMIN}/remove`, 'superAdmin', {})).status).toBe(400)
    const removed = await call('POST', `${ADMIN}/remove`, 'superAdmin', { note: 'Standards slipped.' })
    expect(removed.status).toBe(200)
    expect(removed.body.data?.badge).toBeNull()
    expect(removed.body.data?.application).toMatchObject({ status: 'removed', teamNote: 'Standards slipped.' })
    expect(audits.map((a) => a.action)).toEqual(['luxury_approved', 'luxury_brands_edited', 'luxury_badge_removed'])
    expect(audits[1]!.detail).toEqual({ from: ['BMW', 'Audi', 'Mini'], to: ['BMW', 'Porsche'] })
  })

  test('a garage that never applied: 404', async () => {
    const res = await call('POST', `${ADMIN}/decline`, 'superAdmin', { note: 'x' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('LUXURY_NO_APPLICATION')
  })
})
