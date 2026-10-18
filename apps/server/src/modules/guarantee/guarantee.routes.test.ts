/**
 * Detlio Guarantee (0051) through the real routes and the real auth and
 * tenant middleware: who may do what, and the switch. Only the database is
 * stood in for (the guarantee repository and the seat lookups, put back
 * afterwards); push and Telegram are off in tests.
 *
 * The rules: while GUARANTEE_ENABLED is off every route but the two /config
 * ones is a 404. A customer claims only on their own booking (anyone else's
 * is a 404, the same as none), with photos from that booking's own claim
 * folder, and is never told which limit they hit. A garage sees and answers
 * only its own claims (the tenant from resolveTenant; another garage's is a
 * 404), the owner seat only; a Detlio support session cannot answer. Admin is
 * super-admin only, and a claim not approved always says why.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { refundsService } = await import('../refunds/refunds.service.js')
const { guaranteeRepository } = await import('./guarantee.repository.js')
const { adminGuaranteeRoutes, customerGuaranteeRoutes, garageGuaranteeRoutes, publicGuaranteeRoutes } = await import(
  './guarantee.routes.js'
)
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

const PEOPLE = {
  customer: id(3101),
  otherCustomer: id(3102),
  owner: id(3103),
  operator: id(3104),
  otherOwner: id(3105),
  superAdmin: id(3106),
}
const GARAGE = id(3110)
const OTHER_GARAGE = id(3111)
const BOOKING = id(3120)
const OTHER_BOOKING = id(3121)
const CLAIM = id(3130)
const OTHER_CLAIM = id(3131)

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

const NOW = new Date()
const HOUR = 60 * 60 * 1000
const photoKey = (bookingId: string, n: number, vendorId = GARAGE) =>
  `vendors/${vendorId}/job-photos/${bookingId}/guarantee/0b9a4c1e-1111-4222-8333-44445555${String(n).padStart(4, '0')}.jpg`

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['guaranteeEnabled', 'r2PublicBaseUrl'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))
function guaranteeOn(on: boolean) {
  envValues.guaranteeEnabled = on
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING,
    userId: PEOPLE.customer,
    vendorId: GARAGE,
    vendorName: 'Marina Auto Spa',
    status: 'completed',
    bookingType: 'dropin',
    scheduledAt: new Date(NOW.getTime() - 4 * HOUR),
    durationMins: 60,
    completedAt: new Date(NOW.getTime() - 2 * HOUR),
    markedTestAt: null,
    guaranteeRedo: false,
    photosWaivedAt: null,
    paymentMethod: 'online',
    vehicleId: id(3140),
    lat: null,
    lng: null,
    address: null,
    originalBookingId: null,
    payment: { status: 'paid', amount: '600.00', creditAmount: '0.00', refundedAmount: null },
    items: [{ serviceId: id(3150), name: 'Exterior Wash', durationMins: 60, sortOrder: 0, category: 'car_wash', pricingType: 'fixed', memberCategories: [] }],
    garagePhotos: { before: 2, after: 2 },
    ...overrides,
  }
}

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAIM,
    bookingId: BOOKING,
    userId: PEOPLE.customer,
    vendorId: GARAGE,
    issues: ['missed_spots'],
    otherText: null,
    status: 'waiting_garage',
    route: 'garage',
    routeReasons: ['garage_photos'],
    garageRespondBy: new Date(NOW.getTime() + 6 * HOUR),
    garageResponse: null,
    garageNote: null,
    garageRespondedAt: null,
    garageRespondedBy: null,
    detlioDecideBy: null,
    decision: null,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    adminNote: 'internal only',
    approvedAt: null,
    redoBookBy: null,
    redoBookingId: null,
    closedAt: null,
    closeReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    photos: [{ id: id(3160), claimId: CLAIM, storageKey: photoKey(BOOKING, 1), url: 'https://cdn/x1.jpg', createdAt: NOW }],
    ...overrides,
  }
}

let bookings: Record<string, ReturnType<typeof bookingRow>> = {}
let claims: Record<string, ReturnType<typeof claimRow>> = {}
let history = { completedBookings: 5, completedBefore: 4, claimsBefore: 0, approvedRecently: 0, undecided: 0 }
let inserted: Array<Record<string, unknown>> = []
let answered: Array<Record<string, unknown>> = []
let decided: Array<Record<string, unknown>> = []
let refundsQueued: string[] = []
let garageListedFor: string[] = []

beforeAll(() => {
  envValues.r2PublicBaseUrl = 'https://cdn.test'

  patch(membersRepository, 'listActiveVendorSeats', async (userId: string) => SEATS.filter((seat) => seat.userId === userId))
  patch(membersRepository, 'findActiveVendorSeat', async (vendorId: string, userId: string) =>
    SEATS.find((seat) => seat.vendorId === vendorId && seat.userId === userId)
  )
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findVendorForSupport', async (vendorId: string) =>
    [GARAGE, OTHER_GARAGE].includes(vendorId) ? { id: vendorId } : undefined
  )
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(guaranteeRepository, 'findClaimableBooking', async (bookingId: string) => bookings[bookingId] ?? null)
  patch(guaranteeRepository, 'findClaimByBooking', async (bookingId: string) =>
    Object.values(claims).find((claim) => claim.bookingId === bookingId)
  )
  patch(guaranteeRepository, 'findClaimById', async (claimId: string) => claims[claimId])
  patch(guaranteeRepository, 'history', async () => history)
  patch(guaranteeRepository, 'readCalendar', async () => ({ pausedAt: null, hours: [], closures: [] }))
  patch(guaranteeRepository, 'redoTimes', async () => new Map())
  patch(guaranteeRepository, 'insertClaim', async (params: {
    booking: ReturnType<typeof bookingRow>
    issues: string[]
    otherText: string | null
    photos: Array<{ key: string; url: string }>
    now: Date
    route: (h: typeof history) => Record<string, unknown>
  }) => {
    if (history.approvedRecently + history.undecided >= 2) return { kind: 'limit_reached' }
    const routed = params.route(history)
    const claim = claimRow({
      ...routed,
      routeReasons: routed.reasons,
      issues: params.issues,
      otherText: params.otherText,
      photos: params.photos.map((photo, i) => ({ id: id(3170 + i), claimId: CLAIM, storageKey: photo.key, url: photo.url, createdAt: params.now })),
    })
    inserted.push({ userId: params.booking.userId, vendorId: params.booking.vendorId, ...routed })
    return { kind: 'created', claim }
  })
  patch(guaranteeRepository, 'listGarageClaims', async (vendorId: string) => {
    garageListedFor.push(vendorId)
    return Object.values(claims).filter((claim) => claim.vendorId === vendorId)
  })
  patch(guaranteeRepository, 'bookingsForClaims', async () => [])
  patch(guaranteeRepository, 'answerAsGarage', async (params: { claimId: string; vendorId: string; response: string; set: Record<string, unknown> }) => {
    const claim = claims[params.claimId]
    if (!claim || claim.vendorId !== params.vendorId || claim.status !== 'waiting_garage') return null
    answered.push(params)
    claims[params.claimId] = { ...claim, ...params.set, garageResponse: params.response } as unknown as ReturnType<typeof claimRow>
    return claims[params.claimId]
  })
  patch(guaranteeRepository, 'listAdminClaims', async () =>
    Object.values(claims).map((claim) => ({ claim, garageName: 'Marina Auto Spa', customerName: 'Priya Raman', customerPhone: '9876543210' }))
  )
  patch(guaranteeRepository, 'historiesFor', async () => new Map())
  patch(guaranteeRepository, 'countByStatus', async () => ({ needs_detlio: 1 }))
  patch(guaranteeRepository, 'listClaimsOfCustomer', async () => [])
  patch(guaranteeRepository, 'decide', async (params: { claimId: string; decision: string; from: string[]; set: Record<string, unknown> }) => {
    const claim = claims[params.claimId]
    if (!claim || !params.from.includes(claim.status)) return { kind: 'changed' }
    decided.push(params)
    claims[params.claimId] = { ...claim, ...params.set } as unknown as ReturnType<typeof claimRow>
    return { kind: 'decided', claim: claims[params.claimId] }
  })
  patch(refundsService, 'queueAutoRefund', (target: { id: string }) => {
    refundsQueued.push(target.id)
  })
})

beforeEach(() => {
  guaranteeOn(true)
  bookings = {
    [BOOKING]: bookingRow(),
    [OTHER_BOOKING]: bookingRow({ id: OTHER_BOOKING, userId: PEOPLE.otherCustomer, vendorId: OTHER_GARAGE }),
  }
  claims = {}
  history = { completedBookings: 5, completedBefore: 4, claimsBefore: 0, approvedRecently: 0, undecided: 0 }
  inserted = []
  answered = []
  decided = []
  refundsQueued = []
  garageListedFor = []
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

// ─── The app, wired the way app.ts, users.routes.ts, vendors.routes.ts and admin.routes.ts wire it ──

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/guarantee', publicGuaranteeRoutes)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me/guarantee', customerGuaranteeRoutes)
app.route('/users', users)
app.route('/vendors/me/guarantee', garageGuaranteeRoutes)
app.route('/admin/guarantee', adminGuaranteeRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const customer = who === 'customer' || who === 'otherCustomer'
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({
          sub: PEOPLE[who],
          aud: customer ? 'customer' : 'vendor',
          isCustomer: customer,
          isVendorOwner: !customer,
        })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Who, body?: unknown, headers: Record<string, string> = {}) {
  const response = await app.request(path, {
    method,
    headers: { ...(await cookieFor(who)), 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; message?: string; data?: Record<string, unknown> }
  return { status: response.status, body: json }
}

const CLAIM_BODY = {
  bookingId: BOOKING,
  issues: ['missed_spots', 'water_marks'],
  photoKeys: [photoKey(BOOKING, 1), photoKey(BOOKING, 2)],
}

// ─── The switch ──────────────────────────────────────────────────────────────

describe('while GUARANTEE_ENABLED is off', () => {
  test('every route but the two /config ones is a 404, before auth', async () => {
    guaranteeOn(false)
    const probes: Array<[string, string, Who]> = [
      ['GET', `/users/me/guarantee/bookings/${BOOKING}`, 'customer'],
      ['POST', '/users/me/guarantee/claims', 'customer'],
      ['GET', '/vendors/me/guarantee/claims', 'owner'],
      ['GET', '/vendors/me/guarantee/claims', null],
      ['POST', `/vendors/me/guarantee/claims/${CLAIM}/accept`, 'owner'],
      ['GET', '/admin/guarantee/claims', 'breakGlass'],
      ['POST', `/admin/guarantee/claims/${CLAIM}/decide`, null],
    ]
    for (const [method, path, who] of probes) {
      const { status, body } = await call(method, path, who, method === 'POST' ? CLAIM_BODY : undefined)
      expect([path, status, body.code]).toEqual([path, 404, 'NOT_FOUND'])
    }
    expect((await call('GET', '/guarantee/config', null)).body.data?.enabled).toBe(false)
    expect((await call('GET', '/admin/guarantee/config', 'breakGlass')).body.data?.enabled).toBe(false)
    expect(inserted).toEqual([])
  })
})

// ─── The customer ────────────────────────────────────────────────────────────

describe('customers: only their own bookings', () => {
  test('their completed job in its window shows the button, with the deadline', async () => {
    const { status, body } = await call('GET', `/users/me/guarantee/bookings/${BOOKING}`, 'customer')
    expect(status).toBe(200)
    expect(body.data?.canClaim).toBe(true)
    expect(body.data?.claimBy).toBe(new Date(bookings[BOOKING]!.completedAt!.getTime() + 48 * HOUR).toISOString())
  })

  test("someone else's booking is a 404, the same as none", async () => {
    expect((await call('GET', `/users/me/guarantee/bookings/${OTHER_BOOKING}`, 'customer')).status).toBe(404)
    expect((await call('POST', '/users/me/guarantee/claims', 'customer', { ...CLAIM_BODY, bookingId: OTHER_BOOKING })).status).toBe(404)
    expect((await call('GET', `/users/me/guarantee/bookings/${id(3199)}`, 'customer')).status).toBe(404)
    expect(inserted).toEqual([])
  })

  test('signed out is a 401; a garage account is not a customer', async () => {
    expect((await call('GET', `/users/me/guarantee/bookings/${BOOKING}`, null)).status).toBe(401)
    expect((await call('GET', `/users/me/guarantee/bookings/${BOOKING}`, 'owner')).status).toBe(403)
  })

  test('the claim is made for the session’s customer; naming anyone else is refused', async () => {
    const sneaky = await call('POST', '/users/me/guarantee/claims', 'customer', { ...CLAIM_BODY, userId: PEOPLE.otherCustomer })
    expect(sneaky.status).toBe(400)
    const { status, body } = await call('POST', '/users/me/guarantee/claims', 'customer', CLAIM_BODY)
    expect(status).toBe(201)
    expect(inserted[0]).toMatchObject({ userId: PEOPLE.customer, vendorId: GARAGE, route: 'garage', status: 'waiting_garage' })
    // The customer never sees the team's note or the route's reasons.
    expect(JSON.stringify(body.data)).not.toContain('internal only')
    expect(body.data).not.toHaveProperty('routeReasons')
    expect(body.data).not.toHaveProperty('adminNote')
  })

  test("photos must be this booking's claim uploads", async () => {
    for (const photoKeys of [
      [photoKey(BOOKING, 1), photoKey(OTHER_BOOKING, 2)],
      [photoKey(BOOKING, 1), photoKey(BOOKING, 2, OTHER_GARAGE)],
      [photoKey(BOOKING, 1), photoKey(BOOKING, 2).replace('/guarantee/', '/customer/')],
    ]) {
      const { status, body } = await call('POST', '/users/me/guarantee/claims', 'customer', { ...CLAIM_BODY, photoKeys })
      expect([status, body.code]).toEqual([400, 'INVALID_CLAIM_PHOTO'])
    }
    // Fewer than two photos never reaches the service.
    expect((await call('POST', '/users/me/guarantee/claims', 'customer', { ...CLAIM_BODY, photoKeys: [photoKey(BOOKING, 1)] })).status).toBe(400)
    expect(inserted).toEqual([])
  })

  test('no garage photos: approved at once', async () => {
    bookings[BOOKING] = bookingRow({ garagePhotos: { before: 0, after: 0 } })
    const { status, body } = await call('POST', '/users/me/guarantee/claims', 'customer', CLAIM_BODY)
    expect(status).toBe(201)
    expect(inserted[0]).toMatchObject({ route: 'auto', status: 'redo_approved' })
    expect(body.data?.status).toBe('redo_approved')
  })

  test('at the limit: refused with a plain line that never names the limit', async () => {
    history = { ...history, approvedRecently: 2 }
    const { status, body } = await call('POST', '/users/me/guarantee/claims', 'customer', CLAIM_BODY)
    expect([status, body.code]).toEqual([409, 'GUARANTEE_NOT_ELIGIBLE'])
    expect(body.message).not.toMatch(/limit|two|6 months/i)
    const view = await call('GET', `/users/me/guarantee/bookings/${BOOKING}`, 'customer')
    expect(view.body.data?.canClaim).toBe(false)
    expect(inserted).toEqual([])
  })

  test("a customer's first booking goes to Detlio even without garage photos", async () => {
    history = { completedBookings: 1, completedBefore: 0, claimsBefore: 0, approvedRecently: 0, undecided: 0 }
    bookings[BOOKING] = bookingRow({ garagePhotos: { before: 0, after: 0 } })
    await call('POST', '/users/me/guarantee/claims', 'customer', CLAIM_BODY)
    expect(inserted[0]).toMatchObject({ route: 'detlio', status: 'needs_detlio' })
  })

  test('past 48 hours, or a redo, is not eligible', async () => {
    bookings[BOOKING] = bookingRow({ completedAt: new Date(NOW.getTime() - 49 * HOUR) })
    expect((await call('POST', '/users/me/guarantee/claims', 'customer', CLAIM_BODY)).body.code).toBe('GUARANTEE_NOT_ELIGIBLE')
    bookings[BOOKING] = bookingRow({ guaranteeRedo: true })
    expect((await call('POST', '/users/me/guarantee/claims', 'customer', CLAIM_BODY)).body.code).toBe('GUARANTEE_NOT_ELIGIBLE')
    expect(inserted).toEqual([])
  })
})

// ─── The garage ──────────────────────────────────────────────────────────────

describe('garages: only their own claims, owner seat only', () => {
  beforeEach(() => {
    claims = {
      [CLAIM]: claimRow(),
      [OTHER_CLAIM]: claimRow({ id: OTHER_CLAIM, bookingId: OTHER_BOOKING, userId: PEOPLE.otherCustomer, vendorId: OTHER_GARAGE }),
    }
  })

  test('the list is always the tenant’s garage', async () => {
    const { status, body } = await call('GET', '/vendors/me/guarantee/claims', 'owner')
    expect(status).toBe(200)
    expect(garageListedFor).toEqual([GARAGE])
    const items = body.data?.items as Array<{ id: string }>
    expect(items.map((item) => item.id)).toEqual([CLAIM])
    // Never the customer's phone or Detlio's internal note.
    expect(JSON.stringify(items)).not.toContain('internal only')
  })

  test('naming another garage by header is a 404, never its claims', async () => {
    const { status } = await call('GET', '/vendors/me/guarantee/claims', 'owner', undefined, { 'X-Vendor-Id': OTHER_GARAGE })
    expect(status).toBe(404)
    expect(garageListedFor).toEqual([])
  })

  test("another garage's claim cannot be answered (404)", async () => {
    const { status } = await call('POST', `/vendors/me/guarantee/claims/${OTHER_CLAIM}/accept`, 'owner')
    expect(status).toBe(404)
    expect(answered).toEqual([])
    expect(claims[OTHER_CLAIM]!.status).toBe('waiting_garage')
  })

  test('an operator cannot (403); a customer has no seat (404)', async () => {
    expect((await call('POST', `/vendors/me/guarantee/claims/${CLAIM}/accept`, 'operator')).status).toBe(403)
    expect((await call('GET', '/vendors/me/guarantee/claims', 'operator')).status).toBe(403)
    expect((await call('GET', '/vendors/me/guarantee/claims', 'customer')).status).toBe(404)
    expect(answered).toEqual([])
  })

  test('a Detlio support session reads but cannot answer (403)', async () => {
    const read = await call('GET', '/vendors/me/guarantee/claims', 'superAdmin', undefined, { 'X-Vendor-Id': GARAGE })
    expect(read.status).toBe(200)
    const answer = await call('POST', `/vendors/me/guarantee/claims/${CLAIM}/accept`, 'superAdmin', undefined, { 'X-Vendor-Id': GARAGE })
    expect([answer.status, answer.body.code]).toEqual([403, 'GUARANTEE_SUPPORT_SESSION'])
    expect(answered).toEqual([])
  })

  test('accept approves a redo; a dispute needs a note and goes to Detlio', async () => {
    const accepted = await call('POST', `/vendors/me/guarantee/claims/${CLAIM}/accept`, 'owner')
    expect(accepted.status).toBe(200)
    expect(claims[CLAIM]!.status).toBe('redo_approved')

    claims[CLAIM] = claimRow()
    expect((await call('POST', `/vendors/me/guarantee/claims/${CLAIM}/dispute`, 'owner', {})).status).toBe(400)
    const disputed = await call('POST', `/vendors/me/guarantee/claims/${CLAIM}/dispute`, 'owner', { note: 'Car was spotless, see photos' })
    expect(disputed.status).toBe(200)
    expect(claims[CLAIM]!.status).toBe('needs_detlio')
  })

  test('a dispute after the 12 hours is refused: the redo is approved', async () => {
    claims[CLAIM] = claimRow({ garageRespondBy: new Date(NOW.getTime() - 1000) })
    const { status, body } = await call('POST', `/vendors/me/guarantee/claims/${CLAIM}/dispute`, 'owner', { note: 'Car was spotless' })
    expect([status, body.code]).toEqual([409, 'GUARANTEE_RESPONSE_TIME_PASSED'])
  })
})

// ─── Admin ───────────────────────────────────────────────────────────────────

describe('admin: super-admin only, decisions with a typed name', () => {
  beforeEach(() => {
    claims = { [CLAIM]: claimRow({ status: 'needs_detlio', route: 'detlio', detlioDecideBy: new Date(NOW.getTime() - HOUR) }) }
  })

  test('customers and garages are refused', async () => {
    expect((await call('GET', '/admin/guarantee/claims', 'customer')).status).toBe(403)
    expect((await call('GET', '/admin/guarantee/claims', 'owner')).status).toBe(403)
    expect((await call('GET', '/admin/guarantee/claims', null)).status).toBe(401)
    expect((await call('POST', `/admin/guarantee/claims/${CLAIM}/decide`, 'owner', { decision: 'redo', actorName: 'Ravi' })).status).toBe(403)
    expect(decided).toEqual([])
  })

  test('the list shows overdue claims and the customer’s figures', async () => {
    const { status, body } = await call('GET', '/admin/guarantee/claims?tab=needs_decision', 'breakGlass')
    expect(status).toBe(200)
    const [row] = body.data?.items as Array<{ overdue: boolean; customerFigures: { claimsLeft: number } }>
    expect(row!.overdue).toBe(true)
    expect(row!.customerFigures.claimsLeft).toBe(2)
  })

  test('not approved needs a reason the customer reads, and a typed name', async () => {
    expect((await call('POST', `/admin/guarantee/claims/${CLAIM}/decide`, 'superAdmin', { decision: 'reject', actorName: 'Ravi' })).status).toBe(400)
    expect((await call('POST', `/admin/guarantee/claims/${CLAIM}/decide`, 'superAdmin', { decision: 'redo' })).status).toBe(400)
    const ok = await call('POST', `/admin/guarantee/claims/${CLAIM}/decide`, 'superAdmin', {
      decision: 'reject',
      actorName: 'Ravi',
      reason: 'The photos show the same car, clean.',
    })
    expect(ok.status).toBe(200)
    expect(claims[CLAIM]!.status).toBe('rejected')
    expect(refundsQueued).toEqual([])
  })

  test('a refund instead queues the refund through lib/refunds.ts, once', async () => {
    const { status } = await call('POST', `/admin/guarantee/claims/${CLAIM}/decide`, 'breakGlass', { decision: 'refund', actorName: 'Ravi' })
    expect(status).toBe(200)
    expect(decided[0]).toMatchObject({ decision: 'refund', from: ['waiting_garage', 'needs_detlio', 'redo_approved'] })
    expect(refundsQueued).toEqual([BOOKING])
    // Again: the claim is closed, nothing more is decided or queued.
    const again = await call('POST', `/admin/guarantee/claims/${CLAIM}/decide`, 'breakGlass', { decision: 'refund', actorName: 'Ravi' })
    expect(again.status).toBe(409)
    expect(refundsQueued).toEqual([BOOKING])
  })
})
