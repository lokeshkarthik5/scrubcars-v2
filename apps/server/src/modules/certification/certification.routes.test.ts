/**
 * Who may reach Detlio Certified, through the real routes and the real auth
 * and tenant middleware. Only the database is stood in for: the seat lookups
 * (membersRepository) and the certification reads and writes are replaced on
 * their objects for these tests and put back afterwards (an in-memory
 * garage, its checks and its certification), and garage documents are "on"
 * with throwaway keys (nothing is sent).
 *
 * The rules: a garage's own standing is its owner seat's, for its own garage
 * only; everything else is a super-admin's. Certify needs a passing check
 * and every standard met, never twice; Revoke needs a certification; a
 * garage in the Bin can be read, not changed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { certificationRepository } = await import('./certification.repository.js')
const { adminCertificationRoutes, garageCertificationRoutes } = await import('./certification.routes.js')

const GARAGE = 'e2e00000-0000-4000-8000-000000002810'
const OTHER_GARAGE = 'e2e00000-0000-4000-8000-000000002811'
const BINNED_GARAGE = 'e2e00000-0000-4000-8000-000000002812'

const PEOPLE = {
  owner: 'e2e00000-0000-4000-8000-000000002801',
  operator: 'e2e00000-0000-4000-8000-000000002802',
  customer: 'e2e00000-0000-4000-8000-000000002803',
  otherOwner: 'e2e00000-0000-4000-8000-000000002804',
  superAdmin: 'e2e00000-0000-4000-8000-000000002805',
}

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

const GARAGES: Record<string, { id: string; businessName: string; status: string; isVerified: boolean; deletedAt: Date | null; purgedAt: Date | null }> = {
  [GARAGE]: { id: GARAGE, businessName: 'Certified Test Garage', status: 'active', isVerified: true, deletedAt: null, purgedAt: null },
  [OTHER_GARAGE]: { id: OTHER_GARAGE, businessName: 'Other Garage', status: 'active', isVerified: true, deletedAt: null, purgedAt: null },
  [BINNED_GARAGE]: {
    id: BINNED_GARAGE,
    businessName: 'Binned Garage',
    status: 'active',
    isVerified: true,
    deletedAt: new Date('2026-10-10T00:00:00Z'),
    purgedAt: null,
  },
}

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

type State = {
  vendorId: string
  certifiedAt: Date | null
  certifiedBy: string | null
  revokedAt: Date | null
  revokedBy: string | null
  revokedReason: string | null
  revokeKind: string | null
  eligible: boolean
  lastEvaluatedAt: Date | null
  ineligibleSince: Date | null
  eligibleAlertedAt: Date | null
}
const states = new Map<string, State>()
const checks: Array<{
  id: string
  vendorId: string
  checkedOn: string
  kind: 'mystery_visit' | 'inspection'
  checkerName: string
  result: 'pass' | 'fail'
  notes: string | null
  recordedBy: string
  recordedBySub: string
  createdAt: Date
}> = []
const audits: Array<{ action: string; actorName: string }> = []
/** Which garages' numbers were read, to show the portal reads only its own. */
const measured: string[] = []

