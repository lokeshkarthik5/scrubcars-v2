/**
 * The Detlio Garage (0057) through the real routes and the real auth
 * middleware. Only the database is stood in for (the repositories, put
 * back afterwards); stand-in ids are in this feature's fixture range,
 * id(3700)–id(3799), phones 90000037xx.
 *
 * The rules: while REWARDS_ENABLED is off every route is a 404; with
 * rewards live but the Garage off (its default), customers get 404s and
 * admin still works. Customers read and mark only their own (the session's
 * id). Every admin route (series, cars, art, figures, CSV, a card given by
 * hand) is super-admin only; a customer or a garage owner gets nothing. A
 * card is told once, however often the hooks run.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { DEFAULT_REWARDS_SETTINGS } = await import('../../lib/rewards.js')
const { SERIES_ONE } = await import('../../lib/garage-series.js')
const { membersRepository } = await import('../members/members.repository.js')
const { rewardsRepository } = await import('../rewards/rewards.repository.js')
const { forgetSettings } = await import('../rewards/rewards.settings.js')
const { pushService } = await import('../push/push.service.js')
const { garageRepository } = await import('./garage.repository.js')
const { garageService } = await import('./garage.service.js')
const { adminGarageRoutes, customerGarageRoutes } = await import('./garage.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const PEOPLE = {
  me: 'e2e00000-0000-4000-8000-000000003701',
  other: 'e2e00000-0000-4000-8000-000000003702',
  superAdmin: 'e2e00000-0000-4000-8000-000000003705',
}
const SERIES_ID = 'e2e00000-0000-4000-8000-000000003710'
const CAR_ID = 'e2e00000-0000-4000-8000-000000003720'
const PULL_MINE = 'e2e00000-0000-4000-8000-000000003730'
const BOOKING_ID = 'e2e00000-0000-4000-8000-000000003740'
const NOW = new Date()

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const savedEnv = { rewardsEnabled: envValues.rewardsEnabled }

type Settings = typeof DEFAULT_REWARDS_SETTINGS
let settingsRow: { version: number; settings: Settings; actorName: string; actorSub: null; createdAt: Date }
function master(on: boolean) {
  envValues.rewardsEnabled = on
  forgetSettings()
}
function garageOn(on: boolean) {
  settingsRow = { ...settingsRow, settings: { ...settingsRow.settings, garage: { enabled: on } } }
  forgetSettings()
}

const series = { id: SERIES_ID, number: 1, name: 'Series 1', status: 'live' as const, startsAt: null, endsAt: null, createdAt: NOW, updatedAt: NOW, updatedBy: 'Detlio (0057)' }
const carRows = SERIES_ONE.cars.map((c, i) => ({
  id: i === 6 ? CAR_ID : `e2e00000-0000-4000-8000-0000000037${String(50 + i).padStart(2, '0')}`,
  seriesId: SERIES_ID,
  number: c.number,
  name: c.name,
  rarity: c.rarity,
  tone: c.tone,
  paint: c.paint,
  colour: c.colour,
  stats: [...c.stats],
  lore: c.lore,
  enabled: true,
  artSource: 'default' as const,
  artUrl: null,
  artUpdatedAt: null,
  artUpdatedBy: null,
  updatedAt: NOW,
  updatedBy: null,
}))

const seenCalls: Array<{ userId: string; ids: string[] }> = []
const carUpdates: Array<Record<string, unknown>> = []
const nudgeClaims: Array<Record<string, unknown>> = []
const pushes: Array<{ userId: string; title: string }> = []
let claimed = new Set<string>()
let pullResults: unknown[] = []

beforeAll(() => {
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) => (userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined))
  patch(rewardsRepository, 'latestSettings', async () => settingsRow)
  patch(rewardsRepository, 'claimNudge', async (input: Record<string, unknown>) => {
    nudgeClaims.push(input)
    const key = `${input.userId}:${input.kind}:${input.subjectKey}`
    if (claimed.has(key)) return false
    claimed.add(key)
    return true
  })
  patch(pushService, 'sendNow', async (recipient: { userId: string }, message: { title: string }) => {
    pushes.push({ userId: recipient.userId, title: message.title })
    return null
  })
  patch(garageRepository, 'liveSeries', async () => series)
  patch(garageRepository, 'listSeries', async () => [series])
  patch(garageRepository, 'seriesCars', async () => carRows)
  patch(garageRepository, 'carFigures', async () => new Map())
  // The customer owns car 7 (Monsoon GT) twice; whoever else asks owns nothing.
  patch(garageRepository, 'albumFacts', async (userId: string) => ({
    owned: userId === PEOPLE.me ? [{ carId: CAR_ID, count: 2, firstPulledAt: NOW }] : [],
    rows: [],
    completedAt: null,
    duplicatesWaiting: userId === PEOPLE.me ? 1 : 0,
    pulls: userId === PEOPLE.me ? 2 : 0,
  }))
  patch(garageRepository, 'recentPulls', async (userId: string) =>
    userId === PEOPLE.me
      ? [{ id: PULL_MINE, pulledAt: NOW, seenAt: null, source: 'booking', wasDuplicate: false, rootBookingId: BOOKING_ID, bookingId: BOOKING_ID, seriesNumber: 1, seriesTotal: 40, count: 2, rowCompleted: null, seriesCompleted: false, car: carRows[6] }]
      : []
  )
  patch(garageRepository, 'markSeen', async (userId: string, ids: string[]) => {
    seenCalls.push({ userId, ids })
    return ids.length
  })
  patch(garageRepository, 'findCar', async (id: string) => (id === CAR_ID ? { car: carRows[6], seriesNumber: 1 } : null))
  patch(garageRepository, 'updateCar', async (input: Record<string, unknown>) => {
    carUpdates.push(input)
    return { ...carRows[6], ...(input.patch as object) }
  })
  patch(garageRepository, 'updateSeries', async () => series)
  patch(garageRepository, 'monthStats', async () => ({ byRarity: [{ rarity: 'common', n: 11, forced: 0 }, { rarity: 'rare', n: 6, forced: 2 }], bySource: [{ source: 'booking', n: 17 }], duplicates: 4, converted: 3, garageStamps: 1, rows: [], seriesThisMonth: 0, seriesEver: 0, collectors: 9 }))
  patch(garageRepository, 'topCollectors', async () => [{ userId: PEOPLE.me, name: 'Meena Raj', phone: '9000003701', cars: 12, copies: 15, completed: false }])
  patch(garageRepository, 'monthPulls', async () => [
    { pulled_at: NOW, phone: '9000003701', series: 1, number: 7, name: 'Monsoon GT', rarity: 'rare', source: 'booking', was_duplicate: false, forced: null },
  ])
  patch(garageRepository, 'findCustomer', async (id: string) => (id === PEOPLE.me ? { id, name: 'Meena Raj' } : undefined))
  patch(garageRepository, 'pullForBooking', async () => pullResults.shift() ?? null)
})

beforeEach(() => {
  settingsRow = { version: 1, settings: structuredClone(DEFAULT_REWARDS_SETTINGS), actorName: 'Detlio (defaults)', actorSub: null, createdAt: NOW }
  master(true)
  garageOn(true)
  seenCalls.length = 0
  carUpdates.length = 0
  nudgeClaims.length = 0
  pushes.length = 0
  claimed = new Set()
  pullResults = []
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
  forgetSettings()
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me/rewards/garage', customerGarageRoutes)
app.route('/users', users)
app.route('/admin/rewards/garage', adminGarageRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({ sub: PEOPLE[who], aud: 'customer', isCustomer: who !== 'superAdmin', isVendorOwner: false })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Who, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { ...(await cookieFor(who)), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; message?: string; data?: Record<string, unknown> }
  return { status: response.status, body: json }
}

const CAR = () => ({
  name: 'Monsoon GT',
  rarity: 'rare',
  tone: 'dark',
  paint: '#0F7A78',
  colour: 'Monsoon Teal',
  stats: ['0–100: 3.1 s', 'Top speed: 326 km/h', 'Colour: Monsoon Teal'],
  lore: 'Loves the first rain of June more than anyone in the city.',
  enabled: true,
  actorName: 'Asha',
})

const CUSTOMER_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/users/me/rewards/garage'],
  ['GET', '/users/me/rewards/garage/pulls'],
  ['POST', '/users/me/rewards/garage/pulls/seen', { ids: [PULL_MINE] }],
]
const ADMIN_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/admin/rewards/garage'],
  ['GET', `/admin/rewards/garage/stats?seriesId=${SERIES_ID}`],
  ['GET', '/admin/rewards/garage/pulls'],
  ['PATCH', `/admin/rewards/garage/series/${SERIES_ID}`, { name: 'Series 1', status: 'live', startsAt: null, endsAt: null, actorName: 'Asha' }],
  ['PATCH', `/admin/rewards/garage/cars/${CAR_ID}`, CAR()],
  ['POST', `/admin/rewards/garage/cars/${CAR_ID}/art/generate`],
  ['POST', `/admin/rewards/garage/cars/${CAR_ID}/art/choose`, { key: 'ai-temp/garage/x/y.webp', actorName: 'Asha' }],
  ['POST', `/admin/rewards/garage/cars/${CAR_ID}/art/auto`, { actorName: 'Asha' }],
  ['POST', `/admin/rewards/garage/cars/${CAR_ID}/art/upload-url`, { contentType: 'image/webp', sizeBytes: 1000 }],
  ['POST', `/admin/rewards/garage/cars/${CAR_ID}/art/upload`, { key: 'ai-temp/garage/x/upload-y.webp', actorName: 'Asha' }],
  ['POST', `/admin/rewards/garage/cars/${CAR_ID}/art/reset`, { actorName: 'Asha' }],
  ['POST', `/admin/rewards/garage/customers/${PEOPLE.me}/pull`, { actorName: 'Asha', reason: 'Card lost in a bug' }],
]

describe('switches', () => {
  test('REWARDS_ENABLED off: every customer and admin route is a 404', async () => {
    master(false)
    for (const [method, path, body] of [...CUSTOMER_ROUTES, ...ADMIN_ROUTES]) {
      const who = path.startsWith('/admin') ? 'superAdmin' : 'me'
      const { status } = await call(method, path, who, body)
      expect({ path, status }).toEqual({ path, status: 404 })
    }
  })

  test('the Garage off (its default): customers get a 404, admin still works', async () => {
    garageOn(false)
    for (const [method, path, body] of CUSTOMER_ROUTES.slice(0, 2)) {
      const { status } = await call(method, path, 'me', body)
      expect({ path, status }).toEqual({ path, status: 404 })
    }
    const { status, body } = await call('GET', '/admin/rewards/garage', 'superAdmin')
    expect(status).toBe(200)
    expect(body.data?.live).toBe(false)
  })
})

describe('authorisation', () => {
  test('every admin route (series, cars, art, figures, CSV, a card by hand) is super-admin only', async () => {
    for (const who of [null, 'me'] as const) {
      for (const [method, path, body] of ADMIN_ROUTES) {
        const { status } = await call(method, path, who, body)
        expect({ who, path, ok: status === 401 || status === 403 }).toEqual({ who, path, ok: true })
      }
    }
  })

  test('customer routes need a signed-in customer', async () => {
    for (const [method, path, body] of CUSTOMER_ROUTES) {
      const { status } = await call(method, path, null, body)
      expect({ path, status }).toEqual({ path, status: 401 })
    }
  })
})

describe('the customer', () => {
  test('the album: owned cards in full, missing ones as numbered silhouettes with no name or picture, and the odds', async () => {
    const { status, body } = await call('GET', '/users/me/rewards/garage', 'me')
    expect(status).toBe(200)
    const data = body.data as { collected: number; cars: Array<Record<string, unknown>>; rows: unknown[]; odds: unknown; duplicates: unknown }
    expect(data.collected).toBe(1)
    expect(data.cars.length).toBe(40)
    expect(data.rows.length).toBe(8)
    const mine = data.cars.find((c) => c.number === 7)!
    expect(mine).toMatchObject({ owned: true, name: 'Monsoon GT', rarity: 'rare', count: 2 })
    const missing = data.cars.find((c) => c.number === 1)!
    expect(missing.owned).toBe(false)
    expect(missing).not.toHaveProperty('name')
    expect(missing).not.toHaveProperty('art')
    expect(missing).not.toHaveProperty('lore')
    expect(data.odds).toEqual({ common: 55, rare: 30, epic: 12, legendary: 3 })
    expect(data.duplicates).toEqual({ waiting: 1, perStar: 3 })
  })

  test('another customer sees their own album, never mine', async () => {
    const { body } = await call('GET', '/users/me/rewards/garage', 'other')
    expect((body.data as { collected: number }).collected).toBe(0)
    const pulls = await call('GET', '/users/me/rewards/garage/pulls', 'other')
    expect((pulls.body.data as { pulls: unknown[] }).pulls).toEqual([])
  })

  test('marking seen is always the session’s own', async () => {
    const { status } = await call('POST', '/users/me/rewards/garage/pulls/seen', 'other', { ids: [PULL_MINE] })
    expect(status).toBe(200)
    expect(seenCalls).toEqual([{ userId: PEOPLE.other, ids: [PULL_MINE] }])
  })

  test('the latest cards: unseen first, the car in full', async () => {
    const { body } = await call('GET', '/users/me/rewards/garage/pulls', 'me')
    const data = body.data as { unseen: number; pulls: Array<{ id: string; car: { name: string; number: number; total: number } }> }
    expect(data.unseen).toBe(1)
    expect(data.pulls[0]).toMatchObject({ id: PULL_MINE, car: { name: 'Monsoon GT', number: 7, total: 40 } })
  })
})

describe('admin', () => {
  test('a car edit is checked whole: a real car name is refused, a good one saved with the typed name', async () => {
    const bad = await call('PATCH', `/admin/rewards/garage/cars/${CAR_ID}`, 'superAdmin', { ...CAR(), name: 'Porsche Teal' })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('GARAGE_CAR_INVALID')
    expect(carUpdates.length).toBe(0)
    const good = await call('PATCH', `/admin/rewards/garage/cars/${CAR_ID}`, 'superAdmin', CAR())
    expect(good.status).toBe(200)
    expect(carUpdates[0]).toMatchObject({ id: CAR_ID, actorName: 'Asha', actorSub: PEOPLE.superAdmin })
  })

  test('without OPENAI_API_KEY the AI buttons are a 404, and the overview says so', async () => {
    const savedKey = envValues.openaiApiKey
    const savedFake = envValues.aiFake
    envValues.openaiApiKey = undefined
    envValues.aiFake = false
    try {
      const { status } = await call('POST', `/admin/rewards/garage/cars/${CAR_ID}/art/generate`, 'superAdmin')
      expect(status).toBe(404)
      const overview = await call('GET', '/admin/rewards/garage', 'superAdmin')
      expect((overview.body.data as { ai: { pictures: boolean; missing: number; estimate: unknown } }).ai).toMatchObject({
        pictures: false,
        missing: 40,
        estimate: { pictures: 40, rupees: 160 },
      })
    } finally {
      envValues.openaiApiKey = savedKey
      envValues.aiFake = savedFake
    }
  })

  test('figures mask phones; the CSV too', async () => {
    const stats = await call('GET', `/admin/rewards/garage/stats?seriesId=${SERIES_ID}`, 'superAdmin')
    const data = stats.body.data as { pulls: number; topCollectors: Array<{ phone: string }>; rarities: Array<{ rarity: string; share: number; odds: number }> }
    expect(data.pulls).toBe(17)
    expect(data.topCollectors[0].phone).toBe('••••••3701')
    expect(data.rarities.find((r) => r.rarity === 'common')).toMatchObject({ odds: 55, share: 64.7 })
    const csv = await call('GET', '/admin/rewards/garage/pulls', 'superAdmin')
    expect(JSON.stringify(csv.body)).not.toContain('9000003701')
  })
})

describe('telling', () => {
  const outcome = {
    userId: PEOPLE.me,
    seriesId: SERIES_ID,
    seriesName: 'Series 1',
    pull: { id: PULL_MINE, carId: CAR_ID, number: 7, name: 'Monsoon GT', rarity: 'rare', duplicate: false, forced: null, source: 'booking' },
    duplicateStamps: 0,
    rows: [{ row: 2, voucher: { id: 'v', kind: 'garage_row', amount: '100.00', userId: PEOPLE.me }, stamps: 0 }],
    seriesCompleted: null,
    vouchers: [],
    stampsAdded: false,
    capHit: false,
  }

  test('a booking’s card is told once (car and row), however often the hook runs', async () => {
    // Midday IST, a celebration hour.
    const noonIst = new Date('2026-10-20T06:30:00Z')
    pullResults = [{ outcomes: [outcome], vouchers: [], capAlert: null }, null]
    await garageService.onStampEarned(PEOPLE.me, BOOKING_ID, noonIst)
    await garageService.onStampEarned(PEOPLE.me, BOOKING_ID, noonIst)
    await garageService.announce([outcome as never], [], null, settingsRow.settings, noonIst)
    expect(pushes.map((p) => p.title)).toEqual(['New car for your Garage: Monsoon GT (Rare)', 'Row 2 complete — ₹100 off'])
    expect(nudgeClaims.filter((n) => n.kind === 'garage_card').every((n) => n.subjectKey === `garage_pull:${PULL_MINE}`)).toBe(true)
  })

  test('at night nothing is pushed: the morning run tells it', async () => {
    const lateIst = new Date('2026-10-20T17:30:00Z') // 23:00 IST
    pullResults = [{ outcomes: [outcome], vouchers: [], capAlert: null }]
    await garageService.onStampEarned(PEOPLE.me, BOOKING_ID, lateIst)
    expect(pushes).toEqual([])
  })
})
