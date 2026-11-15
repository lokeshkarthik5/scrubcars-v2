/**
 * Shine Score (0075) through the real routes and auth middleware (the
 * customer routes as users.routes.ts mounts them). Only the database and
 * OpenAI are stood in for: the repository is replaced on its object with an
 * in-memory one and put back afterwards, and the AI is a recording fake.
 *
 * The rules: off is a 404 everywhere but /config; signed in to scan; three
 * scored scans a customer a day, and a failed or unreadable scan uses none
 * up; only the four pictures are sent, nothing else; a scan or booking of
 * someone else's is a 404; only a super-admin sees or marks Shine checks,
 * once each.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { AiUnavailableError } = await import('../../lib/ai.js')
const { signAccessToken } = await import('../../lib/jwt.js')
const { FAKE_JOB_READING, FAKE_SCAN_READING, SCAN_PHOTO_TEXT } = await import('../../lib/shine-score.js')
const { membersRepository } = await import('../members/members.repository.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')
const { shineScoreRepository } = await import('./shine-score.repository.js')
const { setShineReadersForTest, shineScoreService } = await import('./shine-score.service.js')
const { adminShineRoutes, customerShineRoutes, publicShineRoutes } = await import('./shine-score.routes.js')

const PEOPLE = {
  customer: 'e2e00000-0000-4000-8000-000000007601',
  otherCustomer: 'e2e00000-0000-4000-8000-000000007602',
  superAdmin: 'e2e00000-0000-4000-8000-000000007603',
}
const GARAGE = 'e2e00000-0000-4000-8000-000000007610'
const DONE = 'e2e00000-0000-4000-8000-000000007620'
const NOT_DONE = 'e2e00000-0000-4000-8000-000000007621'
const OTHERS = 'e2e00000-0000-4000-8000-000000007622'

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

type Scan = {
  id: string
  userId: string
  istDay: string
  status: 'scoring' | 'scored' | 'failed'
  overall: number | null
  scores: Record<string, number> | null
  findings: Array<{ text: string; area: string }> | null
  summary: string | null
  suggestion: string | null
  photoKeys: string[]
  createdAt: Date
  scoredAt: Date | null
}
const scans: Scan[] = []
type JobScore = {
  id: string
  bookingId: string
  vendorId: string
  status: 'scoring' | 'scored' | 'no_match' | 'failed'
  attempts: number
  areas: string[]
  beforeOverall: number | null
  afterOverall: number | null
  beforeScores: Record<string, number> | null
  afterScores: Record<string, number> | null
  findings: Array<{ text: string; area: string }> | null
  reviewStatus: 'new' | 'looks_fine' | 'followed_up' | null
  reviewedAt: Date | null
  reviewedBy: string | null
  createdAt: Date
  updatedAt: Date
  scoredAt: Date | null
}
const jobScores: JobScore[] = []
const BOOKINGS: Record<string, { userId: string; vendorId: string; status: string }> = {
  [DONE]: { userId: PEOPLE.customer, vendorId: GARAGE, status: 'completed' },
  [NOT_DONE]: { userId: PEOPLE.customer, vendorId: GARAGE, status: 'in_progress' },
  [OTHERS]: { userId: PEOPLE.otherCustomer, vendorId: GARAGE, status: 'completed' },
}

/** Every request the fake AI was given, to check what was sent. */
const sent: Array<Record<string, unknown>> = []
let aiMode: 'ok' | 'down' | 'unreadable' = 'ok'
const savedEnabled = env.shineScoreEnabled

const idOf = (n: number) => `e2e00000-0000-4000-8000-0000000076${String(n).padStart(2, '0')}`