const blank = (vendorId: string): State => ({
  vendorId,
  certifiedAt: null,
  certifiedBy: null,
  revokedAt: null,
  revokedBy: null,
  revokedReason: null,
  revokeKind: null,
  eligible: false,
  lastEvaluatedAt: null,
  ineligibleSince: null,
  eligibleAlertedAt: null,
})

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
    GARAGES[vendorId] ? { id: vendorId } : undefined
  )
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  const reads = {
    findGarage: async (vendorId: string) => GARAGES[vendorId],
    findState: async (vendorId: string) => states.get(vendorId),
    listChecks: async (vendorId: string) => checks.filter((check) => check.vendorId === vendorId),
    listRecentChecks: async (vendorIds: string[], from: string) =>
      checks.filter((check) => vendorIds.includes(check.vendorId) && check.checkedOn >= from),
    // Every garage here meets every measured standard.
    listApprovedDocumentTypes: async (vendorIds: string[]) =>
      vendorIds.flatMap((vendorId) =>
        ['shop_photo', 'owner_id', 'bank_proof', 'agreement'].map((type) => ({ vendorId, type, status: 'approved' }))
      ),
    ratings: async (vendorIds: string[]) => {
      measured.push(...vendorIds)
      return vendorIds.map((vendorId) => ({ vendorId, average: 4.8, count: 14 }))
    },
    completedCounts: async (vendorIds: string[]) => vendorIds.map((vendorId) => ({ vendorId, count: 26 })),
    responseCounts: async (vendorIds: string[]) => vendorIds.map((vendorId) => ({ vendorId, inTime: 24, missed: 1 })),
    complaintCounts: async () => [],
    garageNoShowCounts: async () => [],
    // No confirmed bypass reports (0052): the standard is met.
    bypassStrikeCounts: async () => [],
    // No completed jobs to grade for photos (0045): passes, as nothing to measure.
    photoComplianceJobs: async () => [],
  }
  for (const [key, value] of Object.entries(reads)) patch(certificationRepository, key, value)

  patch(certificationRepository, 'transaction', async (vendorId: string, work: (repo: unknown) => Promise<unknown>) =>
    work({
      ...reads,
      lockCertification: async () => undefined,
      saveEvaluation: async () => undefined,
      certify: async (id: string, values: { certifiedBy: string; now: Date }) => {
        const state = {
          ...(states.get(id) ?? blank(id)),
          certifiedAt: values.now,
          certifiedBy: values.certifiedBy,
          revokedAt: null,
          revokedBy: null,
          revokedReason: null,
          revokeKind: null,
          eligible: true,
        }
        states.set(id, state)
        return state
      },
      revoke: async (id: string, values: { revokedBy: string; revokedReason: string; revokeKind: string; now: Date }) => {
        const state = states.get(id)
        if (!state || !state.certifiedAt || state.revokedAt) return undefined
        Object.assign(state, {
          revokedAt: values.now,
          revokedBy: values.revokedBy,
          revokedReason: values.revokedReason,
          revokeKind: values.revokeKind,
        })
        return state
      },
      insertCheck: async (values: (typeof checks)[number]) => {
        const row = { ...values, id: `e2e00000-0000-4000-8000-0000000028${20 + checks.length}`, createdAt: new Date() }
        checks.push(row)
        return row
      },
      insertAudit: async (entry: { action: string; actorName: string }) => {
        audits.push(entry)
      },
      vendorId,
    })
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
})

beforeEach(() => {
  documentsOn(true)
  states.clear()
  checks.length = 0
  audits.length = 0
  measured.length = 0
})

// ─── The app, answering the way app.ts does ──────────────────────────────────

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/vendors/me/certification', garageCertificationRoutes)
app.route('/admin/certification', adminCertificationRoutes)

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

const GARAGE_VIEW = '/vendors/me/certification'
const ADMIN = (vendorId = GARAGE) => `/admin/certification/vendors/${vendorId}`

const istToday = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
const passingCheck = () => ({
  checkedOn: istToday(),
  kind: 'mystery_visit',
  checkerName: 'Kavya',
  result: 'pass',
  notes: 'Clean bay, explained the job well.',
  actorName: 'Lokesh',
})

// ─── The garage portal ───────────────────────────────────────────────────────

