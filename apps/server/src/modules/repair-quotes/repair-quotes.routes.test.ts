/**
 * Repair & bodywork quotes (0075) through the real routes and the real auth
 * and tenant middleware. Only the database is stood in for (the repository
 * and the seat lookups, put back afterwards), with checkout and the AI
 * reader replaced too; push is off in tests.
 *
 * The rules: while REPAIR_QUOTES_ENABLED is off every route but the public
 * /config is a 404. A customer acts only on their own requests (anyone
 * else's is a 404) with media from their own folder; a request goes to the
 * nearest garages that take repair quotes, each with its own deadline; the
 * AI brief sends only the pictures and the line, and a failure is said so
 * the customer can write it. A garage sees only its own quotes, never the
 * customer's name or phone, answers once, in time, while the request is
 * open. Booking a visit goes through checkout's own path for the garage's
 * free inspection service, and only from a quote. Admin is super-admin only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError, AiUnavailableError } = await (async () => ({
  ...(await import('../../lib/errors.js')),
  ...(await import('../../lib/ai.js')),
}))()
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { membersRepository } = await import('../members/members.repository.js')
const { bookingRequestsRepository } = await import('../booking-requests/booking-requests.repository.js')
const { bookingIntentsService } = await import('../booking-intents/booking-intents.service.js')
const { repairQuotesRepository } = await import('./repair-quotes.repository.js')
const { setBriefReaderForTests } = await import('./repair-quotes.service.js')
const { repairMediaOwner } = await import('../../lib/job-photo-storage.js')
const { FAKE_BRIEF_READING } = await import('../../lib/repair-quote-brief.js')
const { adminRepairQuoteRoutes, customerRepairQuoteRoutes, garageRepairQuoteRoutes, publicRepairQuoteRoutes } = await import(
  './repair-quotes.routes.js'
)
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

type RequestRow = NonNullable<Awaited<ReturnType<typeof repairQuotesRepository.findRequest>>>
type QuoteRow = Awaited<ReturnType<typeof repairQuotesRepository.answer>>

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

const PEOPLE = {
  customer: id(7501),
  otherCustomer: id(7502),
  owner: id(7503),
  operator: id(7504),
  otherOwner: id(7505),
  superAdmin: id(7506),
}
const GARAGE = id(7510)
const OTHER_GARAGE = id(7511)
const FAR_GARAGE = id(7512)
const VEHICLE = id(7520)
const REQUEST = id(7530)
const OTHER_REQUEST = id(7531)
const SERVICE = id(7540)
const BOOKING = id(7545)

const SEATS: Array<{ userId: string; vendorId: string; role: 'vendor_admin' | 'vendor_operator' }> = [
  { userId: PEOPLE.owner, vendorId: GARAGE, role: 'vendor_admin' },
  { userId: PEOPLE.operator, vendorId: GARAGE, role: 'vendor_operator' },
  { userId: PEOPLE.otherOwner, vendorId: OTHER_GARAGE, role: 'vendor_admin' },
]

const NOW = new Date()
const HOUR = 60 * 60 * 1000
const media = (userId: string, n: number, ext: string) => `repair-quotes/${repairMediaOwner(userId)}/0b9a4c1e-1111-4222-8333-44445555${String(n).padStart(4, '0')}.${ext}`

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['repairQuotesEnabled', 'r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2DocsBucket', 'r2Endpoint'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))
const on = (value: boolean) => {
  envValues.repairQuotesEnabled = value
}

function requestRow(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: REQUEST,
    userId: PEOPLE.customer,
    vehicleId: VEHICLE,
    vehicleLabel: 'Maruti Swift',
    vehicleType: 'hatchback',
    lat: 13.08,
    lng: 80.27,
    area: 'Anna Nagar',
    note: 'Scraped a pillar while parking',
    brief: 'Front bumper, left side: deep scratch with a small dent, paint damaged.',
    damageArea: 'Front bumper, left side',
    damageLabel: 'Scratch + small dent',
    briefSource: 'ai',
    box: { image: 0, x: 0.4, y: 0.5, w: 0.3, h: 0.2 },
    videoKey: media(PEOPLE.customer, 1, 'mp4'),
    videoSecs: 22,
    photos: [{ key: media(PEOPLE.customer, 2, 'jpg'), kind: 'frame' }],
    status: 'open',
    closesAt: new Date(NOW.getTime() + 40 * HOUR),
    bookedQuoteId: null,
    cancelledAt: null,
    createdAt: new Date(NOW.getTime() - 8 * HOUR),
    updatedAt: new Date(NOW.getTime() - 8 * HOUR),
    ...overrides,
  } as RequestRow
}

type Quote = NonNullable<QuoteRow>
function quoteRow(overrides: Partial<Quote> = {}): Quote {
  return {
    id: id(7550),
    requestId: REQUEST,
    vendorId: GARAGE,
    distanceKm: '2.1',
    respondBy: new Date(NOW.getTime() + 3 * HOUR),
    status: 'waiting',
    priceFrom: null,
    priceTo: null,
    days: null,
    needsInspection: null,
    note: null,
    declineReason: null,
    answeredAt: null,
    answeredBy: null,
    bookingId: null,
    createdAt: new Date(NOW.getTime() - 8 * HOUR),
    ...overrides,
  } as Quote
}

let requests: Record<string, RequestRow> = {}
let quotes: Quote[] = []
let candidates: Array<{ vendorId: string; businessName: string; distanceM: number }> = []
let created: Array<{ request: Record<string, unknown>; quotes: Array<Record<string, unknown>> }> = []
let intents: Array<Record<string, unknown>> = []
let setEnabled: Array<[string, boolean]> = []
let bookable = true
/** What checkout refuses with next, if anything (its own 409s). */
let intentRefusal: InstanceType<typeof AppError> | null = null
let staleReads = 0
let readerCalls: Array<{ text?: string; files: number }> = []