beforeAll(() => {
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  const stubs: Record<string, unknown> = {
    listScansOfDay: async (userId: string, istDay: string) =>
      scans.filter((s) => s.userId === userId && s.istDay === istDay).map((s) => ({ status: s.status, createdAt: s.createdAt })),
    reserveScan: async (input: { userId: string; istDay: string; decide: (today: unknown[]) => string | null }) => {
      const today = scans
        .filter((s) => s.userId === input.userId && s.istDay === input.istDay)
        .map((s) => ({ status: s.status, createdAt: s.createdAt }))
      const refusal = input.decide(today)
      if (refusal) return { refusal }
      const scan: Scan = {
        id: idOf(40 + scans.length),
        userId: input.userId,
        istDay: input.istDay,
        status: 'scoring',
        overall: null,
        scores: null,
        findings: null,
        summary: null,
        suggestion: null,
        photoKeys: [],
        createdAt: new Date(),
        scoredAt: null,
      }
      scans.push(scan)
      return { scanId: scan.id }
    },
    finishScan: async (id: string, data: Partial<Scan>) => {
      Object.assign(scans.find((s) => s.id === id)!, { status: 'scored', ...data })
    },
    setScanPhotos: async () => undefined,
    failScan: async (id: string) => {
      scans.find((s) => s.id === id)!.status = 'failed'
    },
    findOwnScan: async (userId: string, id: string) => scans.find((s) => s.id === id && s.userId === userId) ?? null,
    findBooking: async (id: string) => (BOOKINGS[id] ? { id, ...BOOKINGS[id] } : null),
    findJobScore: async (bookingId: string) => jobScores.find((j) => j.bookingId === bookingId) ?? null,
    countReviews: async () =>
      (['new', 'looks_fine', 'followed_up'] as const).map((status) => ({
        status,
        count: jobScores.filter((j) => j.reviewStatus === status).length,
      })),
    listReviews: async (status: string) =>
      jobScores
        .filter((j) => j.reviewStatus === status)
        .map((score) => ({
          score,
          bookingScheduledAt: new Date(),
          bookingMarkedTest: null,
          garageName: 'Sri Balaji Car Spa',
          customerId: PEOPLE.customer,
          customerName: 'Divya S',
          customerPhone: '9840051234',
        })),
    listGaragePhotosOf: async () => [],
    findReview: async (id: string) => jobScores.find((j) => j.id === id) ?? null,
    markReviewed: async (id: string, outcome: JobScore['reviewStatus'], actorName: string, at: Date) => {
      const row = jobScores.find((j) => j.id === id && j.reviewStatus === 'new')
      if (!row) return null
      Object.assign(row, { reviewStatus: outcome, reviewedBy: actorName, reviewedAt: at })
      return { id }
    },
  }
  for (const [key, value] of Object.entries(stubs)) patch(shineScoreRepository, key, value)
  // Never score in the background here: the booking route only asks for it.
  patch(shineScoreService, 'scheduleScore', () => undefined)

  const fake = (answer: unknown) => ({
    read: async (request: import('../../lib/ai.js').DocumentRequest) => {
      sent.push(request as unknown as Record<string, unknown>)
      if (aiMode === 'down') throw new AiUnavailableError('timeout')
      if (aiMode === 'unreadable') return JSON.stringify({ ...FAKE_SCAN_READING, readable: false })
      return JSON.stringify(answer)
    },
  })
  setShineReadersForTest({ scan: fake(FAKE_SCAN_READING), job: fake(FAKE_JOB_READING) })
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  setShineReadersForTest(undefined)
  ;(env as unknown as Record<string, unknown>).shineScoreEnabled = savedEnabled
})