describe('the garage portal: owner seat, own garage only', () => {
  test('the owner reads its own standing, measured from its own numbers', async () => {
    const { status, body } = await call(GARAGE_VIEW, 'owner')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ certified: false, eligible: true })
    expect(measured).toEqual([GARAGE])
  })

  test('it never carries a checker, a note or who certified it', async () => {
    checks.push({ ...passingCheck(), id: 'c1', vendorId: GARAGE, kind: 'inspection', result: 'pass', recordedBySub: 'admin', recordedBy: 'Lokesh', createdAt: new Date() } as (typeof checks)[number])
    states.set(GARAGE, { ...blank(GARAGE), certifiedAt: new Date(), certifiedBy: 'Lokesh' })
    const { body } = await call(GARAGE_VIEW, 'owner')
    expect(body.data).toMatchObject({ certified: true, qualityCheck: { status: 'passed', passedOn: istToday() } })
    const text = JSON.stringify(body.data)
    for (const secret of ['Kavya', 'Clean bay', 'Lokesh', 'checkerName', 'notes', 'certifiedBy']) {
      expect(text).not.toContain(secret)
    }
  })

  test('an operator of the same garage is refused (owner seat only)', async () => {
    const { status, body } = await call(GARAGE_VIEW, 'operator')
    expect(status).toBe(403)
    expect(body.code).toBe('INSUFFICIENT_ROLE')
  })

  test('another garage’s owner reads its own garage, and cannot ask for this one by header', async () => {
    expect((await call(GARAGE_VIEW, 'otherOwner')).status).toBe(200)
    expect(measured).toEqual([OTHER_GARAGE])
    const asThisGarage = await call(GARAGE_VIEW, 'otherOwner', { headers: { 'X-Vendor-Id': GARAGE } })
    expect(asThisGarage.status).toBe(404)
    expect(asThisGarage.body.code).toBe('VENDOR_NOT_FOUND')
  })

  test('a customer has no garage, and nobody signed in gets a 401', async () => {
    expect((await call(GARAGE_VIEW, 'customer')).status).toBe(404)
    expect((await call(GARAGE_VIEW, null)).status).toBe(401)
  })
})

// ─── Admin ───────────────────────────────────────────────────────────────────

describe('admin: super-admin only', () => {
  test('a super-admin, and the break-glass login, read a garage', async () => {
    for (const who of ['superAdmin', 'breakGlass'] as const) {
      const { status, body } = await call(ADMIN(), who)
      expect(status).toBe(200)
      expect(body.data).toMatchObject({ certified: false, certifyBlockedBy: 'no_passing_check' })
    }
  })

  test('the garage’s owner, an operator and a customer are refused every route; nobody gets a 401', async () => {
    const routes: Array<[string, unknown]> = [
      [ADMIN(), undefined],
      [`${ADMIN()}/checks`, passingCheck()],
      [`${ADMIN()}/certify`, { actorName: 'Owner' }],
      [`${ADMIN()}/revoke`, { actorName: 'Owner', reason: 'Not happy with it' }],
    ]
    for (const [path, body] of routes) {
      for (const who of ['owner', 'operator', 'customer'] as const) {
        const answer = await call(path, who, { body })
        expect(answer.status).toBe(403)
        expect(answer.body.code).toBe('ADMIN_REQUIRED')
      }
      expect((await call(path, null, { body })).status).toBe(401)
    }
    expect(checks).toHaveLength(0)
    expect(states.size).toBe(0)
  })

  test('an unknown garage is a 404', async () => {
    const { status, body } = await call(ADMIN('e2e00000-0000-4000-8000-000000002899'), 'superAdmin')
    expect(status).toBe(404)
    expect(body.code).toBe('VENDOR_NOT_FOUND')
  })
})

