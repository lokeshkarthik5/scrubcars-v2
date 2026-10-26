/**
 * Achievements, challenges and Detlio Wrapped (0054) through the real
 * routes and the real auth middleware, and the service's once-only
 * celebrations. Only the database is stood in for (the repositories, put
 * back afterwards); stand-in ids are in this feature's fixture range,
 * id(3500)–id(3599).
 *
 * The rules: while REWARDS_ENABLED is off every route here is a 404; with
 * it on but the admin's switch off, customers get 404s and admin still
 * works. Customers read and mark only their own (the session's id, never a
 * body's or a path's). Admin routes are super-admin only. A challenge is
 * checked whole and audit-logged with the typed name; publishing never
 * starts one in the past. A badge or a win is celebrated once.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { DEFAULT_REWARDS_SETTINGS, isCelebratoryNudge } = await import('../../lib/rewards.js')
const { membersRepository } = await import('../members/members.repository.js')
const { rewardsRepository } = await import('../rewards/rewards.repository.js')
const { forgetSettings } = await import('../rewards/rewards.settings.js')
const { pushService } = await import('../push/push.service.js')
const { rewardExtrasRepository } = await import('./reward-extras.repository.js')
const { rewardExtrasService } = await import('./reward-extras.service.js')
const { adminRewardExtrasRoutes, customerRewardExtrasRoutes } = await import('./reward-extras.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const PEOPLE = {
  me: 'e2e00000-0000-4000-8000-000000003501',
  other: 'e2e00000-0000-4000-8000-000000003502',
  superAdmin: 'e2e00000-0000-4000-8000-000000003505',
}
const AWARD_MINE = 'e2e00000-0000-4000-8000-000000003510'
const AWARD_THEIRS = 'e2e00000-0000-4000-8000-000000003511'
const CHALLENGE_ID = 'e2e00000-0000-4000-8000-000000003520'
const BOOKING_ID = 'e2e00000-0000-4000-8000-000000003530'
const NOW = new Date()
/** IST dates relative to today, so the tests never age. */
const dayKey = (days: number) => new Date(NOW.getTime() + days * 86400000 + 330 * 60000).toISOString().slice(0, 10)
const START = dayKey(20)
const END = dayKey(26)

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const savedEnv = { rewardsEnabled: envValues.rewardsEnabled }

let settingsRow = { version: 1, settings: structuredClone(DEFAULT_REWARDS_SETTINGS), actorName: 'Detlio (defaults)', actorSub: null, createdAt: NOW }
function master(on: boolean) {
  envValues.rewardsEnabled = on
  forgetSettings()
}
function adminSwitch(on: boolean) {
  settingsRow = { ...settingsRow, settings: { ...settingsRow.settings, enabled: on } }
  forgetSettings()
}

/** A draft challenge row as the table returns it. */
function challengeRow(over: Record<string, unknown> = {}) {
  return {
    id: CHALLENGE_ID,
    title: 'Diwali Shine',
    description: 'Book 3 washes in Diwali week.',
    startDate: START,
    endDate: END,
    goalCount: 3,
    category: null,
    bookingType: null,
    rewardKind: 'multiplier',
    rewardStamps: null,
    rewardAmount: null,
    rewardMultiplier: 2,
    rewardCards: null,
    audienceMinLevel: null,
    maxWinners: 1000,
    createdBy: 'Detlio (example)',
    createdAt: NOW,
    updatedAt: NOW,
    publishedAt: null,
    publishedBy: null,
    endedAt: null,
    endedBy: null,
    ...over,
  }
}

const seenCalls: Array<{ userId: string; ids: string[] }> = []
const createCalls: Array<Record<string, unknown>> = []
const stateCalls: Array<{ action: string; actorName: string; refusal: string | null }> = []
const nudgeClaims: Array<Record<string, unknown>> = []
const pushes: Array<{ userId: string; title: string }> = []
let claimedSubjects = new Set<string>()
let countResults: unknown[] = []
let stateRow: Record<string, unknown> = {}