beforeAll(() => {
  Object.assign(envValues, {
    r2AccountId: 'acct',
    r2AccessKeyId: 'key',
    r2SecretAccessKey: 'secret',
    r2DocsBucket: 'detlio-docs-test',
    r2Endpoint: undefined,
  })
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
  patch(membersRepository, 'findVendorForSupport', async () => undefined)
  patch(membersRepository, 'logInternalAccess', async () => undefined)

  patch(bookingRequestsRepository, 'findVehicle', async (userId: string, vehicleId: string) =>
    userId === PEOPLE.customer && vehicleId === VEHICLE
      ? { id: VEHICLE, userId, make: 'Maruti', model: 'Swift', vehicleType: 'hatchback' }
      : undefined
  )
  patch(bookingRequestsRepository, 'listZones', async () => [
    { id: 'z', slug: 'anna-nagar', name: 'Anna Nagar', lat: 13.085, lng: 80.21, priority: true, target: 5, liveAt: null, createdAt: NOW, updatedAt: NOW },
  ])

  const r = repairQuotesRepository
  patch(r, 'nearestGarages', async () => candidates)
  patch(r, 'calendar', async () => ({
    pausedAt: null,
    hours: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '00:00:00', closeTime: '23:59:00', isClosed: false })),
    closures: [],
  }))
  patch(r, 'createRequest', async (input: { request: Record<string, unknown>; quotes: Array<Record<string, unknown>>; maxOpen: number }) => {
    const open = Object.values(requests).filter((row) => row.userId === input.request.userId && row.status === 'open').length
    if (open >= input.maxOpen) return null
    created.push(input)
    const request = requestRow({ ...(input.request as Partial<RequestRow>), id: id(7560) })
    requests[request.id] = request
    const rows = input.quotes.map((quote, i) => quoteRow({ ...(quote as Partial<Quote>), id: id(7570 + i), requestId: request.id }))
    quotes.push(...rows)
    return { request, quotes: rows }
  })
  patch(r, 'findRequest', async (requestId: string) => {
    // A read from before another tap's claim landed: the request still open.
    if (staleReads > 0 && requests[requestId]) {
      staleReads -= 1
      return { ...requests[requestId]!, status: 'open', bookedQuoteId: null }
    }
    return requests[requestId]
  })
  patch(r, 'listRequestsForUser', async (userId: string) => Object.values(requests).filter((row) => row.userId === userId))
  patch(r, 'quotesFor', async (requestIds: string[]) =>
    quotes
      .filter((quote) => requestIds.includes(quote.requestId))
      .map((quote) => ({
        quote,
        garage: { id: quote.vendorId, name: quote.vendorId === GARAGE ? 'Murugan Motors' : 'AutoKraft Body Shop', ratingAverage: 4.8, ratingCount: 126 },
      }))
  )
  patch(r, 'badgeJobs', async (vendorIds: string[]) =>
    vendorIds.includes(GARAGE)
      ? [4200, 5000, 4500].map((billTotal) => ({ vendorId: GARAGE, priceFrom: 4000, priceTo: 5500, completed: true, billTotal }))
      : []
  )
  patch(r, 'cancelRequest', async (requestId: string, userId: string, now: Date) => {
    const row = requests[requestId]
    if (!row || row.userId !== userId || row.status !== 'open' || row.closesAt <= now) return null
    requests[requestId] = { ...row, status: 'cancelled', cancelledAt: now }
    return requests[requestId]
  })
  patch(r, 'findQuoteForGarage', async (quoteId: string, vendorId: string) => {
    const quote = quotes.find((q) => q.id === quoteId && q.vendorId === vendorId)
    return quote ? { quote, request: requests[quote.requestId]! } : undefined
  })
  patch(r, 'listForGarage', async (vendorId: string) =>
    quotes.filter((quote) => quote.vendorId === vendorId).map((quote) => ({ quote, request: requests[quote.requestId]! }))
  )
  patch(r, 'waitingCount', async (vendorId: string) => quotes.filter((q) => q.vendorId === vendorId && q.status === 'waiting').length)
  patch(r, 'answer', async (input: { quoteId: string; vendorId: string; userId: string; now: Date; answer: Record<string, unknown> }) => {
    const at = quotes.findIndex((q) => q.id === input.quoteId && q.vendorId === input.vendorId && q.status === 'waiting')
    if (at < 0) return null
    const { canDo, reason, ...rest } = input.answer as { canDo: boolean; reason?: string | null }
    quotes[at] = {
      ...quotes[at]!,
      ...(canDo ? { status: 'quoted', ...rest } : { status: 'declined', declineReason: reason ?? null }),
      answeredAt: input.now,
      answeredBy: input.userId,
    } as Quote
    return quotes[at]!
  })
  patch(r, 'inspectionServiceFor', async (vendorId: string) =>
    bookable && (vendorId === GARAGE || vendorId === OTHER_GARAGE) ? { id: SERVICE } : null
  )
  // The same conditions as the SQL: the customer's, open, in time, from a "Can do" of it.
  patch(r, 'claimForBooking', async (input: { requestId: string; quoteId: string; userId: string; now: Date }) => {
    const row = requests[input.requestId]
    const quote = quotes.find((q) => q.id === input.quoteId && q.requestId === input.requestId && q.status === 'quoted')
    if (!row || row.userId !== input.userId || row.status !== 'open' || row.closesAt <= input.now || !quote) return false
    requests[input.requestId] = { ...row, status: 'booked', bookedQuoteId: input.quoteId }
    return true
  })
  patch(r, 'releaseBookingClaim', async (input: { requestId: string; quoteId: string }) => {
    const row = requests[input.requestId]
    const quote = quotes.find((q) => q.id === input.quoteId)
    if (!row || row.status !== 'booked' || row.bookedQuoteId !== input.quoteId || quote?.bookingId) return
    requests[input.requestId] = { ...row, status: 'open', bookedQuoteId: null }
  })
  patch(r, 'markBooked', async (input: { requestId: string; quoteId: string; bookingId: string }) => {
    const at = quotes.findIndex((q) => q.id === input.quoteId && q.requestId === input.requestId && q.status === 'quoted')
    if (at < 0) return false
    quotes[at] = { ...quotes[at]!, bookingId: input.bookingId }
    return true
  })
  patch(r, 'listForAdmin', async () =>
    Object.values(requests).map((request) => ({ request, customerName: 'Karthik R', customerPhone: '9876544417' }))
  )
  patch(r, 'garagePhones', async () => new Map([[GARAGE, '9000007510']]))
  patch(r, 'garageSetting', async (vendorId: string) => (vendorId === GARAGE ? { enabled: false, bookable } : undefined))
  patch(r, 'garageStats', async () => ({ asked: 9, answeredInTime: 8 }))
  patch(r, 'setGarageEnabled', async (vendorId: string, enabled: boolean) => {
    setEnabled.push([vendorId, enabled])
    return true
  })
  patch(bookingIntentsService, 'createIntent', async (userId: string, input: Record<string, unknown>) => {
    intents.push({ userId, ...input })
    if (intentRefusal) throw intentRefusal
    return { intentId: id(7546), orderId: null, amount: 0, currency: 'INR', keyId: null, creditAmount: '0.00', paidWithCredit: false, free: true, bookingId: BOOKING }
  })
})

