/**
 * Who may read and accept the garage agreement (0063), through the real
 * routes and the real auth and tenant middleware. Only the database is stood
 * in for: the seat lookups (membersRepository) and the agreement reads and
 * writes are replaced on their objects for these tests and put back
 * afterwards (an in-memory version list and acceptances).
 *
 * The rules: the garage's owner seat reads and accepts its own garage's
 * agreement, ticking "I agree" on the latest version; a support session can
 * read but never accept; everything under /admin is a super-admin's, and an
 * upload must be a PDF of up to 10 MB with a key this API made.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { agreementsRepository } = await import('./agreements.repository.js')
const { adminAgreementRoutes, garageAgreementRoutes } = await import('./agreements.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000004610'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000004611'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000004601',
  operator: 'e2e00000-0000-4000-8000-000000004602',
  customer: 'e2e00000-0000-4000-8000-000000004603',
  otherOwner: 'e2e00000-0000-4000-8000-000000004604',
  superAdmin: 'e2e00000-0000-4000-8000-000000004605',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const STORAGE_KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2Bucket', 'r2PublicBaseUrl'] as const
const savedEnv = Object.fromEntries(STORAGE_KEYS.map((key) => [key, env[key]]))

type Version = { id: string; version: number; fileUrl: string; fileKey: string; sizeBytes: number; note: string | null; publishedAt: Date; publishedBy: string; publishedBySub: string }
type Acceptance = { vendorId: string; versionId: string; version: number; userId: string; acceptedByName: string; ipHash: string | null; acceptedAt: Date }

let versions: Version[]
let acceptances: Acceptance[]

const version = (n: number, publishedAt = new Date('2026-10-01T00:00:00Z')): Version => ({
  id: `e2e00000-0000-4000-8000-00000000462${n}`,
  version: n,
  fileKey: `agreements/v${n}-0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f.pdf`,
  fileUrl: `https://cdn.example/agreements/v${n}.pdf`,
  sizeBytes: 120_000,
  note: n > 1 ? 'Pickup clause added' : null,
  publishedAt,
  publishedBy: 'Lokesh',
  publishedBySub: 'admin',
})

beforeAll(() => {
  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((seat) => seat.userId === userId))
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

  const reads = {
    latest: async () => [...versions].sort((a, b) => b.version - a.version)[0],
    listVersions: async () =>
      [...versions]
        .sort((a, b) => b.version - a.version)
        .map((v) => ({ ...v, acceptances: acceptances.filter((a) => a.versionId === v.id).length })),
    acceptedVersions: async (vendorIds: string[]) => {
      const best = new Map<string, number>()
      for (const a of acceptances) {
        if (vendorIds.includes(a.vendorId)) best.set(a.vendorId, Math.max(best.get(a.vendorId) ?? 0, a.version))
      }
      return best
    },
    listAcceptances: async (vendorId: string) =>
      acceptances.filter((a) => a.vendorId === vendorId).sort((a, b) => b.version - a.version),
    findAcceptance: async (vendorId: string, versionId: string) =>
      acceptances.find((a) => a.vendorId === vendorId && a.versionId === versionId),
    findUser: async (userId: string) => (userId === PEOPLE.owner ? { name: 'Owner Oviya', phone: '9000004501' } : undefined),
  }
  for (const [key, value] of Object.entries(reads)) patch(agreementsRepository, key, value)
  patch(agreementsRepository, 'transaction', async (work: (repo: unknown) => Promise<unknown>) =>
    work({
      ...reads,
      lockPublishing: async () => undefined,
      insertAcceptance: async (values: Omit<Acceptance, 'acceptedAt'>) => {
        if (acceptances.some((a) => a.vendorId === values.vendorId && a.versionId === values.versionId)) return undefined
        const row = { ...values, acceptedAt: new Date() }
        acceptances.push(row)
        return row
      },
      insertVersion: async () => {
        throw new Error('not reached in these tests')
      },
      insertAudit: async () => undefined,
    })
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
})

beforeEach(() => {
  versions = [version(1)]
  acceptances = []
  const values = env as unknown as Record<string, string | undefined>
  values.r2AccountId = 'test-account'
  values.r2AccessKeyId = 'test-key'
  values.r2SecretAccessKey = 'test-secret'
  values.r2Bucket = 'detlio-test'
  values.r2PublicBaseUrl = 'https://cdn.example'
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/vendors/me/agreement', garageAgreementRoutes)
app.route('/admin/agreements', adminAgreementRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({
          sub: PEOPLE[who],
          aud: who === 'customer' ? 'customer' : 'vendor',
          isCustomer: who === 'customer',
          isVendorOwner: who !== 'customer',
        })
  return { Cookie: `access_token=${token}` }
}

type Body = { code?: string; message?: string; data?: Record<string, unknown> }

async function call(path: string, who: Who, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await app.request(path, {
    method: init.body === undefined ? 'GET' : 'POST',
    headers: {
      ...(await cookieFor(who)),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  return { status: response.status, body: (await response.json()) as Body }
}

const GARAGE_VIEW = '/vendors/me/agreement'
const ACCEPT = '/vendors/me/agreement/accept'

describe('the garage portal: the owner seat reads and accepts', () => {
  test('the owner reads the latest version, its PDF and that it is not accepted yet', async () => {
    const { status, body } = await call(GARAGE_VIEW, 'owner')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      latest: { version: 1, title: 'Detlio garage agreement v1', url: 'https://cdn.example/agreements/v1.pdf' },
      standing: { status: 'not_accepted', bronze: false, latestVersion: 1 },
      accepted: null,
    })
  })

  test('nothing published yet: nothing to read or accept', async () => {
    versions = []
    const view = await call(GARAGE_VIEW, 'owner')
    expect(view.body.data).toMatchObject({ latest: null, standing: { status: 'not_published' } })
    const accept = await call(ACCEPT, 'owner', { body: { version: 1, agreed: true } })
    expect(accept.status).toBe(404)
    expect(accept.body.code).toBe('AGREEMENT_NOT_PUBLISHED')
  })

  test('an operator, a customer and nobody are turned away', async () => {
    expect((await call(GARAGE_VIEW, 'operator')).status).toBe(403)
    expect((await call(ACCEPT, 'operator', { body: { version: 1, agreed: true } })).status).toBe(403)
    expect((await call(GARAGE_VIEW, null)).status).toBe(401)
    expect([401, 403, 404]).toContain((await call(GARAGE_VIEW, 'customer')).status)
  })

  test('the tick is required: no tick, no acceptance', async () => {
    for (const body of [{ version: 1 }, { version: 1, agreed: false }, { version: 1, agreed: 'yes' }]) {
      const { status } = await call(ACCEPT, 'owner', { body })
      expect(status).toBe(400)
    }
    expect(acceptances).toHaveLength(0)
  })

  test('accepting records the garage, the version, who, and a hash of the address', async () => {
    const { status, body } = await call(ACCEPT, 'owner', {
      body: { version: 1, agreed: true },
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    })
    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      standing: { status: 'accepted', bronze: true },
      accepted: { by: 'Owner Oviya' },
    })
    expect(acceptances).toHaveLength(1)
    expect(acceptances[0]).toMatchObject({
      vendorId: GARAGE,
      version: 1,
      userId: PEOPLE.owner,
      acceptedByName: 'Owner Oviya',
    })
    expect(acceptances[0]!.ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(acceptances[0])).not.toContain('203.0.113.7')
  })

  test('a double tap records it once and answers the same', async () => {
    await call(ACCEPT, 'owner', { body: { version: 1, agreed: true } })
    const again = await call(ACCEPT, 'owner', { body: { version: 1, agreed: true } })
    expect(again.status).toBe(200)
    expect(acceptances).toHaveLength(1)
  })

  test('a newer version published meanwhile must be read first', async () => {
    versions.push(version(2, new Date()))
    const { status, body } = await call(ACCEPT, 'owner', { body: { version: 1, agreed: true } })
    expect(status).toBe(409)
    expect(body.code).toBe('AGREEMENT_VERSION_CHANGED')
  })

  test('after a new version, an earlier acceptance keeps Bronze for 30 days and asks again', async () => {
    await call(ACCEPT, 'owner', { body: { version: 1, agreed: true } })
    versions.push(version(2, new Date()))
    const { body } = await call(GARAGE_VIEW, 'owner')
    expect(body.data).toMatchObject({
      latest: { version: 2, note: 'Pickup clause added' },
      standing: { status: 'grace', bronze: true, acceptedVersion: 1, latestVersion: 2 },
      accepted: null,
    })
    expect((await call(ACCEPT, 'owner', { body: { version: 2, agreed: true } })).status).toBe(200)
    expect(acceptances.map((a) => a.version)).toEqual([1, 2])
  })

  test('another garage’s owner accepts for its own garage only, even naming this one', async () => {
    await call(ACCEPT, 'otherOwner', { body: { version: 1, agreed: true }, headers: { 'X-Vendor-Id': GARAGE } })
    expect(acceptances.filter((a) => a.vendorId === GARAGE)).toHaveLength(0)
  })

  test('a Detlio support session can read it but never accept it for the garage', async () => {
    const read = await call(GARAGE_VIEW, 'superAdmin', { headers: { 'X-Vendor-Id': GARAGE } })
    expect(read.status).toBe(200)
    const accept = await call(ACCEPT, 'superAdmin', {
      body: { version: 1, agreed: true },
      headers: { 'X-Vendor-Id': GARAGE },
    })
    expect(accept.status).toBe(403)
    expect(accept.body.code).toBe('AGREEMENT_GARAGE_ONLY')
    expect(acceptances).toHaveLength(0)
  })
})

describe('admin: super-admin only', () => {
  test('a super-admin and the break-glass login list the versions with their acceptances', async () => {
    acceptances.push({ vendorId: GARAGE, versionId: version(1).id, version: 1, userId: PEOPLE.owner, acceptedByName: 'Owner Oviya', ipHash: null, acceptedAt: new Date() })
    for (const who of ['superAdmin', 'breakGlass'] as const) {
      const { status, body } = await call('/admin/agreements', who)
      expect(status).toBe(200)
      expect(body.data).toMatchObject({ storageReady: true, versions: [{ version: 1, acceptances: 1 }] })
    }
    expect((await call('/admin/agreements', 'owner')).status).toBe(403)
    expect((await call('/admin/agreements', null)).status).toBe(401)
  })

  test('an upload link is only for a PDF of up to 10 MB', async () => {
    const png = await call('/admin/agreements/upload-url', 'superAdmin', { body: { contentType: 'image/png', sizeBytes: 1000 } })
    expect(png.status).toBe(400)
    const big = await call('/admin/agreements/upload-url', 'superAdmin', {
      body: { contentType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1 },
    })
    expect(big.status).toBe(400)
    expect((await call('/admin/agreements/upload-url', 'owner', { body: { contentType: 'application/pdf', sizeBytes: 1000 } })).status).toBe(403)
  })

  test('publishing needs a key this API made for an agreement', async () => {
    for (const key of ['vendors/x/documents/owner_id/a.pdf', 'agreements/../secret.pdf', 'agreements/v2-nope.pdf']) {
      const { status, body } = await call('/admin/agreements', 'superAdmin', { body: { key, note: null } })
      expect(status).toBe(400)
      expect(body.code).toBe('AGREEMENT_KEY_INVALID')
    }
  })

  test('nothing is uploaded or published while storage is not set up', async () => {
    ;(env as unknown as Record<string, string | undefined>).r2Bucket = undefined
    const link = await call('/admin/agreements/upload-url', 'superAdmin', { body: { contentType: 'application/pdf', sizeBytes: 1000 } })
    expect(link.status).toBe(503)
    expect(link.body.code).toBe('STORAGE_NOT_CONFIGURED')
  })
})