beforeAll(() => {
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) => (userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined))
  // requireSuperAdmin signs every admin write with the session's name (0058).
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  patch(rewardsRepository, 'latestSettings', async () => settingsRow)
  patch(rewardsRepository, 'levelFacts', async () => ({ completedAt: [], drops: 0 }))
  patch(rewardsRepository, 'findCustomerById', async (userId: string) =>
    userId === PEOPLE.me ? { id: userId, name: 'Meena Raj', phone: '9000003501', createdAt: NOW, birthdayMonth: null, birthdayDay: null } : undefined
  )
  // The claim is the once-only gate: a subject is claimed once, ever.
  patch(rewardsRepository, 'claimNudge', async (input: Record<string, unknown>) => {
    nudgeClaims.push(input)
    const key = `${input.userId}:${input.kind}:${input.subjectKey}`
    if (claimedSubjects.has(key)) return false
    claimedSubjects.add(key)
    return true
  })
  patch(pushService, 'sendNow', async (recipient: { userId: string }, message: { title: string }) => {
    pushes.push({ userId: recipient.userId, title: message.title })
    return null
  })

  patch(rewardExtrasRepository, 'listAwards', async (userId: string) =>
    userId === PEOPLE.me
      ? [{ id: AWARD_MINE, key: 'first_shine', challengeId: null, challengeTitle: null, bonusStamps: 1, earnedAt: NOW, seenAt: null, rootBookingId: null }]
      : [{ id: AWARD_THEIRS, key: 'explorer', challengeId: null, challengeTitle: null, bonusStamps: 1, earnedAt: NOW, seenAt: null, rootBookingId: null }]
  )
  patch(rewardExtrasRepository, 'badgeFacts', async () => ({ bookings: [], reviews: 0, rewardedInvites: 0 }))
  patch(rewardExtrasRepository, 'listPublishedAround', async () => [])
  patch(rewardExtrasRepository, 'standings', async () => new Map())
  patch(rewardExtrasRepository, 'washesInYears', async () => new Map())
  patch(rewardExtrasRepository, 'markSeen', async (userId: string, ids: string[]) => {
    seenCalls.push({ userId, ids })
    return ids.length
  })
  patch(rewardExtrasRepository, 'findWrapped', async () => undefined)
  patch(rewardExtrasRepository, 'wrappedFacts', async () => ({ bookings: [], savedPaise: 0, badges: [], level: 'member' }))
  patch(rewardExtrasRepository, 'findFirstName', async () => 'Meena Raj')
  patch(rewardExtrasRepository, 'saveWrapped', async () => undefined)
  patch(rewardExtrasRepository, 'recordWrappedEvent', async () => true)
  patch(rewardExtrasRepository, 'badgeCounts', async () => [{ key: 'first_shine', total: 12, thisMonth: 3, stamps: 12 }])
  patch(rewardExtrasRepository, 'listChallenges', async () => [challengeRow()])
  patch(rewardExtrasRepository, 'challengeFigures', async () => new Map())
  patch(rewardExtrasRepository, 'findChallenge', async (id: string) => (id === CHALLENGE_ID ? challengeRow() : undefined))
  patch(rewardExtrasRepository, 'challengeResults', async () => [
    { userId: PEOPLE.me, name: 'Meena Raj', phone: '9000003501', counted: 3, firstCountedAt: NOW, wonAt: NOW, bonusStamps: 3, voucherAmount: null, voucherCode: null, voucherUsed: null },
  ])
  patch(rewardExtrasRepository, 'createChallenge', async (input: Record<string, unknown>) => {
    createCalls.push(input)
    return challengeRow()
  })
  patch(rewardExtrasRepository, 'setChallengeState', async (input: { action: string; actorName: string; decide: (row: unknown) => string | null }) => {
    const refusal = input.decide(challengeRow(stateRow))
    stateCalls.push({ action: input.action, actorName: input.actorName, refusal })
    return refusal ? { kind: 'refused', reason: refusal } : { kind: 'ok', row: challengeRow({ publishedAt: NOW, publishedBy: input.actorName }) }
  })
  patch(rewardExtrasRepository, 'wrappedStats', async () => ({ customersWithWashes: 40, notified: 30, made: 20, opened: 18, opens: 25, sharers: 6, shares: 9 }))
  patch(rewardExtrasRepository, 'countStamp', async () => countResults.shift() ?? { kind: 'already' })
})