beforeEach(() => {
  on(true)
  requests = {
    [REQUEST]: requestRow(),
    [OTHER_REQUEST]: requestRow({ id: OTHER_REQUEST, userId: PEOPLE.otherCustomer }),
  }
  quotes = [
    quoteRow(),
    quoteRow({ id: id(7551), vendorId: OTHER_GARAGE, distanceKm: '3.4' }),
    quoteRow({ id: id(7552), requestId: OTHER_REQUEST }),
  ]
  candidates = [
    { vendorId: GARAGE, businessName: 'Murugan Motors', distanceM: 2140 },
    { vendorId: OTHER_GARAGE, businessName: 'AutoKraft Body Shop', distanceM: 3390 },
  ]
  created = []
  intents = []
  setEnabled = []
  bookable = true
  intentRefusal = null
  staleReads = 0
  readerCalls = []
  setBriefReaderForTests({
    read: async (request) => {
      readerCalls.push({ text: request.text, files: request.files.length })
      return JSON.stringify(FAKE_BRIEF_READING)
    },
  })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
  setBriefReaderForTests(undefined)
})

// ─── The app, wired the way app.ts, users.routes.ts, vendors.routes.ts and admin.routes.ts wire it ──

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/repair-quotes', publicRepairQuoteRoutes)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me/repair-quotes', customerRepairQuoteRoutes)
app.route('/users', users)
app.route('/vendors/me/repair-quotes', garageRepairQuoteRoutes)
app.route('/admin/repair-quotes', adminRepairQuoteRoutes)

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: string, path: string, who: Who, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await app.request(path, {
    method,
    headers: { ...(await cookieFor(who)), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).toString('base64')

const CREATE = {
  vehicleId: VEHICLE,
  lat: 13.08,
  lng: 80.21,
  note: 'Scraped a pillar while parking',
  brief: {
    text: 'Front bumper, left side: deep scratch with a small dent, paint damaged.',
    area: 'Front bumper, left side',
    damage: 'Scratch + small dent',
    box: { image: 0, x: 0.44, y: 0.52, w: 0.42, h: 0.3 },
    source: 'ai',
  },
  video: { key: media(PEOPLE.customer, 1, 'mp4'), secs: 22 },
  photos: [
    { key: media(PEOPLE.customer, 2, 'jpg'), kind: 'frame' },
    { key: media(PEOPLE.customer, 3, 'jpg'), kind: 'photo' },
  ],
}

// ─── The switch ──────────────────────────────────────────────────────────────

describe('while REPAIR_QUOTES_ENABLED is off', () => {
  test('every route but /config is a 404', async () => {
    on(false)
    const probes: Array<[string, string, Who]> = [
      ['GET', '/users/me/repair-quotes', 'customer'],
      ['POST', '/users/me/repair-quotes', 'customer'],
      ['POST', '/users/me/repair-quotes/brief', 'customer'],
      ['GET', '/vendors/me/repair-quotes', 'owner'],
      ['GET', '/vendors/me/repair-quotes/count', null],
      ['GET', '/admin/repair-quotes', 'breakGlass'],
      ['GET', `/admin/repair-quotes/vendors/${GARAGE}`, 'breakGlass'],
    ]
    for (const [method, path, who] of probes) {
      const { status, body } = await call(method, path, who, method === 'POST' ? CREATE : undefined)
      expect([path, status, body.code]).toEqual([path, 404, 'NOT_FOUND'])
    }
    const config = await call('GET', '/repair-quotes/config', null)
    expect(config.body.data).toMatchObject({ enabled: false, maxGarages: 5, answerHours: 4, openHours: 48, maxPhotos: 3 })
    expect(created).toEqual([])
  })

  test('on: /config says so', async () => {
    expect((await call('GET', '/repair-quotes/config', null)).body.data.enabled).toBe(true)
  })
})

// ─── The customer ────────────────────────────────────────────────────────────

describe('customers: uploads and the AI brief', () => {
  test('an upload link goes to their own private folder; too large is refused', async () => {
    const ok = await call('POST', '/users/me/repair-quotes/upload-url', 'customer', { kind: 'video', contentType: 'video/mp4', sizeBytes: 20_000_000 })
    expect(ok.status).toBe(200)
    expect(ok.body.data.key).toStartWith(`repair-quotes/${repairMediaOwner(PEOPLE.customer)}/`)
    expect(ok.body.data.key).not.toContain(PEOPLE.customer)
    expect(ok.body.data.uploadUrl).toContain('detlio-docs-test')
    const big = await call('POST', '/users/me/repair-quotes/upload-url', 'customer', { kind: 'video', contentType: 'video/mp4', sizeBytes: 70_000_000 })
    expect(big.status).toBe(400)
  })

  test('the brief sends only the pictures and the customer’s line', async () => {
    const { status, body } = await call('POST', '/users/me/repair-quotes/brief', 'customer', {
      note: 'Scraped a pillar while parking',
      images: [{ mimeType: 'image/jpeg', dataBase64: JPEG }, { mimeType: 'image/jpeg', dataBase64: JPEG }],
    })
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ text: FAKE_BRIEF_READING.brief, unclear: true, box: { image: 0 } })
    expect(readerCalls).toEqual([{ text: expect.stringContaining('Scraped a pillar while parking'), files: 2 }])
  })

  test('anything else in the body is refused (no name, place or id rides along)', async () => {
    const { status } = await call('POST', '/users/me/repair-quotes/brief', 'customer', {
      note: 'Scraped',
      images: [{ mimeType: 'image/jpeg', dataBase64: JPEG }],
      phone: '9876543210',
    })
    expect(status).toBe(400)
    expect(readerCalls).toEqual([])
  })

  test('a picture that is not what it says is refused before the AI', async () => {
    const { status, body } = await call('POST', '/users/me/repair-quotes/brief', 'customer', {
      note: 'Scraped',
      images: [{ mimeType: 'image/png', dataBase64: JPEG }],
    })
    expect([status, body.code]).toEqual([400, 'BRIEF_BAD_IMAGE'])
  })

  test('an AI failure or an unusable answer is said, so the customer writes it', async () => {
    setBriefReaderForTests({ read: async () => { throw new AiUnavailableError('down') } })
    const down = await call('POST', '/users/me/repair-quotes/brief', 'customer', { note: 'x', images: [{ mimeType: 'image/jpeg', dataBase64: JPEG }] })
    expect([down.status, down.body.code]).toEqual([503, 'AI_UNAVAILABLE'])
    setBriefReaderForTests({ read: async () => JSON.stringify({ ...FAKE_BRIEF_READING, readable: false }) })
    const unreadable = await call('POST', '/users/me/repair-quotes/brief', 'customer', { note: 'x', images: [{ mimeType: 'image/jpeg', dataBase64: JPEG }] })
    expect([unreadable.status, unreadable.body.code]).toEqual([422, 'BRIEF_UNREADABLE'])
    setBriefReaderForTests(null)
    const off = await call('POST', '/users/me/repair-quotes/brief', 'customer', { note: 'x', images: [{ mimeType: 'image/jpeg', dataBase64: JPEG }] })
    expect([off.status, off.body.code]).toEqual([503, 'AI_UNAVAILABLE'])
  })
})

