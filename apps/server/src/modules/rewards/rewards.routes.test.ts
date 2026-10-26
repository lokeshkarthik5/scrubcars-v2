/**
 * Detlio Rewards (0050) through the real routes and the real auth
 * middleware: the two switches, who may do what, and that the customer's
 * id always comes from the session. Only the database is stood in for (the
 * rewards and discounts repositories, put back afterwards).
 *
 * The rules: while REWARDS_ENABLED is off every route but the /config ones
 * is a 404 (and checkout refuses a reward code); with it on but the admin's
 * switch off, customers get 404s and admin still works. Customers read and
 * scratch only their own (anyone else's card is a 404, the same as none).
 * Admin routes are super-admin only; settings are checked whole, saved
 * only on top of the version opened, and audit-logged. A reward voucher at
 * checkout is only ever its owner's.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { DEFAULT_REWARDS_SETTINGS, inviteToken, lastValidDay } = await import('../../lib/rewards.js')
const { membersRepository } = await import('../members/members.repository.js')
const { rewardsRepository } = await import('./rewards.repository.js')
const { forgetSettings } = await import('./rewards.settings.js')
const { adminRewardRoutes, customerRewardRoutes, publicRewardRoutes } = await import('./rewards.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')
const { discountsRepository } = await import('../discounts/discounts.repository.js')
const { resolveDiscount } = await import('../discounts/discounts.service.js')

const PEOPLE = {
  me: 'e2e00000-0000-4000-8000-000000003001',
  other: 'e2e00000-0000-4000-8000-000000003002',
  superAdmin: 'e2e00000-0000-4000-8000-000000003005',
}
const CARD_ID = 'e2e00000-0000-4000-8000-000000003010'
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

let settingsRow = { version: 1, settings: structuredClone(DEFAULT_REWARDS_SETTINGS), actorName: 'Detlio (defaults)', actorSub: null, createdAt: NOW }
function master(on: boolean) {
  envValues.rewardsEnabled = on
  forgetSettings()
}
function adminSwitch(on: boolean) {
  settingsRow = { ...settingsRow, settings: { ...settingsRow.settings, enabled: on } }
  forgetSettings()
}

const scratchCalls: Array<{ userId: string; cardId: string }> = []
const saveCalls: Array<Record<string, unknown>> = []
const adjustCalls: Array<Record<string, unknown>> = []
const birthdayCalls: Array<{ userId: string; birthday: unknown }> = []
const claimInserts: Array<Record<string, unknown>> = []

beforeAll(() => {
  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  // requireSuperAdmin signs every admin write with the session's name (0058).
  patch(membersRepository, 'findUserById', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { id: userId, name: 'Signed-in Sam', phone: '9000009999' } : undefined
  )
  patch(rewardsRepository, 'latestSettings', async () => settingsRow)
  patch(rewardsRepository, 'listSettingsVersions', async () => [{ version: settingsRow.version, actorName: settingsRow.actorName, createdAt: NOW }])
  patch(rewardsRepository, 'saveSettings', async (input: { expectedVersion: number }) => {
    saveCalls.push(input)
    return input.expectedVersion === settingsRow.version ? { kind: 'saved', version: settingsRow.version + 1 } : { kind: 'stale', version: settingsRow.version }
  })
  patch(rewardsRepository, 'listStamps', async () => [])
  patch(rewardsRepository, 'levelFacts', async () => ({ completedAt: [], drops: 0 }))
  patch(rewardsRepository, 'earnedMonths', async () => [])
  patch(rewardsRepository, 'listVouchers', async () => [])
  patch(rewardsRepository, 'listScratchCards', async () => [])
  patch(rewardsRepository, 'listJudged', async () => [])
  patch(rewardsRepository, 'listLevelDrops', async () => [])
  patch(rewardsRepository, 'findReferralCode', async () => null)
  patch(rewardsRepository, 'findReferralOf', async () => undefined)
  patch(rewardsRepository, 'lifetime', async () => ({ saved: '0.00', washes: 0, since: null }))
  patch(rewardsRepository, 'findBirthday', async () => null)
  patch(rewardsRepository, 'setBirthday', async (userId: string, birthday: unknown) => {
    birthdayCalls.push({ userId, birthday })
  })
  patch(rewardsRepository, 'scratch', async (input: { userId: string; cardId: string }) => {
    scratchCalls.push(input)
    // The card is mine; anyone else's lookup finds nothing.
    if (input.userId !== PEOPLE.me) return { kind: 'not_found' }
    return { kind: 'revealed', already: false, outcome: 'medium_off', prizeAmount: '50.00', fellBack: false, voucher: { id: 'v1', code: 'RWABCDEFGH', amount: '50.00', expiresAt: new Date(NOW.getTime() + 60 * 86400000) }, vouchers: [], capAlert: null }
  })
  patch(rewardsRepository, 'findReferrerByCode', async (code: string) => (code === 'ABCD2345' ? { userId: PEOPLE.other, name: 'Ravi Kumar' } : undefined))
  patch(rewardsRepository, 'recordInviteOpen', async () => undefined)
  patch(rewardsRepository, 'findUserPhone', async () => ({ phone: '9000003001', createdAt: new Date(NOW.getTime() + 1000) }))
  patch(rewardsRepository, 'claimFacts', async () => ({ alreadyReferred: false, phoneSeen: false, hasBookings: false }))
  patch(rewardsRepository, 'insertReferral', async (input: Record<string, unknown>) => {
    claimInserts.push(input)
    return true
  })
  patch(rewardsRepository, 'findCustomerById', async (userId: string) =>
    userId === PEOPLE.me ? { id: userId, name: 'Meena', phone: '9000003001', createdAt: NOW, birthdayMonth: null, birthdayDay: null } : undefined
  )
  patch(rewardsRepository, 'listReferralsBy', async () => [])
  patch(rewardsRepository, 'heavyDiscountCountsOf', async () => ({ earned: 0, heavy: 0 }))
  patch(rewardsRepository, 'listPerks', async () => [])
  patch(rewardsRepository, 'adjust', async (input: Record<string, unknown>) => {
    adjustCalls.push(input)
    return { kind: 'ok', issued: [], capAlert: null }
  })
  patch(discountsRepository, 'findByCode', async (code: string) =>
    code.toUpperCase() === 'RWMINE1234'
      ? {
          id: 'd-reward', code: 'RWMINE1234', discountType: 'fixed', percentOff: null, amountOff: '299.00', maxDiscountAmount: null,
          minOrderAmount: null, vendorId: null, fundedBy: 'platform', startsAt: null, endsAt: new Date(NOW.getTime() + 86400000),
          isActive: true, perUserLimit: 1, totalUsageLimit: 1, source: 'reward',
        }
      : undefined
  )
  patch(discountsRepository, 'findRewardVoucher', async () => ({ userId: PEOPLE.me, cancelledAt: null }))
  patch(discountsRepository, 'countHeld', async () => 0)
})

beforeEach(() => {
  settingsRow = { version: 1, settings: structuredClone(DEFAULT_REWARDS_SETTINGS), actorName: 'Detlio (defaults)', actorSub: null, createdAt: NOW }
  master(true)
  scratchCalls.length = 0
  saveCalls.length = 0
  adjustCalls.length = 0
  birthdayCalls.length = 0
  claimInserts.length = 0
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
users.route('/me/rewards', customerRewardRoutes)
app.route('/users', users)
app.route('/rewards', publicRewardRoutes)
app.route('/admin/rewards', adminRewardRoutes)

type Who = keyof typeof PEOPLE | 'breakGlass' | null

async function cookieFor(who: Who): Promise<Record<string, string>> {
  if (who === null) return {}
  const token =
    who === 'breakGlass'
      ? await signAdminToken()
      : await signAccessToken({ sub: PEOPLE[who], aud: 'customer', isCustomer: who !== 'superAdmin', isVendorOwner: false })
  return { Cookie: `access_token=${token}` }
}

let ip = 0
async function call(method: string, path: string, who: Who, body?: unknown) {
  ip += 1
  const response = await app.request(path, {
    method,
    headers: { ...(await cookieFor(who)), 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip % 250}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; message?: string; data?: Record<string, unknown> }
  return { status: response.status, body: json }
}

const SAVE = () => ({ version: 1, settings: structuredClone(DEFAULT_REWARDS_SETTINGS), actorName: 'Asha' })

describe('while REWARDS_ENABLED is off (the default)', () => {
  test('every route but /config is a 404, and /config says off', async () => {
    master(false)
    const routes: Array<[string, string, Who, unknown?]> = [
      ['GET', '/users/me/rewards', 'me'],
      ['GET', '/users/me/rewards/summary', 'me'],
      ['POST', `/users/me/rewards/scratch-cards/${CARD_ID}/scratch`, 'me'],
      ['POST', '/users/me/rewards/invite', 'me'],
      ['PUT', '/users/me/rewards/birthday', 'me', { birthday: { month: 5, day: 4 } }],
      ['POST', '/rewards/invites/open', null, { code: 'ABCD2345' }],
      ['GET', '/admin/rewards/settings', 'breakGlass'],
      ['PUT', '/admin/rewards/settings', 'breakGlass', SAVE()],
      ['GET', '/admin/rewards/summary', 'breakGlass'],
      ['GET', '/admin/rewards/ledger', 'breakGlass'],
      ['POST', '/admin/rewards/find', 'breakGlass', { phone: '9000003001' }],
      ['POST', `/admin/rewards/customers/${PEOPLE.me}/adjust`, 'breakGlass', { action: 'add_stamps', stamps: 1, reason: 'Goodwill', actorName: 'Asha' }],
    ]
    for (const [method, path, who, body] of routes) {
      const { status, body: json } = await call(method, path, who, body)
      expect({ path, status, code: json.code }).toEqual({ path, status: 404, code: 'NOT_FOUND' })
    }
    expect((await call('GET', '/rewards/config', null)).body.data).toEqual({ enabled: false, settings: null, garage: { live: false } })
    expect((await call('GET', '/admin/rewards/config', 'breakGlass')).body.data).toEqual({ masterSwitch: false })
    expect(scratchCalls).toEqual([])
    expect(saveCalls).toEqual([])
    expect(adjustCalls).toEqual([])
  })

  test('a reward voucher is refused at checkout', async () => {
    master(false)
    await expect(resolveDiscount({ code: 'RWMINE1234', userId: PEOPLE.me, vendorId: 'v', subtotal: '399.00' })).rejects.toMatchObject({ code: 'REWARDS_PAUSED' })
  })
})

describe("the admin's switch", () => {
  test('off: customers get 404s, /config says off, admin still works', async () => {
    adminSwitch(false)
    expect((await call('GET', '/users/me/rewards', 'me')).status).toBe(404)
    expect((await call('GET', '/rewards/config', null)).body.data).toEqual({ enabled: false, settings: null, garage: { live: false } })
    const settings = await call('GET', '/admin/rewards/settings', 'breakGlass')
    expect(settings.status).toBe(200)
    expect(settings.body.data).toMatchObject({ masterSwitch: true, live: false, version: 1 })
  })

  test('on: /config gives the live numbers but never the budget', async () => {
    const { body } = await call('GET', '/rewards/config', null)
    expect(body.data?.enabled).toBe(true)
    const settings = body.data?.settings as Record<string, unknown>
    expect(settings.stampsPerCard).toBe(5)
    expect(settings.monthlyCap).toBeUndefined()
  })
})

describe('the customer', () => {
  test('signed in only; always their own', async () => {
    expect((await call('GET', '/users/me/rewards', null)).status).toBe(401)
    const { status, body } = await call('GET', '/users/me/rewards', 'me')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ card: { onCard: 0, goal: 5, toGo: 5, rewardAmount: 299 }, level: { level: 'member', next: 'silver', toNext: 3 } })
    expect((body.data!.ladder as unknown[]).length).toBe(6)
  })

  test("scratching: their own card reveals; anyone else's is a 404, the same as none", async () => {
    const mine = await call('POST', `/users/me/rewards/scratch-cards/${CARD_ID}/scratch`, 'me')
    expect(mine.status).toBe(200)
    expect(mine.body.data).toMatchObject({ outcome: 'medium_off', label: '₹50 off', voucher: { code: 'RWABCDEFGH' } })
    const theirs = await call('POST', `/users/me/rewards/scratch-cards/${CARD_ID}/scratch`, 'other')
    expect(theirs).toMatchObject({ status: 404, body: { code: 'SCRATCH_CARD_NOT_FOUND' } })
    // The session's id reached the repository, never a parameter.
    expect(scratchCalls.map((c) => c.userId)).toEqual([PEOPLE.me, PEOPLE.other])
  })

  test('a card scratched earlier says when to use its voucher, as one just scratched does', async () => {
    const DAY = 86400000
    const voucherEnds = new Date(NOW.getTime() + 20 * DAY)
    const repo = rewardsRepository as unknown as Patchable
    const [cards, vouchers] = [repo.listScratchCards, repo.listVouchers]
    repo.listScratchCards = async () => [
      {
        id: CARD_ID,
        rootBookingId: 'e2e00000-0000-4000-8000-000000003020',
        bookingId: 'e2e00000-0000-4000-8000-000000003020',
        outcome: 'medium_off',
        drawnOutcome: 'medium_off',
        prizeAmount: '50.00',
        fellBack: false,
        level: 'member',
        createdAt: new Date(NOW.getTime() - 2 * DAY),
        expiresAt: new Date(NOW.getTime() + 28 * DAY),
        scratchedAt: new Date(NOW.getTime() - DAY),
        voidedAt: null,
        voucherId: 'v1',
        vendorName: 'Shine Garage',
      },
    ]
    repo.listVouchers = async () => [
      {
        id: 'v1',
        kind: 'scratch',
        amount: '50.00',
        code: 'RWABCDEFGH',
        level: null,
        sourceBookingId: 'e2e00000-0000-4000-8000-000000003020',
        issuedAt: new Date(NOW.getTime() - DAY),
        expiresAt: voucherEnds,
        cancelledAt: null,
        reason: null,
        actorName: null,
        heldBookingId: null,
      },
    ]
    try {
      const { status, body } = await call('GET', '/users/me/rewards', 'me')
      expect(status).toBe(200)
      expect((body.data!.scratchCards as unknown[])[0]).toMatchObject({
        state: 'scratched',
        prize: { label: '₹50 off', voucher: { lastDay: lastValidDay(voucherEnds), state: 'available' } },
      })
    } finally {
      repo.listScratchCards = cards
      repo.listVouchers = vouchers
    }
  })

  test('birthday: month and day, checked, for the session only', async () => {
    expect((await call('PUT', '/users/me/rewards/birthday', 'me', { birthday: { month: 2, day: 30 } })).body.code).toBe('BIRTHDAY_INVALID')
    expect((await call('PUT', '/users/me/rewards/birthday', 'me', { birthday: { month: 5, day: 4 }, userId: PEOPLE.other })).status).toBe(400)
    expect((await call('PUT', '/users/me/rewards/birthday', 'me', { birthday: { month: 5, day: 4 } })).status).toBe(200)
    expect(birthdayCalls).toEqual([{ userId: PEOPLE.me, birthday: { month: 5, day: 4 } }])
  })

  test('an invite: opened by anyone (first name only), taken up by a signed-in new customer with a valid token', async () => {
    const opened = await call('POST', '/rewards/invites/open', null, { code: 'abcd2345' })
    expect(opened.status).toBe(200)
    expect(opened.body.data).toMatchObject({ referrerFirstName: 'Ravi', amount: 100 })
    expect(JSON.stringify(opened.body.data)).not.toContain('Kumar')
    expect((await call('POST', '/rewards/invites/open', null, { code: 'ZZZZ2345' })).status).toBe(404)

    expect((await call('POST', '/users/me/rewards/invite/claim', 'me', { token: 'not-a-real-token-at-all' })).body.code).toBe('INVITE_INVALID')
    const token = String(opened.body.data!.token)
    const claimed = await call('POST', '/users/me/rewards/invite/claim', 'me', { token })
    expect(claimed.status).toBe(200)
    expect(claimInserts).toHaveLength(1)
    expect(claimInserts[0]).toMatchObject({ referrerId: PEOPLE.other, refereeId: PEOPLE.me })
    // Only a hash of the phone is stored.
    expect(JSON.stringify(claimInserts[0])).not.toContain('9000003001')
  })

  test('the inviter cannot take up their own invite', async () => {
    const token = inviteToken('ABCD2345', NOW, env.jwtSecret)
    const own = await call('POST', '/users/me/rewards/invite/claim', 'other', { token })
    expect(own).toMatchObject({ status: 409, body: { code: 'INVITE_OWN_CODE' } })
  })
})

describe('admin', () => {
  test('super-admin only', async () => {
    for (const who of [null, 'me'] as Who[]) {
      const { status } = await call('GET', '/admin/rewards/settings', who)
      expect([401, 403]).toContain(status)
    }
    expect((await call('GET', '/admin/rewards/settings', 'superAdmin')).status).toBe(200)
    expect((await call('PUT', '/admin/rewards/settings', 'me', SAVE())).status).toBe(403)
    expect((await call('POST', `/admin/rewards/customers/${PEOPLE.me}/adjust`, 'me', { action: 'add_stamps', stamps: 1, reason: 'Goodwill', actorName: 'Asha' })).status).toBe(403)
    expect(saveCalls).toEqual([])
    expect(adjustCalls).toEqual([])
  })

  test('settings: checked whole (400), only on top of the version opened (409), saved with the session name (the shared login signs as admin)', async () => {
    const bad = SAVE()
    bad.settings.scratchWeights.small_off = 50
    const refused = await call('PUT', '/admin/rewards/settings', 'breakGlass', bad)
    expect(refused).toMatchObject({ status: 400, body: { code: 'REWARD_SETTINGS_INVALID' } })
    expect(refused.body.message).toContain('add up to 100')
    expect(saveCalls).toEqual([])

    const stale = await call('PUT', '/admin/rewards/settings', 'breakGlass', { ...SAVE(), version: 0 })
    expect(stale).toMatchObject({ status: 409, body: { code: 'REWARD_SETTINGS_CHANGED' } })

    const good = SAVE()
    good.settings.minPaidAmount = 249
    expect((await call('PUT', '/admin/rewards/settings', 'breakGlass', good)).status).toBe(200)
    expect(saveCalls.at(-1)).toMatchObject({ expectedVersion: 1, actorName: 'admin', settings: { minPaidAmount: 249 } })

    // Unknown keys are refused, not stored.
    const extra = SAVE() as Record<string, unknown>
    ;(extra.settings as Record<string, unknown>).secret = 1
    expect((await call('PUT', '/admin/rewards/settings', 'breakGlass', extra)).status).toBe(400)
  })

  test('adjustments need a reason, are signed by the session (a typed name is ignored), and name the customer from the path', async () => {
    expect((await call('POST', `/admin/rewards/customers/${PEOPLE.me}/adjust`, 'breakGlass', { action: 'add_stamps', stamps: 1, actorName: 'Asha' })).status).toBe(400)
    expect((await call('POST', `/admin/rewards/customers/${PEOPLE.me}/adjust`, 'breakGlass', { action: 'issue_voucher', amount: 5000, reason: 'Goodwill', actorName: 'Asha' })).status).toBe(400)
    const ok = await call('POST', `/admin/rewards/customers/${PEOPLE.me}/adjust`, 'breakGlass', { action: 'add_stamps', stamps: 2, reason: 'Missed stamp', actorName: 'Asha' })
    expect(ok.status).toBe(200)
    expect(adjustCalls[0]).toMatchObject({ userId: PEOPLE.me, action: { kind: 'add_stamps', stamps: 2 }, reason: 'Missed stamp', actorName: 'admin' })
  })
})

describe('a reward voucher at checkout', () => {
  test("only its owner can use it; anyone else hears the same as a code that doesn't exist", async () => {
    const mine = await resolveDiscount({ code: 'RWMINE1234', userId: PEOPLE.me, vendorId: 'v', subtotal: '399.00' })
    expect(mine).toMatchObject({ discountAmount: '299.00', finalAmount: '100.00', fundedBy: 'platform' })
    await expect(resolveDiscount({ code: 'RWMINE1234', userId: PEOPLE.other, vendorId: 'v', subtotal: '399.00' })).rejects.toMatchObject({ code: 'DISCOUNT_NOT_FOUND' })
  })

  test('the admin switch off pauses vouchers too', async () => {
    adminSwitch(false)
    await expect(resolveDiscount({ code: 'RWMINE1234', userId: PEOPLE.me, vendorId: 'v', subtotal: '399.00' })).rejects.toMatchObject({ code: 'REWARDS_PAUSED' })
  })

  test('never takes it below ₹1 (Razorpay minimum): a ₹299 wash with ₹299 off costs ₹1', async () => {
    const free = await resolveDiscount({ code: 'RWMINE1234', userId: PEOPLE.me, vendorId: 'v', subtotal: '299.00' })
    expect(free).toMatchObject({ discountAmount: '298.00', finalAmount: '1.00' })
  })
})