beforeEach(() => {
  settingsRow = { version: 1, settings: structuredClone(DEFAULT_REWARDS_SETTINGS), actorName: 'Detlio (defaults)', actorSub: null, createdAt: NOW }
  master(true)
  seenCalls.length = 0
  createCalls.length = 0
  stateCalls.length = 0
  nudgeClaims.length = 0
  pushes.length = 0
  claimedSubjects = new Set()
  countResults = []
  stateRow = {}
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
users.route('/me/rewards', customerRewardExtrasRoutes)
app.route('/users', users)
app.route('/admin/rewards', adminRewardExtrasRoutes)

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

const CHALLENGE = () => ({
  title: 'Diwali Shine',
  description: 'Book 3 washes in Diwali week.',
  startDate: START,
  endDate: END,
  goalCount: 3,
  category: null,
  bookingType: null,
  rewardKind: 'multiplier',
  rewardStamps: null,
  rewardAmount: null,
  rewardMultiplier: 2,
  rewardCards: null,
  audienceMinLevel: null,
  maxWinners: 1000,
  actorName: 'Asha',
})

const CUSTOMER_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/users/me/rewards/extras'],
  ['GET', '/users/me/rewards/extras/summary'],
  ['POST', '/users/me/rewards/badges/seen', { ids: [AWARD_MINE] }],
  ['GET', '/users/me/rewards/wrapped?year=2026'],
  ['POST', '/users/me/rewards/wrapped/2026/events', { kind: 'opened' }],
]
const ADMIN_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/admin/rewards/achievements'],
  ['GET', '/admin/rewards/challenges'],
  ['POST', '/admin/rewards/challenges', CHALLENGE()],
  ['GET', `/admin/rewards/challenges/${CHALLENGE_ID}`],
  ['PUT', `/admin/rewards/challenges/${CHALLENGE_ID}`, CHALLENGE()],
  ['POST', `/admin/rewards/challenges/${CHALLENGE_ID}/publish`, { actorName: 'Asha' }],
  ['POST', `/admin/rewards/challenges/${CHALLENGE_ID}/end`, { actorName: 'Asha' }],
  ['GET', `/admin/rewards/challenges/${CHALLENGE_ID}/results`],
  ['GET', '/admin/rewards/wrapped/stats?year=2026'],
  ['GET', `/admin/rewards/customers/${PEOPLE.me}/wrapped?year=2026`],
]

describe('while REWARDS_ENABLED is off (the default)', () => {
  test('every customer and admin route is a 404, and nothing is read or written', async () => {
    master(false)
    for (const [method, path, body] of CUSTOMER_ROUTES) {
      const { status, body: json } = await call(method, path, 'me', body)
      expect({ path, status, code: json.code }).toEqual({ path, status: 404, code: 'NOT_FOUND' })
    }
    for (const [method, path, body] of ADMIN_ROUTES) {
      const { status, body: json } = await call(method, path, 'breakGlass', body)
      expect({ path, status, code: json.code }).toEqual({ path, status: 404, code: 'NOT_FOUND' })
    }
    expect(seenCalls).toEqual([])
    expect(createCalls).toEqual([])
    expect(stateCalls).toEqual([])
  })

  test('nothing is counted, celebrated or swept', async () => {
    master(false)
    countResults = [{ kind: 'counted', userId: PEOPLE.me, badges: [{ id: AWARD_MINE, key: 'first_shine', challengeId: null, bonusStamps: 1 }], wins: [], oneLeft: [], full: [], vouchers: [], capAlert: null }]
    expect(await rewardExtrasService.onStampEarned(PEOPLE.me, BOOKING_ID)).toBeNull()
    expect(await rewardExtrasService.sweep({ dryRun: false })).toEqual({ enabled: false })
    expect(countResults).toHaveLength(1)
    expect(nudgeClaims).toEqual([])
    expect(pushes).toEqual([])
  })
})

describe("the admin's switch off", () => {
  test('customers get 404s; admin still works', async () => {
    adminSwitch(false)
    for (const [method, path, body] of CUSTOMER_ROUTES) {
      expect((await call(method, path, 'me', body)).status).toBe(404)
    }
    expect((await call('GET', '/admin/rewards/achievements', 'breakGlass')).status).toBe(200)
  })
})