describe('customers: sending, reading and cancelling', () => {
  test('sent to the nearest garages, each with 4 working hours, closing in 48', async () => {
    requests = {}
    const { status, body } = await call('POST', '/users/me/repair-quotes', 'customer', CREATE)
    expect(status).toBe(201)
    expect(created).toHaveLength(1)
    const sent = created[0]!
    expect(sent.request).toMatchObject({ userId: PEOPLE.customer, vehicleLabel: 'Maruti Swift', area: 'Anna Nagar', briefSource: 'ai' })
    expect(sent.quotes.map((q) => [q.vendorId, q.distanceKm])).toEqual([[GARAGE, '2.1'], [OTHER_GARAGE, '3.4']])
    const askedAt = (sent.request.createdAt as Date).getTime()
    expect((sent.request.closesAt as Date).getTime() - askedAt).toBe(48 * HOUR)
    for (const quote of sent.quotes) expect((quote.respondBy as Date).getTime() - askedAt).toBe(4 * HOUR)
    expect(body.data).toMatchObject({ state: 'open', sentTo: 2, answerWindowMins: 240 })
    expect(body.data.video.url).toContain('X-Amz-Signature')
  })

  test('another customer’s media, or none, is refused', async () => {
    const theirs = await call('POST', '/users/me/repair-quotes', 'customer', {
      ...CREATE,
      video: { key: media(PEOPLE.otherCustomer, 1, 'mp4'), secs: 22 },
    })
    expect([theirs.status, theirs.body.code]).toEqual([400, 'REPAIR_MEDIA_INVALID'])
    const nothing = await call('POST', '/users/me/repair-quotes', 'customer', { ...CREATE, video: null, photos: [] })
    expect(nothing.status).toBe(400)
    const long = await call('POST', '/users/me/repair-quotes', 'customer', { ...CREATE, video: { ...CREATE.video, secs: 45 } })
    expect(long.status).toBe(400)
    expect(created).toEqual([])
  })

  test('no garage near them, or two open already, is said', async () => {
    candidates = []
    const none = await call('POST', '/users/me/repair-quotes', 'customer', CREATE)
    expect([none.status, none.body.code]).toEqual([409, 'REPAIR_QUOTE_NO_GARAGE'])
    candidates = [{ vendorId: GARAGE, businessName: 'Murugan Motors', distanceM: 2000 }]
    requests[id(7599)] = requestRow({ id: id(7599) })
    const limit = await call('POST', '/users/me/repair-quotes', 'customer', CREATE)
    expect([limit.status, limit.body.code]).toEqual([409, 'REPAIR_QUOTE_LIMIT'])
  })

  test('their own request reads with each garage; someone else’s is a 404', async () => {
    const mine = await call('GET', `/users/me/repair-quotes/${REQUEST}`, 'customer')
    expect(mine.status).toBe(200)
    expect(mine.body.data.quotes.map((q: { garage: { name: string }; state: string; billsMatchQuotes: boolean }) => [q.garage.name, q.state, q.billsMatchQuotes])).toEqual([
      ['Murugan Motors', 'waiting', true],
      ['AutoKraft Body Shop', 'waiting', false],
    ])
    expect((await call('GET', `/users/me/repair-quotes/${OTHER_REQUEST}`, 'customer')).status).toBe(404)
    expect((await call('POST', `/users/me/repair-quotes/${OTHER_REQUEST}/cancel`, 'customer')).status).toBe(404)
  })

  test('cancel: only while open', async () => {
    const first = await call('POST', `/users/me/repair-quotes/${REQUEST}/cancel`, 'customer')
    expect([first.status, first.body.data.state]).toEqual([200, 'cancelled'])
    const again = await call('POST', `/users/me/repair-quotes/${REQUEST}/cancel`, 'customer')
    expect([again.status, again.body.code]).toEqual([409, 'REPAIR_QUOTE_NOT_OPEN'])
  })
})

