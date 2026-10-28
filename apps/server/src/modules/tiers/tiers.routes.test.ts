/**
 * The tiers (0063) through the real routes and the real auth and tenant
 * middleware: what customers may know (only which tiers are shown), the
 * garage's own "Your tier" (owner seat, its own garage, whatever the
 * switches say), and admin's switches, garage view and hide switch
 * (super-admin; a garage in the Bin is read-only). Only the database is
 * stood in for, on the repositories' objects, put back afterwards.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { certificationRepository } = await import('../certification/certification.repository.js')
const { agreementsRepository } = await import('../agreements/agreements.repository.js')
const { tiersRepository } = await import('./tiers.repository.js')
const { tiersService } = await import('./tiers.service.js')
const { adminTierRoutes, garageTierRoutes, publicTierRoutes } = await import('./tiers.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000004630'
const BINNED = 'e2e00000-0000-4000-8000-000000004631'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000004632',
  operator: 'e2e00000-0000-4000-8000-000000004633',
  superAdmin: 'e2e00000-0000-4000-8000-000000004634',
}

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

const DOC_KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2DocsBucket', 'r2Endpoint'] as const
const savedEnv = Object.fromEntries(DOC_KEYS.map((key) => [key, env[key]]))

let switches: Map<'bronze' | 'silver' | 'gold', boolean>
let hidden: Map<string, boolean>
let gold: Set<string>
let silver: Set<string>
let accepted: Map<string, number>
let documentsApproved: string[]
let audits: string[]

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
  patch(membersRepository, 'findVendorForSupport', async (vendorId: string) => ({ id: vendorId }))
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(tiersRepository, 'listSwitches', async () =>
    [...switches].map(([tier, shown]) => ({ tier, shown, updatedAt: new Date('2026-10-30T00:00:00Z'), updatedBy: 'Lokesh' }))
  )
  patch(tiersRepository, 'setSwitch', async (tier: 'bronze' | 'silver' | 'gold', shown: boolean) => {
    if (switches.get(tier) !== shown) audits.push(shown ? 'tier_shown' : 'tier_hidden')
    switches.set(tier, shown)
  })
  patch(tiersRepository, 'listGoldIds', async (ids: string[]) => new Set(ids.filter((id) => gold.has(id))))
  patch(tiersRepository, 'listSilverIds', async (ids: string[]) => new Set(ids.filter((id) => silver.has(id))))
  patch(tiersRepository, 'listHiddenIds', async (ids: string[]) => new Set(ids.filter((id) => hidden.get(id))))
  patch(tiersRepository, 'findGarage', async (id: string) =>
    [GARAGE, BINNED].includes(id)
      ? {
          id,
          businessName: id === GARAGE ? 'Tier Test Garage' : 'Binned Garage',
          tierHidden: hidden.get(id) ?? false,
          deletedAt: id === BINNED ? new Date('2026-10-10T00:00:00Z') : null,
          purgedAt: null,
        }
      : undefined
  )
  patch(tiersRepository, 'setHidden', async (id: string, value: boolean) => {
    const changed = (hidden.get(id) ?? false) !== value
    if (changed) audits.push(value ? 'garage_medal_hidden' : 'garage_medal_shown')
    hidden.set(id, value)
    return { changed }
  })

  patch(agreementsRepository, 'latest', async () => ({
    id: 'a1',
    version: 1,
    fileUrl: 'https://cdn.example/agreements/v1.pdf',
    fileKey: 'agreements/v1-x.pdf',
    sizeBytes: 1000,
    note: null,
    publishedAt: new Date('2026-09-01T00:00:00Z'),
  }))
  patch(agreementsRepository, 'acceptedVersions', async (ids: string[]) =>
    new Map(ids.filter((id) => accepted.has(id)).map((id) => [id, accepted.get(id)!]))
  )
  patch(agreementsRepository, 'listAcceptances', async (id: string) =>
    accepted.has(id) ? [{ version: 1, acceptedAt: new Date('2026-09-02T00:00:00Z'), acceptedByName: 'Owner Oviya' }] : []
  )

  // A garage at Silver's edges: 4.2 from 5 reviews, 10 jobs, no deadlines yet.
  const reads = {
    listApprovedDocumentTypes: async (ids: string[]) =>
      ids.flatMap((vendorId) => documentsApproved.map((type) => ({ vendorId, type, status: 'approved' }))),
    ratings: async (ids: string[]) => ids.map((vendorId) => ({ vendorId, average: 4.2, count: 5 })),
    completedCounts: async (ids: string[]) => ids.map((vendorId) => ({ vendorId, count: 10 })),
    responseCounts: async () => [],
    complaintCounts: async () => [],
    garageNoShowCounts: async () => [],
    bypassStrikeCounts: async () => [],
    photoComplianceJobs: async () => [],
    listRecentChecks: async () => [],
    findState: async (id: string) =>
      gold.has(id) ? { certifiedAt: new Date('2026-09-10T00:00:00Z'), revokedAt: null, ineligibleSince: null } : undefined,
    findTierStanding: async (id: string) =>
      silver.has(id)
        ? { silverAt: new Date('2026-09-05T00:00:00Z'), silverShortSince: null, silverLostAt: null, lastEvaluatedAt: null }
        : undefined,
  }
  for (const [key, value] of Object.entries(reads)) patch(certificationRepository, key, value)
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
})

beforeEach(() => {
  switches = new Map([
    ['bronze', true],
    ['silver', true],
    ['gold', true],
  ])
  hidden = new Map()
  gold = new Set()
  silver = new Set()
  accepted = new Map([[GARAGE, 1]])
  documentsApproved = ['shop_photo', 'owner_id', 'bank_proof']
  audits = []
  const values = env as unknown as Record<string, string | undefined>
  values.r2AccountId = 'test-account'
  values.r2AccessKeyId = 'test-key'
  values.r2SecretAccessKey = 'test-secret'
  values.r2DocsBucket = 'detlio-docs-test'
  values.r2Endpoint = 'http://localhost:9000'
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/tiers', publicTierRoutes)
app.route('/vendors/me/tier', garageTierRoutes)
app.route('/admin/tiers', adminTierRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function call(path: string, who: Who, body?: unknown) {
  const token =
    who === null
      ? null
      : who === 'breakGlass'
        ? await signAdminToken()
        : await signAccessToken({ sub: PEOPLE[who], aud: 'vendor', isCustomer: false, isVendorOwner: true })
  const response = await app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Cookie: `access_token=${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as { code?: string; data?: Record<string, unknown> } }
}

describe('what customers may know', () => {
  test('which tiers are shown and whether "Silver & above" is offered, nothing about any garage', async () => {
    const all = await call('/tiers', null)
    expect(all.status).toBe(200)
    expect(all.body.data).toEqual({ shown: { bronze: true, silver: true, gold: true }, silverFilter: true })
    switches.set('silver', false)
    switches.set('gold', false)
    expect((await call('/tiers', null)).body.data).toEqual({
      shown: { bronze: true, silver: false, gold: false },
      silverFilter: false,
    })
  })

  test('a medal is the highest tier switched on, and none while hidden', async () => {
    gold.add(GARAGE)
    expect((await tiersService.customerTiers([GARAGE])).get(GARAGE)).toBe('gold')
    switches.set('gold', false)
    expect((await tiersService.customerTiers([GARAGE])).get(GARAGE)).toBe('silver')
    switches.set('silver', false)
    expect((await tiersService.customerTiers([GARAGE])).get(GARAGE)).toBe('bronze')
    hidden.set(GARAGE, true)
    expect((await tiersService.customerTiers([GARAGE])).get(GARAGE)).toBeNull()
  })

  test('without the agreement there is no Bronze', async () => {
    accepted = new Map()
    expect((await tiersService.customerTiers([GARAGE])).get(GARAGE)).toBeNull()
  })

  test('"Silver & above" lets through the tiers switched on, and is off when both are', async () => {
    expect(await tiersService.silverFilterTiers()).toEqual(['silver', 'gold'])
    switches.set('silver', false)
    expect(await tiersService.silverFilterTiers()).toEqual(['gold'])
    switches.set('gold', false)
    expect(await tiersService.silverFilterTiers()).toBeNull()
  })
})

describe('"Your tier": the owner seat, its own garage', () => {
  test("Bronze, working towards Silver: 5 of 5 done (it is given tonight)", async () => {
    const { status, body } = await call('/vendors/me/tier', 'owner')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      tier: 'bronze',
      line: "You're Bronze. Next: Silver, 5 of 5 done.",
      next: { tier: 'silver', done: 5, total: 5 },
      agreement: { status: 'accepted' },
      documentsOn: true,
    })
  })

  test('each missing step says where to act', async () => {
    documentsApproved = ['shop_photo']
    accepted = new Map()
    const { body } = await call('/vendors/me/tier', 'owner')
    expect(body.data).toMatchObject({ tier: null, next: { tier: 'bronze' } })
    const steps = (body.data!.next as { steps: Array<{ key: string; action: string | null }> }).steps
    expect(steps).toEqual([expect.objectContaining({ key: 'agreement', action: 'agreement' })])
  })

  test('the garage sees its tier whatever the switches say, and never that it was hidden', async () => {
    silver.add(GARAGE)
    switches.set('silver', false)
    hidden.set(GARAGE, true)
    const { body } = await call('/vendors/me/tier', 'owner')
    expect(body.data).toMatchObject({ tier: 'silver', next: { tier: 'gold' } })
    expect(JSON.stringify(body.data)).not.toMatch(/hidden|shown/i)
  })

  test('an operator and nobody are turned away', async () => {
    expect((await call('/vendors/me/tier', 'operator')).status).toBe(403)
    expect((await call('/vendors/me/tier', null)).status).toBe(401)
  })
})

describe('admin: switches, the garage view and the hide switch', () => {
  test('the Tiers card: read, switch a tier off and on, each change audited', async () => {
    const read = await call('/admin/tiers/settings', 'superAdmin')
    expect(read.status).toBe(200)
    expect(read.body.data).toMatchObject({
      tiers: [
        { tier: 'bronze', shown: true },
        { tier: 'silver', shown: true },
        { tier: 'gold', shown: true },
      ],
      silverFilter: true,
    })
    const off = await call('/admin/tiers/settings', 'superAdmin', { tier: 'bronze', shown: false })
    expect(off.status).toBe(200)
    expect(off.body.data).toMatchObject({ tiers: [{ tier: 'bronze', shown: false }, {}, {}] })
    await call('/admin/tiers/settings', 'breakGlass', { tier: 'bronze', shown: true })
    expect(audits).toEqual(['tier_hidden', 'tier_shown'])
    expect((await call('/admin/tiers/settings', 'superAdmin', { tier: 'platinum', shown: true })).status).toBe(400)
    expect((await call('/admin/tiers/settings', 'owner', { tier: 'gold', shown: false })).status).toBe(403)
  })

  test('the garage view: the tier, what customers see, every tier’s steps and the acceptances', async () => {
    gold.add(GARAGE)
    switches.set('gold', false)
    const { status, body } = await call(`/admin/tiers/vendors/${GARAGE}`, 'superAdmin')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      tier: 'gold',
      shown: 'silver',
      hidden: false,
      next: null,
      acceptances: [{ version: 1, acceptedBy: 'Owner Oviya' }],
      runPaused: null,
    })
    const steps = body.data!.steps as Record<string, unknown[]>
    expect(Object.keys(steps)).toEqual(['bronze', 'silver', 'gold'])
    expect((await call(`/admin/tiers/vendors/e2e00000-0000-4000-8000-000000004699`, 'superAdmin')).status).toBe(404)
  })

  test('hide the medal and show it again: customers see none meanwhile; audited once per change', async () => {
    gold.add(GARAGE)
    const hide = await call(`/admin/tiers/vendors/${GARAGE}/hidden`, 'superAdmin', { hidden: true })
    expect(hide.status).toBe(200)
    expect(hide.body.data).toMatchObject({ tier: 'gold', hidden: true, shown: null })
    expect((await tiersService.customerTiers([GARAGE])).get(GARAGE)).toBeNull()
    await call(`/admin/tiers/vendors/${GARAGE}/hidden`, 'superAdmin', { hidden: true })
    const show = await call(`/admin/tiers/vendors/${GARAGE}/hidden`, 'superAdmin', { hidden: false })
    expect(show.body.data).toMatchObject({ hidden: false, shown: 'gold' })
    expect(audits).toEqual(['garage_medal_hidden', 'garage_medal_shown'])
  })

  test('a garage in the Bin can be read, not changed; a garage seat can do neither', async () => {
    expect((await call(`/admin/tiers/vendors/${BINNED}`, 'superAdmin')).status).toBe(200)
    const refused = await call(`/admin/tiers/vendors/${BINNED}/hidden`, 'superAdmin', { hidden: true })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('VENDOR_IN_BIN')
    expect((await call(`/admin/tiers/vendors/${GARAGE}`, 'owner')).status).toBe(403)
    expect((await call(`/admin/tiers/vendors/${GARAGE}/hidden`, 'owner', { hidden: true })).status).toBe(403)
  })
})