describe('the customer', () => {
  test('signed in only; the cabinet is their own', async () => {
    expect((await call('GET', '/users/me/rewards/extras', null)).status).toBe(401)
    const { status, body } = await call('GET', '/users/me/rewards/extras', 'me')
    expect(status).toBe(200)
    const badges = body.data!.badges as Array<{ key: string; earned: unknown; progress: unknown }>
    expect(badges).toHaveLength(19)
    expect(badges.find((b) => b.key === 'first_shine')?.earned).toMatchObject({ id: AWARD_MINE })
    expect(badges.find((b) => b.key === 'washes_5')).toMatchObject({ earned: null, progress: { current: 0, goal: 5 } })
    expect(JSON.stringify(body.data)).not.toContain(AWARD_THEIRS)
    expect(body.data!.unseen).toEqual([expect.objectContaining({ id: AWARD_MINE, label: 'First Shine' })])
  })

  test("marking seen: the session's id, never a body's", async () => {
    expect((await call('POST', '/users/me/rewards/badges/seen', 'me', { ids: [AWARD_MINE], userId: PEOPLE.other })).status).toBe(400)
    expect((await call('POST', '/users/me/rewards/badges/seen', 'me', { ids: ['not-a-uuid'] })).status).toBe(400)
    expect((await call('POST', '/users/me/rewards/badges/seen', 'me', { ids: [AWARD_THEIRS] })).status).toBe(200)
    // The repository only updates rows of that user: someone else's id changes nothing.
    expect(seenCalls).toEqual([{ userId: PEOPLE.me, ids: [AWARD_THEIRS] }])
  })

  test("Wrapped: only a year that's open (October: none yet)", async () => {
    const closed = await call('GET', '/users/me/rewards/wrapped?year=2026', 'me')
    expect(closed).toMatchObject({ status: 404, body: { code: 'WRAPPED_NOT_AVAILABLE' } })
    expect((await call('GET', '/users/me/rewards/wrapped?year=1999', 'me')).status).toBe(400)
    expect((await call('POST', '/users/me/rewards/wrapped/2026/events', 'me', { kind: 'opened', image: 'x' })).status).toBe(400)
  })

  test('Wrapped in December: the first name only, and none with no washes', async () => {
    const december = new Date('2026-12-02T10:00:00+05:30')
    await expect(rewardExtrasService.wrapped(PEOPLE.me, 2026, december)).rejects.toMatchObject({ code: 'WRAPPED_NOT_AVAILABLE' })
    patch(rewardExtrasRepository, 'wrappedFacts', async () => ({
      bookings: [{ completedAt: new Date('2026-11-01T10:00:00+05:30'), vendorId: 'g', vendorName: 'Shine Hub' }],
      savedPaise: 29_900,
      badges: [{ key: 'first_shine', challengeTitle: null }],
      level: 'member',
    }))
    const stats = await rewardExtrasService.wrapped(PEOPLE.me, 2026, december)
    expect(stats).toMatchObject({ firstName: 'Meena', washes: 1, saved: '299.00', favouriteGarage: { name: 'Shine Hub' }, badges: { names: ['First Shine'] } })
    expect(JSON.stringify(stats)).not.toContain('Raj')
    expect(JSON.stringify(stats)).not.toContain('9000003501')
  })
})

