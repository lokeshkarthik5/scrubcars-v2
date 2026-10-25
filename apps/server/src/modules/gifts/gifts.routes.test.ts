/**
 * Gift a wash (0049) through the real routes and the real auth middleware:
 * who may do what, the switch, and the limits on guessing codes. Only the
 * database is stood in for (the gifts and credit repositories, put back
 * afterwards), and Razorpay is E2E_FAKE_PAYMENTS' stand-in.
 *
 * The rules: while GIFTS_ENABLED is off every route but the two /config
 * ones is a 404. A customer sees, pays for and links only gifts they bought
 * (anyone else's is a 404, the same as none). Redeeming needs a session and
 * credits the session's customer, never a parameter. Wrong codes are counted
 * per network address and per customer; past the limit nothing is looked up.
 * The code is never stored: only its hash reaches the repository. Admin
 * routes are super-admin only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { giftCodeHash, giftExpiresAt, normalizeGiftCode } = await import('../../lib/gift-credit.js')
const { membersRepository } = await import('../members/members.repository.js')
const { giftsRepository } = await import('./gifts.repository.js')
const { giftCreditRepository } = await import('../gift-credit/gift-credit.repository.js')
const { adminGiftRoutes, customerGiftRoutes, publicGiftRoutes } = await import('./gifts.routes.js')
const { adminCreditRoutes, customerCreditRoutes } = await import('../gift-credit/gift-credit.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const PEOPLE = {
  buyer: 'e2e00000-0000-4000-8000-000000002901',
  friend: 'e2e00000-0000-4000-8000-000000002902',
  superAdmin: 'e2e00000-0000-4000-8000-000000002905',
}
const GIFT_ID = 'e2e00000-0000-4000-8000-000000002910'
const CODE = 'ABCDEFGHJKMNPQRS'
const NOW = new Date()
const PAID_AT = new Date(NOW.getTime() - 60 * 60 * 1000)

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['giftsEnabled', 'e2eFakePayments', 'razorpayKeyId', 'razorpayKeySecret'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))
function giftsOn(on: boolean) {
  envValues.giftsEnabled = on
}

type GiftRow = Record<string, unknown> & { id: string; buyerId: string; status: string; codeHash: string | null }
function giftRow(overrides: Partial<GiftRow> = {}): GiftRow {
  return {
    id: GIFT_ID,
    number: 42,
    buyerId: PEOPLE.buyer,
    amount: '1000.00',
    recipientName: 'Meena',
    message: 'Happy birthday!',
    design: 'shine',
    status: 'paid',
    codeHash: giftCodeHash(CODE),
    linksIssued: 1,
    gatewayOrderId: 'order_e2e_1',
    gatewayPaymentId: 'pay_e2e_1',
    gatewayMode: 'fake',
    paidAt: PAID_AT,
    expiresAt: giftExpiresAt(PAID_AT),
    redeemedBy: null,
    redeemedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: PAID_AT,
    ...overrides,
  }
}

let gift: GiftRow = giftRow()
let failures = { ipFailures: 0, userFailures: 0 as number | null }
const recorded: Array<{ userId: string | null; ipKey: string }> = []
const codeHashesSet: string[] = []
const redeemCalls: Array<{ giftId: string; userId: string }> = []
const adjustCalls: Array<Record<string, unknown>> = []

beforeAll(() => {
  envValues.e2eFakePayments = true
  envValues.razorpayKeyId = 'rzp_test_gifts'
  envValues.razorpayKeySecret = 'secret'

  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )

  patch(giftsRepository, 'createPending', async (input: { amount: number; buyerId: string }) =>
    input.amount === 2000 && failures.ipFailures === -1
      ? { kind: 'over_limit', boughtTodayPaise: 900000 }
      : { kind: 'created', gift: giftRow({ status: 'pending', buyerId: input.buyerId, amount: `${input.amount}.00`, paidAt: null, expiresAt: null, codeHash: null }) }
  )
  patch(giftsRepository, 'setOrder', async () => undefined)
  patch(giftsRepository, 'findById', async (id: string) => (id === gift.id ? gift : undefined))
  patch(giftsRepository, 'findByCodeHash', async (hash: string) => (hash === gift.codeHash ? gift : undefined))
  patch(giftsRepository, 'findBuyerName', async () => ({ name: 'Ravi Kumar' }))
  patch(giftsRepository, 'markPaid', async (input: { giftId: string; paymentId: string }) => {
    if (gift.status !== 'pending') return null
    gift = { ...gift, status: 'paid', gatewayPaymentId: input.paymentId, paidAt: NOW, expiresAt: giftExpiresAt(NOW) }
    return gift
  })
  patch(giftsRepository, 'setCode', async (input: { giftId: string; buyerId: string; codeHash: string }) => {
    if (input.buyerId !== gift.buyerId || gift.status !== 'paid') return null
    codeHashesSet.push(input.codeHash)
    gift = { ...gift, codeHash: input.codeHash }
    return { ...gift, linksIssued: 2 }
  })
  patch(giftsRepository, 'countRecentFailures', async () => failures)
  patch(giftsRepository, 'recordFailure', async (input: { userId: string | null; ipKey: string }) => {
    recorded.push(input)
  })
  patch(giftsRepository, 'redeemGift', async (input: { giftId: string; userId: string }) => {
    redeemCalls.push(input)
    if (gift.status === 'redeemed') return { kind: 'refused', refusal: 'redeemed', gift }
    gift = { ...gift, status: 'redeemed', redeemedBy: input.userId, redeemedAt: NOW }
    return { kind: 'redeemed', gift, balancePaise: 100000 }
  })
  patch(giftsRepository, 'listForBuyer', async (buyerId: string) => (buyerId === gift.buyerId ? [gift] : []))
  patch(giftsRepository, 'totals', async () => ({ soldCount: 1, soldAmount: '1000', unredeemedCount: 1, unredeemedAmount: '1000' }))

  patch(giftCreditRepository, 'listEntries', async () => [])
  patch(giftCreditRepository, 'listRecentEntries', async () => [])
  patch(giftCreditRepository, 'outstanding', async () => ({ balance: '250.00', expiringSoon: '0.00', customers: 1 }))
  patch(giftCreditRepository, 'totalsByKind', async () => ({}))
  patch(giftCreditRepository, 'findCustomerById', async (userId: string) =>
    userId === PEOPLE.friend ? { id: userId, name: 'Meena', phone: '9000002902' } : undefined
  )
  patch(giftCreditRepository, 'adjust', async (input: Record<string, unknown>) => {
    adjustCalls.push(input)
    return { kind: 'ok', balancePaise: 20000 }
  })
})

beforeEach(() => {
  gift = giftRow()
  failures = { ipFailures: 0, userFailures: 0 }
  recorded.length = 0
  codeHashesSet.length = 0
  redeemCalls.length = 0
  adjustCalls.length = 0
  giftsOn(true)
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

// ─── The app, wired the way app.ts, users.routes.ts and admin.routes.ts wire it ──

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
const users = new Hono()
users.use('*', authMiddleware, requireCustomer)
users.route('/me/gifts', customerGiftRoutes)
users.route('/me/credit', customerCreditRoutes)
app.route('/users', users)
app.route('/gifts', publicGiftRoutes)
app.route('/admin/gifts/credit', adminCreditRoutes)
app.route('/admin/gifts', adminGiftRoutes)

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
    headers: {
      ...(await cookieFor(who)),
      'content-type': 'application/json',
      // A fresh address per call, so the per-minute burst limiter never decides a test.
      'x-forwarded-for': `198.51.100.${ip % 250}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json()) as { code?: string; message?: string; data?: Record<string, unknown> }
  return { status: response.status, body: json }
}

describe('while GIFTS_ENABLED is off', () => {
  test('every route but /config is a 404, and /config says off', async () => {
    giftsOn(false)
    const routes: Array<[string, string, Who, unknown?]> = [
      ['POST', '/gifts/lookup', null, { code: CODE }],
      ['GET', '/users/me/gifts', 'buyer'],
      ['POST', '/users/me/gifts', 'buyer', { amount: 500, recipientName: 'Meena', design: 'shine' }],
      ['POST', '/users/me/gifts/redeem', 'friend', { code: CODE }],
      ['POST', `/users/me/gifts/${GIFT_ID}/link`, 'buyer'],
      ['GET', '/users/me/credit', 'friend'],
      ['GET', '/admin/gifts/summary', 'breakGlass'],
      ['GET', '/admin/gifts', 'breakGlass'],
      ['POST', '/admin/gifts/credit/find', 'breakGlass', { phone: '9000002902' }],
      ['POST', `/admin/gifts/credit/customers/${PEOPLE.friend}/adjust`, 'breakGlass', { amount: 100, reason: 'Goodwill', actorName: 'Asha' }],
    ]
    for (const [method, path, who, body] of routes) {
      const { status, body: json } = await call(method, path, who, body)
      expect({ path, status, code: json.code }).toEqual({ path, status: 404, code: 'NOT_FOUND' })
    }
    expect((await call('GET', '/gifts/config', null)).body.data).toMatchObject({ enabled: false })
    expect((await call('GET', '/admin/gifts/config', 'breakGlass')).body.data).toMatchObject({ enabled: false })
    expect(redeemCalls).toEqual([])
    expect(adjustCalls).toEqual([])
  })
})

describe('buying a gift', () => {
  test('signed-in customers only; the order is for the gift amount, and nothing about a code', async () => {
    expect((await call('POST', '/users/me/gifts', null, { amount: 500, recipientName: 'Meena', design: 'shine' })).status).toBe(401)
    const { status, body } = await call('POST', '/users/me/gifts', 'buyer', { amount: 1000, recipientName: 'Meena', message: 'Enjoy!', design: 'fresh' })
    expect(status).toBe(201)
    expect(body.data).toMatchObject({ amount: 100000, currency: 'INR', keyId: 'rzp_test_gifts' })
    expect(String(body.data!.orderId)).toStartWith('order_e2e_')
    expect(JSON.stringify(body)).not.toContain('code')
  })

  test('amounts outside ₹300–₹5,000, fractions, unknown designs and extra fields are refused', async () => {
    for (const bad of [
      { amount: 299, recipientName: 'Meena', design: 'shine' },
      { amount: 5001, recipientName: 'Meena', design: 'shine' },
      { amount: 450.5, recipientName: 'Meena', design: 'shine' },
      { amount: 500, recipientName: 'Meena', design: 'gold' },
      { amount: 500, recipientName: '', design: 'shine' },
      { amount: 500, recipientName: 'Meena', design: 'shine', buyerId: PEOPLE.friend },
    ]) {
      expect((await call('POST', '/users/me/gifts', 'buyer', bad)).status).toBe(400)
    }
  })

  test('over the daily limit is a 409 with the words to show', async () => {
    failures.ipFailures = -1
    const { status, body } = await call('POST', '/users/me/gifts', 'buyer', { amount: 2000, recipientName: 'Meena', design: 'shine' })
    expect(status).toBe(409)
    expect(body.code).toBe('GIFT_DAILY_LIMIT')
    expect(body.message).toContain('₹1,000 is left for today')
  })

  test("verifying needs the buyer's own gift and a valid signature", async () => {
    gift = giftRow({ status: 'pending', gatewayOrderId: 'order_LIVE1', gatewayPaymentId: null, paidAt: null, expiresAt: null, codeHash: null })
    const payment = { razorpayOrderId: 'order_LIVE1', razorpayPaymentId: 'pay_LIVE1', razorpaySignature: 'forged' }
    expect((await call('POST', `/users/me/gifts/${GIFT_ID}/verify`, 'friend', payment)).status).toBe(404)
    const forged = await call('POST', `/users/me/gifts/${GIFT_ID}/verify`, 'buyer', payment)
    expect(forged.status).toBe(400)
    expect(forged.body.code).toBe('INVALID_SIGNATURE')
    expect(gift.status).toBe('pending')

    gift = { ...gift, gatewayOrderId: 'order_e2e_7' }
    const ok = await call('POST', `/users/me/gifts/${GIFT_ID}/verify`, 'buyer', { ...payment, razorpayOrderId: 'order_e2e_7', razorpayPaymentId: 'pay_e2e_7' })
    expect(ok.status).toBe(200)
    expect(ok.body.data!.gift).toMatchObject({ state: 'available', number: 'G-000042', amount: '1000.00', paymentId: 'pay_e2e_7' })
  })
})

describe('links', () => {
  test("only the buyer gets a link; it is shown once and only its hash is stored", async () => {
    expect((await call('POST', `/users/me/gifts/${GIFT_ID}/link`, 'friend')).status).toBe(404)
    const { status, body } = await call('POST', `/users/me/gifts/${GIFT_ID}/link`, 'buyer')
    expect(status).toBe(200)
    const code = normalizeGiftCode(String(body.data!.code))!
    expect(code).toHaveLength(16)
    expect(body.data!.path).toBe(`/gift/${code}`)
    expect(codeHashesSet).toEqual([giftCodeHash(code)])
    expect(codeHashesSet[0]).not.toContain(code)
  })

  test('a redeemed gift gets no new link', async () => {
    gift = giftRow({ status: 'redeemed', redeemedBy: PEOPLE.friend, redeemedAt: NOW })
    const { status, body } = await call('POST', `/users/me/gifts/${GIFT_ID}/link`, 'buyer')
    expect(status).toBe(409)
    expect(body.code).toBe('GIFT_ALREADY_REDEEMED')
  })

  test("the buyer's list never carries a code or its hash", async () => {
    const { body } = await call('GET', '/users/me/gifts', 'buyer')
    expect(JSON.stringify(body)).not.toContain(gift.codeHash!)
    expect((body.data!.gifts as unknown[]).length).toBe(1)
    expect((await call('GET', '/users/me/gifts', 'friend')).body.data!.gifts).toEqual([])
  })
})

describe('the gift page and redeeming', () => {
  test('anyone holding the code sees the card, with only the first name of who sent it', async () => {
    const { status, body } = await call('POST', '/gifts/lookup', null, { code: 'abcd-efgh-jkmn-pqrs' })
    expect(status).toBe(200)
    expect(body.data!.gift).toMatchObject({ amount: '1000.00', fromName: 'Ravi', state: 'available', code: 'ABCD-EFGH-JKMN-PQRS' })
    expect(JSON.stringify(body)).not.toContain('Kumar')
    expect(JSON.stringify(body)).not.toContain(PEOPLE.buyer)
  })

  test('a wrong code is a 404 and is counted, hashed by address', async () => {
    const { status, body } = await call('POST', '/gifts/lookup', null, { code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' })
    expect(status).toBe(404)
    expect(body.code).toBe('GIFT_NOT_FOUND')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.userId).toBeNull()
    expect(recorded[0]!.ipKey).toMatch(/^[0-9a-f]{32}$/)
  })

  test('past the limit nothing is looked up, even the right code', async () => {
    failures = { ipFailures: 30, userFailures: null }
    expect((await call('POST', '/gifts/lookup', null, { code: CODE })).status).toBe(429)
    failures = { ipFailures: 0, userFailures: 10 }
    const { status, body } = await call('POST', '/users/me/gifts/redeem', 'friend', { code: CODE })
    expect(status).toBe(429)
    expect(body.code).toBe('GIFT_CODE_RATE_LIMIT')
    expect(redeemCalls).toEqual([])
  })

  test("redeeming needs a session and credits the session's customer, once", async () => {
    expect((await call('POST', '/users/me/gifts/redeem', null, { code: CODE })).status).toBe(401)
    const first = await call('POST', '/users/me/gifts/redeem', 'friend', { code: CODE, userId: PEOPLE.buyer })
    expect(first.status).toBe(400)
    const ok = await call('POST', '/users/me/gifts/redeem', 'friend', { code: CODE })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ amount: '1000.00', balance: '1000.00' })
    expect(redeemCalls).toEqual([{ giftId: GIFT_ID, userId: PEOPLE.friend, now: expect.any(Date) } as never])
    const again = await call('POST', '/users/me/gifts/redeem', 'friend', { code: CODE })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('GIFT_ALREADY_REDEEMED')
  })

  test('an expired gift reads expired and is not redeemed', async () => {
    gift = giftRow({ expiresAt: new Date(NOW.getTime() - 1000) })
    expect((await call('POST', '/gifts/lookup', null, { code: CODE })).body.data!.gift).toMatchObject({ state: 'expired' })
  })
})

describe('admin', () => {
  test('super-admin only', async () => {
    expect((await call('GET', '/admin/gifts/summary', 'buyer')).status).toBe(403)
    expect((await call('GET', '/admin/gifts/credit/balances', 'friend')).status).toBe(403)
    expect((await call('POST', `/admin/gifts/credit/customers/${PEOPLE.friend}/adjust`, 'friend', { amount: 100, reason: 'Goodwill', actorName: 'Asha' })).status).toBe(403)
    const summary = await call('GET', '/admin/gifts/summary', 'superAdmin')
    expect(summary.status).toBe(200)
    // What Detlio owes: unredeemed gifts plus credit balances.
    expect(summary.body.data).toMatchObject({ liability: '1250.00' })
  })

  test('an adjustment needs a reason and a name, and records the session', async () => {
    const path = `/admin/gifts/credit/customers/${PEOPLE.friend}/adjust`
    expect((await call('POST', path, 'breakGlass', { amount: 100, reason: '', actorName: 'Asha' })).status).toBe(400)
    expect((await call('POST', path, 'breakGlass', { amount: 100, reason: 'Goodwill' })).status).toBe(400)
    expect((await call('POST', path, 'breakGlass', { amount: 10.555, reason: 'Goodwill', actorName: 'Asha' })).status).toBe(400)
    const { status } = await call('POST', path, 'breakGlass', { amount: -150.5, reason: 'Entered twice', actorName: 'Asha K' })
    expect(status).toBe(200)
    expect(adjustCalls[0]).toMatchObject({ userId: PEOPLE.friend, amountPaise: -15050, reason: 'Entered twice', actorName: 'Asha K', actorSub: 'admin' })
  })
})