beforeEach(() => {
  scans.length = 0
  jobScores.length = 0
  sent.length = 0
  aiMode = 'ok'
  ;(env as unknown as Record<string, unknown>).shineScoreEnabled = true
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me/shine', customerShineRoutes)
app.route('/users', users)
app.route('/shine', publicShineRoutes)
app.route('/admin/shine-checks', adminShineRoutes)

type Who = keyof typeof PEOPLE | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token = await signAccessToken({ sub: PEOPLE[who], aud: 'customer', isCustomer: true, isVendorOwner: false })
  return { Cookie: `access_token=${token}` }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = { code?: string; message?: string; data?: any }

async function call(path: string, who: Who, body?: unknown) {
  const response = await app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(await cookieFor(who)), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Body }
}

/** A tiny real JPEG's first bytes, padded: enough for the type check. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64')
const photos = (over: Record<string, unknown> = {}) => ({
  photos: (['front', 'side', 'dashboard', 'seats'] as const).map((area) => ({
    area,
    mimeType: 'image/jpeg',
    dataBase64: JPEG,
    ...over,
  })),
})

describe('the switch', () => {
  test('config is public and says whether it is on', async () => {
    const on = await call('/shine/config', null)
    expect(on.status).toBe(200)
    expect(on.body.data).toEqual({ enabled: true, scansPerDay: 3, keepDays: 30 })
    ;(env as unknown as Record<string, unknown>).shineScoreEnabled = false
    expect((await call('/shine/config', null)).body.data.enabled).toBe(false)
  })

  test('off: every other route is a 404, whoever asks', async () => {
    ;(env as unknown as Record<string, unknown>).shineScoreEnabled = false
    expect((await call('/users/me/shine', 'customer')).status).toBe(404)
    expect((await call('/users/me/shine/scans', 'customer', photos())).status).toBe(404)
    expect((await call(`/users/me/shine/bookings/${DONE}`, 'customer')).status).toBe(404)
    expect((await call('/admin/shine-checks', 'superAdmin')).status).toBe(404)
    expect(sent).toHaveLength(0)
  })
})

describe('scans', () => {
  test('signed in to scan', async () => {
    expect((await call('/users/me/shine/scans', null, photos())).status).toBe(401)
  })

  test('scores four photos: the average, words from the numbers, and scans left', async () => {
    const before = await call('/users/me/shine', 'customer')
    expect(before.body.data).toEqual({ scansLeft: 3, scansPerDay: 3 })
    const made = await call('/users/me/shine/scans', 'customer', photos())
    expect(made.status).toBe(201)
    expect(made.body.data.scansLeft).toBe(2)
    expect(made.body.data.scan).toMatchObject({
      overall: 59,
      scores: { front: 70, side: 66, dashboard: 58, seats: 41 },
      summary: 'Fairly clean outside, the inside needs work.',
      need: 'both',
    })
    expect(made.body.data.scan.findings).toHaveLength(3)
    // Read back by its owner only.
    const id = made.body.data.scan.id
    expect((await call(`/users/me/shine/scans/${id}`, 'customer')).body.data.overall).toBe(59)
    expect((await call(`/users/me/shine/scans/${id}`, 'otherCustomer')).status).toBe(404)
  })

  test('only the pictures are sent: no ids, names or anything else', async () => {
    await call('/users/me/shine/scans', 'customer', photos())
    expect(sent).toHaveLength(1)
    const request = sent[0]!
    expect(request.userText).toBe(SCAN_PHOTO_TEXT)
    const files = request.files as Array<Record<string, unknown>>
    expect(files.map((f) => f.name)).toEqual(['front.jpg', 'side.jpg', 'dashboard.jpg', 'seats.jpg'])
    const text = JSON.stringify({ ...request, files: files.map((f) => ({ ...f, dataBase64: '' })) })
    for (const id of Object.values(PEOPLE)) expect(text).not.toContain(id)
  })

  test('three a day; the fourth is refused without asking the AI', async () => {
    for (let i = 0; i < 3; i++) expect((await call('/users/me/shine/scans', 'customer', photos())).status).toBe(201)
    const fourth = await call('/users/me/shine/scans', 'customer', photos())
    expect(fourth.status).toBe(429)
    expect(fourth.body.code).toBe('SHINE_SCAN_LIMIT')
    expect(sent).toHaveLength(3)
    // Someone else's day is their own.
    expect((await call('/users/me/shine/scans', 'otherCustomer', photos())).status).toBe(201)
  })

  test('AI down or photos unreadable: a friendly retry, and no free scan used', async () => {
    aiMode = 'down'
    const down = await call('/users/me/shine/scans', 'customer', photos())
    expect(down.status).toBe(503)
    expect(down.body.code).toBe('AI_UNAVAILABLE')
    aiMode = 'unreadable'
    const unreadable = await call('/users/me/shine/scans', 'customer', photos())
    expect(unreadable.status).toBe(422)
    expect(unreadable.body.code).toBe('SHINE_UNREADABLE')
    expect((await call('/users/me/shine', 'customer')).body.data.scansLeft).toBe(3)
  })

  test('not four pictures of the four areas, or anything extra: refused before the AI', async () => {
    const three = photos()
    three.photos.pop()
    expect((await call('/users/me/shine/scans', 'customer', three)).status).toBe(400)
    const notJpeg = photos({ dataBase64: Buffer.alloc(300, 1).toString('base64') })
    const bad = await call('/users/me/shine/scans', 'customer', notJpeg)
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('SHINE_PHOTO_INVALID')
    expect((await call('/users/me/shine/scans', 'customer', { ...photos(), plate: 'TN07CD9036' })).status).toBe(400)
    expect(sent).toHaveLength(0)
  })
})

describe("a finished booking's before and after", () => {
  test('only the booking’s own customer; not finished is nothing', async () => {
    expect((await call(`/users/me/shine/bookings/${OTHERS}`, 'customer')).status).toBe(404)
    expect((await call(`/users/me/shine/bookings/${NOT_DONE}`, 'customer')).body.data).toEqual({ state: 'none' })
  })

  test('no score yet is pending; a score shows before, after and the biggest change', async () => {
    expect((await call(`/users/me/shine/bookings/${DONE}`, 'customer')).body.data).toEqual({ state: 'pending' })
    const now = new Date()
    jobScores.push({
      id: idOf(80),
      bookingId: DONE,
      vendorId: GARAGE,
      status: 'scored',
      attempts: 1,
      areas: ['front', 'seats'],
      beforeOverall: 46,
      afterOverall: 92,
      beforeScores: { front: 52, seats: 40 },
      afterScores: { front: 92, seats: 92 },
      findings: [],
      reviewStatus: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      scoredAt: now,
    })
    expect((await call(`/users/me/shine/bookings/${DONE}`, 'customer')).body.data).toEqual({
      state: 'scored',
      before: 46,
      after: 92,
      areas: [
        { area: 'front', before: 52, after: 92 },
        { area: 'seats', before: 40, after: 92 },
      ],
      biggestChange: 'seats',
    })
  })
})

describe('admin: Shine checks', () => {
  const low = (): JobScore => {
    const now = new Date()
    return {
      id: idOf(90),
      bookingId: DONE,
      vendorId: GARAGE,
      status: 'scored',
      attempts: 1,
      areas: ['front', 'dashboard', 'seats'],
      beforeOverall: 44,
      afterOverall: 48,
      beforeScores: { front: 50, dashboard: 42, seats: 40 },
      afterScores: { front: 60, dashboard: 46, seats: 38 },
      findings: [{ text: 'Mats still muddy', area: 'seats' }],
      reviewStatus: 'new',
      reviewedAt: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      scoredAt: now,
    }
  }

  test('a customer cannot list or mark them', async () => {
    jobScores.push(low())
    expect((await call('/admin/shine-checks', 'customer')).status).toBe(403)
    expect((await call(`/admin/shine-checks/${idOf(90)}/review`, 'customer', { outcome: 'looks_fine' })).status).toBe(403)
  })

  test('super-admin lists New with counts, marks one once, signed with their name', async () => {
    jobScores.push(low())
    const list = await call('/admin/shine-checks?show=new', 'superAdmin')
    expect(list.status).toBe(200)
    expect(list.body.data.counts).toEqual({ new: 1, looks_fine: 0, followed_up: 0 })
    expect(list.body.data.checks[0]).toMatchObject({
      afterScore: 48,
      beforeScore: 44,
      lowestArea: 'Seats & floor',
      findings: ['Mats still muddy'],
      garage: { name: 'Sri Balaji Car Spa' },
    })
    const marked = await call(`/admin/shine-checks/${idOf(90)}/review`, 'superAdmin', { outcome: 'followed_up' })
    expect(marked.status).toBe(200)
    expect(jobScores[0]).toMatchObject({ reviewStatus: 'followed_up', reviewedBy: 'Signed-in Sam' })
    const again = await call(`/admin/shine-checks/${idOf(90)}/review`, 'superAdmin', { outcome: 'looks_fine' })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('SHINE_CHECK_REVIEWED')
  })
})

describe('scoring a finished job', () => {
  test('without matching before and after angles: no score, and nothing sent', async () => {
    const ended: string[] = []
    patch(shineScoreRepository, 'claimJobScore', async () => true)
    patch(shineScoreRepository, 'listGaragePhotos', async () => [
      { id: 'a', stage: 'before', angle: 'front', storageKey: 'k1', url: 'k1', createdAt: new Date() },
      { id: 'b', stage: 'after', angle: 'back', storageKey: 'k2', url: 'k2', createdAt: new Date() },
    ])
    patch(shineScoreRepository, 'endJobScore', async (_id: string, status: string) => {
      ended.push(status)
    })
    expect(await shineScoreService.scoreJob(DONE)).toBe('no_match')
    expect(ended).toEqual(['no_match'])
    expect(sent).toHaveLength(0)
  })

  test('off, or not finished: nothing at all', async () => {
    expect(await shineScoreService.scoreJob(NOT_DONE)).toBe('skipped')
    ;(env as unknown as Record<string, unknown>).shineScoreEnabled = false
    expect(await shineScoreService.scoreJob(DONE)).toBe('skipped')
    expect(sent).toHaveLength(0)
  })
})
