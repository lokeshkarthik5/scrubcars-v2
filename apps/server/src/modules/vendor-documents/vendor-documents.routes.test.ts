/**
 * Who may reach a garage's documents, through the real routes and the real
 * auth and tenant middleware. Only the database is stood in for: the seat
 * lookups (membersRepository) and the documents reads are replaced on their
 * objects for these tests and put back afterwards, and the private bucket is
 * "configured" with throwaway keys (presigning is local; nothing is sent).
 *
 * The rule: a garage's documents are its owner seat's (vendor_admin) and a
 * super-admin's. An operator, another garage, a customer and nobody at all
 * get nothing, and while R2_DOCS_BUCKET is unset every route is a 404.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { vendorDocumentsRepository } = await import('./vendor-documents.repository.js')
const { adminDocumentRoutes, garageDocumentRoutes } = await import('./vendor-documents.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000002310'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000002311'
const DOCUMENT = 'e2e00000-0000-4000-8000-000000002320'
const FILE = 'e2e00000-0000-4000-8000-000000002321'
const KEY = `vendors/${GARAGE}/documents/owner_id/0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f.pdf`

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000002301',
  operator: 'e2e00000-0000-4000-8000-000000002302',
  otherOwner: 'e2e00000-0000-4000-8000-000000002304',
  customer: 'e2e00000-0000-4000-8000-000000002303',
  superAdmin: 'e2e00000-0000-4000-8000-000000002305',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const ENV_KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2DocsBucket', 'r2Endpoint'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]))
function documentsOn(on: boolean) {
  const values = env as unknown as Record<string, string | undefined>
  values.r2AccountId = on ? 'test-account' : undefined
  values.r2AccessKeyId = on ? 'test-key' : undefined
  values.r2SecretAccessKey = on ? 'test-secret' : undefined
  values.r2DocsBucket = on ? 'detlio-docs-test' : undefined
  values.r2Endpoint = on ? 'http://localhost:9000' : undefined
}

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

  patch(vendorDocumentsRepository, 'listDocuments', async () => [])
  patch(vendorDocumentsRepository, 'listFiles', async () => [])
  patch(vendorDocumentsRepository, 'findGarage', async (vendorId: string) =>
    [GARAGE, OTHER_GARAGE].includes(vendorId)
      ? { id: vendorId, businessName: 'Garage', deletedAt: null, purgedAt: null }
      : undefined
  )
  // The file exists only through its own garage's document.
  patch(vendorDocumentsRepository, 'findFile', async (vendorId: string, documentId: string, fileId: string) =>
    vendorId === GARAGE && documentId === DOCUMENT && fileId === FILE
      ? { storageKey: KEY, contentType: 'application/pdf' }
      : undefined
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
})

// ─── The app, answering the way app.ts does ──────────────────────────────────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/vendors/me/documents', garageDocumentRoutes)
app.route('/admin/documents', adminDocumentRoutes)

async function cookieFor(who: keyof typeof PEOPLE | 'breakGlass' | null): Promise<Record<string, string>> {
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

async function call(path: string, who: keyof typeof PEOPLE | 'breakGlass' | null, headers: Record<string, string> = {}) {
  const response = await app.request(path, { headers: { ...(await cookieFor(who)), ...headers } })
  const body = (await response.json()) as { code?: string; data?: { url?: string } & Record<string, unknown> }
  return { status: response.status, body, response }
}

const GARAGE_LIST = '/vendors/me/documents'
const GARAGE_LINK = `/vendors/me/documents/${DOCUMENT}/files/${FILE}/link`
const ADMIN_LIST = `/admin/documents/vendors/${GARAGE}`
const ADMIN_LINK = `/admin/documents/vendors/${GARAGE}/${DOCUMENT}/files/${FILE}/link`

describe('while R2_DOCS_BUCKET is unset', () => {
  test('every documents route is a 404 for everyone, before auth', async () => {
    documentsOn(false)
    for (const who of [null, 'owner', 'superAdmin'] as const) {
      for (const path of [GARAGE_LIST, GARAGE_LINK, ADMIN_LIST, ADMIN_LINK]) {
        const { status, body } = await call(path, who)
        expect(status).toBe(404)
        expect(body.code).toBe('NOT_FOUND')
      }
    }
  })

  test('the config says it is off, so the apps hide the section', async () => {
    documentsOn(false)
    expect((await call('/vendors/me/documents/config', 'owner')).body.data?.enabled).toBe(false)
    expect((await call('/admin/documents/config', 'breakGlass')).body.data?.enabled).toBe(false)
  })
})

describe('the garage portal: owner seat only', () => {
  beforeAll(() => documentsOn(true))

  test('the owner lists its documents and gets a five-minute link, not cached', async () => {
    expect((await call(GARAGE_LIST, 'owner')).status).toBe(200)
    const { status, body, response } = await call(GARAGE_LINK, 'owner')
    expect(status).toBe(200)
    expect(body.data?.url).toContain('X-Amz-Expires=300')
    expect(body.data?.url).toContain('detlio-docs-test')
    expect(body.data?.expiresInSeconds).toBe(300)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  test('an operator of the same garage can neither list nor view', async () => {
    for (const path of [GARAGE_LIST, GARAGE_LINK, '/vendors/me/documents/config']) {
      const { status, body } = await call(path, 'operator')
      expect(status).toBe(403)
      expect(body.code).toBe('INSUFFICIENT_ROLE')
    }
  })

  test('another garage’s owner cannot reach this garage’s file, by id or by header', async () => {
    const own = await call(GARAGE_LINK, 'otherOwner')
    expect(own.status).toBe(404)
    expect(own.body.code).toBe('DOCUMENT_FILE_NOT_FOUND')
    const asThisGarage = await call(GARAGE_LINK, 'otherOwner', { 'X-Vendor-Id': GARAGE })
    expect(asThisGarage.status).toBe(404)
    expect(asThisGarage.body.code).toBe('VENDOR_NOT_FOUND')
  })

  test('a customer has no garage to list, and nobody signed in gets a 401', async () => {
    for (const path of [GARAGE_LIST, GARAGE_LINK]) {
      expect((await call(path, 'customer')).status).toBe(404)
      expect((await call(path, null)).status).toBe(401)
    }
  })
})

describe('admin: super-admin only', () => {
  beforeAll(() => documentsOn(true))

  test('a super-admin, and the break-glass login, get the list and a link', async () => {
    for (const who of ['superAdmin', 'breakGlass'] as const) {
      expect((await call(ADMIN_LIST, who)).status).toBe(200)
      const link = await call(ADMIN_LINK, who)
      expect(link.status).toBe(200)
      expect(link.body.data?.url).toContain('X-Amz-Expires=300')
    }
  })

  test('the garage’s own owner, an operator and a customer are refused', async () => {
    for (const who of ['owner', 'operator', 'customer'] as const) {
      for (const path of [ADMIN_LIST, ADMIN_LINK]) {
        const { status, body } = await call(path, who)
        expect(status).toBe(403)
        expect(body.code).toBe('ADMIN_REQUIRED')
      }
    }
    expect((await call(ADMIN_LINK, null)).status).toBe(401)
  })

  test('a file asked for under the wrong garage is not found', async () => {
    const { status, body } = await call(
      `/admin/documents/vendors/${OTHER_GARAGE}/${DOCUMENT}/files/${FILE}/link`,
      'superAdmin'
    )
    expect(status).toBe(404)
    expect(body.code).toBe('DOCUMENT_FILE_NOT_FOUND')
  })
})