// ─── The garage ──────────────────────────────────────────────────────────────

describe('garages: their own quotes only', () => {
  test('the list carries the brief and media, never the customer’s name or phone', async () => {
    const { status, body } = await call('GET', '/vendors/me/repair-quotes?scope=open', 'operator')
    expect(status).toBe(200)
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([id(7550), id(7552)])
    const text = JSON.stringify(body.data)
    expect(text).not.toContain('Karthik')
    expect(text).not.toContain('9876544417')
    expect(text).not.toContain(PEOPLE.customer)
    expect(body.data.items[0]).toMatchObject({ title: 'Front bumper, left side', area: 'Anna Nagar', distanceKm: 2.1, state: 'waiting' })
  })

  test('Can do with an estimate, once; the customer can then book', async () => {
    const answer = { canDo: true, priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true, note: 'Can match the paint.' }
    const first = await call('POST', `/vendors/me/repair-quotes/${id(7550)}/answer`, 'owner', answer)
    expect(first.status).toBe(200)
    expect(first.body.data).toMatchObject({ state: 'quoted', priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true })
    const again = await call('POST', `/vendors/me/repair-quotes/${id(7550)}/answer`, 'owner', answer)
    expect([again.status, again.body.code]).toEqual([409, 'REPAIR_QUOTE_ANSWERED'])
  })

  test('a price to below the price from is refused', async () => {
    const bad = await call('POST', `/vendors/me/repair-quotes/${id(7550)}/answer`, 'owner', {
      canDo: true, priceFrom: 5000, priceTo: 4000, days: 2, needsInspection: false,
    })
    expect(bad.status).toBe(400)
  })

  test('another garage’s quote is a 404; after its time, or once closed, it is refused', async () => {
    const theirs = await call('POST', `/vendors/me/repair-quotes/${id(7551)}/answer`, 'owner', { canDo: false })
    expect(theirs.status).toBe(404)
    quotes[0] = { ...quotes[0]!, respondBy: new Date(Date.now() - 1000) }
    const late = await call('POST', `/vendors/me/repair-quotes/${id(7550)}/answer`, 'owner', { canDo: false })
    expect([late.status, late.body.code]).toEqual([409, 'REPAIR_QUOTE_TIME_PASSED'])
    quotes[0] = { ...quotes[0]!, respondBy: new Date(Date.now() + HOUR) }
    requests[REQUEST] = requestRow({ status: 'cancelled', cancelledAt: NOW })
    const closed = await call('POST', `/vendors/me/repair-quotes/${id(7550)}/answer`, 'owner', { canDo: false, reason: 'No paint booth' })
    expect([closed.status, closed.body.code]).toEqual([409, 'REPAIR_QUOTE_CLOSED'])
  })

  test('Can’t do, with an optional reason', async () => {
    const { status, body } = await call('POST', `/vendors/me/repair-quotes/${id(7550)}/answer`, 'operator', { canDo: false, reason: 'We don’t do paint work.' })
    expect([status, body.data.state, body.data.declineReason]).toEqual([200, 'declined', 'We don’t do paint work.'])
  })
})