describe('admin', () => {
  test('super-admin only, on every route', async () => {
    for (const [method, path, body] of ADMIN_ROUTES) {
      expect({ path, status: (await call(method, path, null, body)).status }).toEqual({ path, status: 401 })
      expect({ path, status: (await call(method, path, 'me', body)).status }).toEqual({ path, status: 403 })
    }
    expect(createCalls).toEqual([])
    expect(stateCalls).toEqual([])
    expect((await call('GET', '/admin/rewards/challenges', 'superAdmin')).status).toBe(200)
  })

  test('achievements: every badge with its switch, bonus and counts', async () => {
    const { body } = await call('GET', '/admin/rewards/achievements', 'breakGlass')
    const badges = body.data!.badges as Array<Record<string, unknown>>
    // 19 from 0054, plus Garage Legend (0057).
    expect(badges).toHaveLength(20)
    expect(badges[0]).toMatchObject({ key: 'first_shine', enabled: true, bonusStamps: 1, earned: 12, earnedThisMonth: 3 })
  })

  test('a challenge is checked whole (400) and created as a draft signed by the session', async () => {
    const bad = { ...CHALLENGE(), rewardKind: 'voucher', rewardAmount: 100, rewardMultiplier: null, maxWinners: null }
    const refused = await call('POST', '/admin/rewards/challenges', 'breakGlass', bad)
    expect(refused).toMatchObject({ status: 400, body: { code: 'CHALLENGE_INVALID' } })
    expect(refused.body.message).toContain('limit on winners')
    expect((await call('POST', '/admin/rewards/challenges', 'breakGlass', { ...CHALLENGE(), secret: 1 })).status).toBe(400)
    expect(createCalls).toEqual([])
    const created = await call('POST', '/admin/rewards/challenges', 'breakGlass', CHALLENGE())
    expect(created.status).toBe(201)
    expect(createCalls[0]).toMatchObject({ title: 'Diwali Shine', actorName: 'admin', rewardMultiplier: 2 })
  })

  test('publishing never starts a challenge in the past; ending a draft is refused', async () => {
    const published = await call('POST', `/admin/rewards/challenges/${CHALLENGE_ID}/publish`, 'breakGlass', { actorName: 'Asha' })
    expect(published.status).toBe(200)
    stateRow = { startDate: dayKey(-1), endDate: dayKey(5) }
    const late = await call('POST', `/admin/rewards/challenges/${CHALLENGE_ID}/publish`, 'breakGlass', { actorName: 'Asha' })
    expect(late).toMatchObject({ status: 409, body: { code: 'CHALLENGE_NOT_PUBLISHABLE' } })
    stateRow = {}
    const ended = await call('POST', `/admin/rewards/challenges/${CHALLENGE_ID}/end`, 'breakGlass', { actorName: 'Asha' })
    expect(ended).toMatchObject({ status: 409, body: { code: 'CHALLENGE_NOT_RUNNING' } })
    expect(stateCalls.map((c) => c.actorName)).toEqual(['admin', 'admin', 'admin'])
  })

  test('results come with masked phones', async () => {
    const { body } = await call('GET', `/admin/rewards/challenges/${CHALLENGE_ID}/results`, 'breakGlass')
    const rows = body.data!.rows as Array<{ phone: string }>
    expect(rows[0].phone).toBe('••••••3501')
    expect(JSON.stringify(body.data)).not.toContain('9000003501')
  })

  test('Wrapped stats are counts only', async () => {
    const { body } = await call('GET', '/admin/rewards/wrapped/stats?year=2026', 'breakGlass')
    expect(body.data).toEqual({ year: 2026, customersWithWashes: 40, notified: 30, made: 20, opened: 18, opens: 25, sharers: 6, shares: 9 })
  })
})

describe('celebrations, once', () => {
  const counted = () => ({
    kind: 'counted',
    userId: PEOPLE.me,
    badges: [{ id: AWARD_MINE, key: 'first_shine', challengeId: null, bonusStamps: 1 }],
    wins: [],
    oneLeft: [],
    full: [],
    vouchers: [],
    capAlert: null,
  })
  const midday = new Date('2026-10-18T12:00:00+05:30')

  test('a badge is told once, however often the same stamp is counted', async () => {
    countResults = [counted(), { kind: 'already' }]
    await rewardExtrasService.onStampEarned(PEOPLE.me, BOOKING_ID, midday)
    await rewardExtrasService.onStampEarned(PEOPLE.me, BOOKING_ID, midday)
    expect(nudgeClaims).toHaveLength(1)
    expect(nudgeClaims[0]).toMatchObject({ userId: PEOPLE.me, kind: 'badge', subjectKey: `badge:${AWARD_MINE}`, linkUrl: `/profile/rewards?badge=${AWARD_MINE}` })
    expect(pushes).toEqual([{ userId: PEOPLE.me, title: 'Badge earned: First Shine' }])
  })

  test('the claim is the gate: a second celebration of the same badge sends nothing', async () => {
    countResults = [counted(), counted()]
    await rewardExtrasService.onStampEarned(PEOPLE.me, BOOKING_ID, midday)
    await rewardExtrasService.onStampEarned(PEOPLE.me, BOOKING_ID, midday)
    expect(nudgeClaims).toHaveLength(2)
    expect(pushes).toHaveLength(1)
  })

  test('at night it waits for the morning (nothing claimed now)', async () => {
    countResults = [counted()]
    await rewardExtrasService.onStampEarned(PEOPLE.me, BOOKING_ID, new Date('2026-10-18T22:30:00+05:30'))
    expect(nudgeClaims).toEqual([])
    expect(pushes).toEqual([])
  })

  test('badges, wins and Wrapped are celebrations (no gap); challenge reminders are not', () => {
    expect(isCelebratoryNudge('badge')).toBe(true)
    expect(isCelebratoryNudge('challenge_won')).toBe(true)
    expect(isCelebratoryNudge('wrapped')).toBe(true)
    expect(isCelebratoryNudge('challenge_start')).toBe(false)
    expect(isCelebratoryNudge('challenge_one_left')).toBe(false)
    expect(isCelebratoryNudge('wash_due')).toBe(false)
  })
})