describe('admin: checks, Certify and Revoke', () => {
  test('Certify is refused until a passing check is recorded, then works once', async () => {
    const early = await call(`${ADMIN()}/certify`, 'superAdmin', { body: { actorName: 'Lokesh' } })
    expect(early.status).toBe(409)
    expect(early.body.code).toBe('CERTIFICATION_NO_PASSING_CHECK')

    const recorded = await call(`${ADMIN()}/checks`, 'superAdmin', { body: passingCheck() })
    expect(recorded.status).toBe(200)
    expect(recorded.body.data).toMatchObject({ certifyBlockedBy: null, qualityCheck: { valid: true } })
    // Signed by the session (0058): the typed name is ignored.
    expect(checks[0]).toMatchObject({ checkerName: 'Kavya', recordedBy: 'Signed-in Sam', recordedBySub: PEOPLE.superAdmin })

    const certified = await call(`${ADMIN()}/certify`, 'superAdmin', { body: { actorName: 'Lokesh' } })
    expect(certified.status).toBe(200)
    expect(certified.body.data).toMatchObject({ certified: true, certifiedBy: 'Signed-in Sam' })
    expect(audits).toEqual([expect.objectContaining({ action: 'garage_certified', actorName: 'Signed-in Sam' })])

    const again = await call(`${ADMIN()}/certify`, 'superAdmin', { body: { actorName: 'Lokesh' } })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('ALREADY_CERTIFIED')
  })

  test('Certify is refused while a standard is not met, naming it', async () => {
    documentsOn(false)
    checks.push({ ...passingCheck(), id: 'c1', vendorId: GARAGE, kind: 'inspection', result: 'pass', recordedBySub: 'admin', recordedBy: 'Lokesh', createdAt: new Date() } as (typeof checks)[number])
    const { status, body } = await call(`${ADMIN()}/certify`, 'superAdmin', { body: { actorName: 'Lokesh' } })
    expect(status).toBe(409)
    expect(body.code).toBe('CERTIFICATION_NOT_ELIGIBLE')
    expect(body.message).toContain('Documents verified')
  })

  test('Revoke needs a reason and a certification, and records who', async () => {
    const none = await call(`${ADMIN()}/revoke`, 'superAdmin', { body: { actorName: 'Lokesh', reason: 'Scratched a car' } })
    expect(none.status).toBe(409)
    expect(none.body.code).toBe('NOT_CERTIFIED')

    states.set(GARAGE, { ...blank(GARAGE), certifiedAt: new Date(), certifiedBy: 'Lokesh' })
    expect((await call(`${ADMIN()}/revoke`, 'superAdmin', { body: { actorName: 'Lokesh' } })).status).toBe(400)
    const revoked = await call(`${ADMIN()}/revoke`, 'superAdmin', {
      body: { actorName: 'Lokesh', reason: 'Scratched a car and hid it' },
    })
    expect(revoked.status).toBe(200)
    expect(revoked.body.data).toMatchObject({
      certified: false,
      revoked: { by: 'Signed-in Sam', reason: 'Scratched a car and hid it', kind: 'revoked' },
    })
    expect(audits.map((entry) => entry.action)).toEqual(['garage_certification_revoked'])
  })

  test('a check: a fail must say what was wrong, no future date, no extra fields', async () => {
    const path = `${ADMIN()}/checks`
    expect((await call(path, 'superAdmin', { body: { ...passingCheck(), result: 'fail', notes: '' } })).status).toBe(400)
    expect((await call(path, 'superAdmin', { body: { ...passingCheck(), certified: true } })).status).toBe(400)
    expect((await call(path, 'superAdmin', { body: { ...passingCheck(), checkedOn: '2026-02-30' } })).status).toBe(400)
    const future = await call(path, 'superAdmin', { body: { ...passingCheck(), checkedOn: '2999-01-01' } })
    expect(future.status).toBe(400)
    expect(future.body.code).toBe('CHECK_DATE_IN_FUTURE')
    expect(checks).toHaveLength(0)
  })

  test('a garage in the Bin can be read, not changed', async () => {
    expect((await call(ADMIN(BINNED_GARAGE), 'superAdmin')).status).toBe(200)
    for (const [suffix, body] of [
      ['checks', passingCheck()],
      ['certify', { actorName: 'Lokesh' }],
      ['revoke', { actorName: 'Lokesh', reason: 'Garage closed down' }],
    ] as const) {
      const answer = await call(`${ADMIN(BINNED_GARAGE)}/${suffix}`, 'superAdmin', { body })
      expect(answer.status).toBe(409)
      expect(answer.body.code).toBe('VENDOR_IN_BIN')
    }
  })
})