// ─── Booking a visit ─────────────────────────────────────────────────────────

describe('booking a visit from a quote', () => {
  test('only from a quote: a garage still waiting is refused', async () => {
    const { status, body } = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', {
      scheduledAt: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
    })
    expect([status, body.code]).toEqual([409, 'REPAIR_QUOTE_NOT_QUOTED'])
    expect(intents).toEqual([])
  })

  test('books through checkout: the free inspection service, at the garage, with their car', async () => {
    quotes[0] = { ...quotes[0]!, status: 'quoted', priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true, answeredAt: NOW }
    const at = new Date(NOW.getTime() + 24 * HOUR).toISOString()
    const { status, body } = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', { scheduledAt: at })
    expect(status).toBe(201)
    expect(body.data).toEqual({ bookingId: BOOKING })
    expect(intents).toEqual([
      expect.objectContaining({
        userId: PEOPLE.customer,
        vendorId: GARAGE,
        serviceIds: [SERVICE],
        vehicleId: VEHICLE,
        bookingType: 'dropin',
        scheduledAt: at,
      }),
    ])
    expect(requests[REQUEST]!.status).toBe('booked')
    const after = await call('GET', `/users/me/repair-quotes/${REQUEST}`, 'customer')
    expect(after.body.data).toMatchObject({ state: 'booked', bookingId: BOOKING })
  })

  test('one request is one visit: a second tap, or another garage’s quote, is refused before checkout', async () => {
    quotes[0] = { ...quotes[0]!, status: 'quoted', priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true, answeredAt: NOW }
    quotes[1] = { ...quotes[1]!, status: 'quoted', priceFrom: 3800, priceTo: 5000, days: 3, needsInspection: false, answeredAt: NOW }
    const body = { scheduledAt: new Date(NOW.getTime() + 24 * HOUR).toISOString() }
    const first = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', body)
    expect(first.status).toBe(201)
    // The other tap read the request before that claim landed: the claim
    // itself refuses it, and checkout is never asked.
    staleReads = 1
    const raced = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7551)}/book`, 'customer', body)
    expect([raced.status, raced.body.code]).toEqual([409, 'REPAIR_QUOTE_BOOKED'])
    // A later tap is refused on its first read.
    const again = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', body)
    expect([again.status, again.body.code]).toEqual([409, 'REPAIR_QUOTE_BOOKED'])
    expect(intents).toHaveLength(1)
    expect(requests[REQUEST]).toMatchObject({ status: 'booked', bookedQuoteId: id(7550) })
  })

  test('checkout refusing puts the request back to open, so another time can be booked', async () => {
    quotes[0] = { ...quotes[0]!, status: 'quoted', priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true, answeredAt: NOW }
    const body = { scheduledAt: new Date(NOW.getTime() + 24 * HOUR).toISOString() }
    intentRefusal = new AppError(409, 'That time was just taken. Pick another time; nothing was charged.', 'SLOT_UNAVAILABLE')
    const refused = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', body)
    expect([refused.status, refused.body.code]).toEqual([409, 'SLOT_UNAVAILABLE'])
    expect(requests[REQUEST]).toMatchObject({ status: 'open', bookedQuoteId: null })
    intentRefusal = null
    const booked = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', body)
    expect(booked.status).toBe(201)
    expect(requests[REQUEST]).toMatchObject({ status: 'booked', bookedQuoteId: id(7550) })
    expect(quotes[0]!.bookingId).toBe(BOOKING)
  })

  test('a garage with no free inspection service, or someone else’s request, is refused', async () => {
    quotes[0] = { ...quotes[0]!, status: 'quoted', priceFrom: 4000, priceTo: 5500, days: 2, needsInspection: true, answeredAt: NOW }
    bookable = false
    const body = { scheduledAt: new Date(NOW.getTime() + 24 * HOUR).toISOString() }
    const none = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'customer', body)
    expect([none.status, none.body.code]).toEqual([409, 'REPAIR_QUOTE_NOT_BOOKABLE'])
    const theirs = await call('POST', `/users/me/repair-quotes/${REQUEST}/quotes/${id(7550)}/book`, 'otherCustomer', body)
    expect(theirs.status).toBe(404)
    expect(intents).toEqual([])
  })
})

// ─── Admin ───────────────────────────────────────────────────────────────────

describe('admin', () => {
  test('super-admin only; the list masks the phone and counts each chip', async () => {
    expect((await call('GET', '/admin/repair-quotes', 'owner')).status).toBe(403)
    const { status, body } = await call('GET', '/admin/repair-quotes?filter=all', 'breakGlass')
    expect(status).toBe(200)
    expect(body.data.counts).toMatchObject({ all: 2, open: 2 })
    expect(body.data.items[0].customer).toEqual({ name: 'Karthik R', phone: expect.stringContaining('4417') })
    expect(body.data.items[0].customer.phone).not.toContain('98765')
    expect(body.data.items[0].quotes[0].garage.phone).toBe('9000007510')
  })

  test('the garage switch needs a free inspection service to turn on', async () => {
    const card = await call('GET', `/admin/repair-quotes/vendors/${GARAGE}`, 'breakGlass')
    expect(card.body.data).toMatchObject({ enabled: false, bookable: true, asked: 9, answeredInTime: 8, billsInside: 3, billsTotal: 3, billsMatchQuotes: true })
    const turnOn = await call('PUT', `/admin/repair-quotes/vendors/${GARAGE}`, 'breakGlass', { enabled: true })
    expect(turnOn.status).toBe(200)
    expect(setEnabled).toEqual([[GARAGE, true]])
    bookable = false
    const refused = await call('PUT', `/admin/repair-quotes/vendors/${GARAGE}`, 'breakGlass', { enabled: true })
    expect([refused.status, refused.body.code]).toEqual([400, 'REPAIR_QUOTES_NEED_INSPECTION_SERVICE'])
    expect((await call('PUT', `/admin/repair-quotes/vendors/${FAR_GARAGE}`, 'breakGlass', { enabled: false })).status).toBe(404)
  })
})
