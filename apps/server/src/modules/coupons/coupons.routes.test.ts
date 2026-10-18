/**
 * Printed coupons (0056) through the real routes and the real auth
 * middleware: who may do what, and the limits on guessing codes. Only the
 * database is stood in for (the coupons and discounts repositories, put
 * back afterwards).
 *
 * The rules: batches, their codes and their redemptions are super-admin
 * only. A customer lists and adds coupons only for their own session (never
 * a parameter: the body is strict). The coupon page's lookup works signed
 * out. Wrong codes are counted per network address and per customer, and
 * past the limit nothing is looked up; a typo (the check character) is
 * neither looked up nor counted. Only a code's keyed hash reaches the
 * repository. And resolveDiscount lets only a coupon voucher's owner use
 * it, not once voided, not for a returning customer when it is for new
 * customers only, and only on its service type.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { couponCodeHash, couponKeys, deriveCouponCode, formatCouponCode } = await import('../../lib/coupons.js')
const { membersRepository } = await import('../members/members.repository.js')
const { couponsRepository } = await import('./coupons.repository.js')
const { discountsRepository } = await import('../discounts/discounts.repository.js')
const { resolveDiscount } = await import('../discounts/discounts.service.js')
const { adminCouponRoutes, customerCouponRoutes, publicCouponRoutes } = await import('./coupons.routes.js')
const { authMiddleware, requireCustomer } = await import('../../middleware/auth.middleware.js')

const PEOPLE = {
  holder: 'e2e00000-0000-4000-8000-000000003601',
  other: 'e2e00000-0000-4000-8000-000000003602',
  superAdmin: 'e2e00000-0000-4000-8000-000000003605',
}
const BATCH_ID = 'e2e00000-0000-4000-8000-000000003610'
const CODE_ID = 'e2e00000-0000-4000-8000-000000003611'
const DISCOUNT_ID = 'e2e00000-0000-4000-8000-000000003612'
const SECRET = 'coupon-route-test-secret'
const KEYS = couponKeys(SECRET)
const CODE = deriveCouponCode(KEYS.codeKey, BATCH_ID, 0)
const NOW = new Date()

// ─── Stand-ins for the database ──────────────────────────────────────────────

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const savedEnv = { couponSecret: envValues.couponSecret, rewardsEnabled: envValues.rewardsEnabled }

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID,
    name: 'Anna Nagar flyer',
    location: 'Anna Nagar 2nd Avenue',
    kind: 'unique',
    reward: 'amount',
    amountOff: '100.00',
    percentOff: null,
    maxDiscount: null,
    stamps: null,
    minOrderAmount: '499.00',
    vendorId: null,
    serviceCategory: null,
    newCustomersOnly: false,
    validFrom: new Date(NOW.getTime() - 86_400_000),
    validUntil: new Date(NOW.getTime() + 30 * 86_400_000),
    codeCount: 3,
    maxRedemptions: null,
    keyId: KEYS.keyId,
    createdByName: 'Asha',
    createdBySub: 'admin',
    createdAt: NOW,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    ...overrides,
  }
}
const codeRow = { id: CODE_ID, batchId: BATCH_ID, seq: 0, variant: 0, codeHash: couponCodeHash(KEYS.lookupKey, CODE), suffix: CODE.slice(-4), scanCount: 0, firstScannedAt: null, lastScannedAt: null, redeemedAt: null, redeemedBy: null, voidedAt: null, voidedBy: null, voidReason: null }
const figures = { codes: 3, scannedCodes: 1, scans: 2, voidedCodes: 0, redeemed: 1, cancelled: 0, stampsGiven: 0, usedAtCheckout: 1, bookings: 1, revenue: '399.00', cost: '100.00', newCustomers: 1 }

let failures = { ipFailures: 0, userFailures: 0 as number | null }
const hashesLookedUp: string[] = []
const recorded: Array<{ userId: string | null; ipKey: string }> = []
const scans: string[] = []
const redeemCalls: Array<Record<string, unknown>> = []
const listedFor: string[] = []
const created: Array<Record<string, unknown>> = []
let coupon = { userId: PEOPLE.holder, cancelledAt: null as Date | null, newCustomersOnly: false }
let keptBooking = false

beforeAll(() => {
  envValues.couponSecret = SECRET
  envValues.rewardsEnabled = false

  patch(membersRepository, 'findActivePlatformRow', async (userId: string) =>
    userId === PEOPLE.superAdmin ? { role: 'super_admin' } : undefined
  )
  patch(couponsRepository, 'countRecentFailures', async () => failures)
  patch(couponsRepository, 'recordFailure', async (input: { userId: string | null; ipKey: string }) => {
    recorded.push(input)
  })
  patch(couponsRepository, 'findByHash', async (hash: string) => {
    hashesLookedUp.push(hash)
    return hash === codeRow.codeHash ? { code: codeRow, batch: batchRow(), vendorName: null } : undefined
  })
  patch(couponsRepository, 'recordScan', async (codeId: string) => {
    scans.push(codeId)
  })
  patch(couponsRepository, 'codeFacts', async () => ({ redemptions: 0, viewerAdded: false }))
  patch(couponsRepository, 'redeem', async (input: Record<string, unknown>) => {
    redeemCalls.push(input)
    if (redeemCalls.length > 1) return { kind: 'refused', refusal: 'already_redeemed' }
    return { kind: 'redeemed', redemptionId: 'r1', batch: batchRow(), voucher: { discountId: DISCOUNT_ID, code: 'CPABCDEFGH' }, stamps: null, issued: [], capAlert: null }
  })
  patch(couponsRepository, 'listForUser', async (userId: string) => {
    listedFor.push(userId)
    return [
      {
        id: 'r1',
        kind: 'voucher',
        stamps: null,
        createdAt: NOW,
        cancelledAt: null,
        batch: batchRow(),
        vendorName: null,
        voucherCode: 'CPABCDEFGH',
        voucherEndsAt: batchRow().validUntil,
        voucherActive: true,
        heldBookingId: null,
      },
    ]
  })
  patch(couponsRepository, 'findVendor', async () => undefined)
  patch(couponsRepository, 'createBatch', async (input: { batch: Record<string, unknown> }) => {
    created.push(input.batch)
    return input.batch
  })
  patch(couponsRepository, 'listBatches', async () => [{ batch: batchRow(), vendorName: null, figures }])
  patch(couponsRepository, 'findBatch', async (id: string) => (id === BATCH_ID || created.some((b) => b.id === id) ? { batch: batchRow({ id }), vendorName: null, figures } : undefined))
  patch(couponsRepository, 'channelCounts', async () => ({ link: 1 }))
  patch(couponsRepository, 'listCodes', async () => [codeRow])
  patch(couponsRepository, 'listRedemptions', async () => [])
  patch(couponsRepository, 'voidBatch', async () => ({ kind: 'voided', cancelled: 2 }))
  patch(couponsRepository, 'voidCode', async (input: { codeHash: string }) =>
    input.codeHash === codeRow.codeHash ? { kind: 'voided', suffix: codeRow.suffix, cancelled: 0 } : { kind: 'not_found' }
  )

  patch(discountsRepository, 'findByCode', async (code: string) =>
    code === 'CPABCDEFGH'
      ? {
          id: DISCOUNT_ID,
          code,
          discountType: 'fixed',
          percentOff: null,
          amountOff: '299.00',
          maxDiscountAmount: null,
          minOrderAmount: null,
          vendorId: null,
          fundedBy: 'platform',
          startsAt: null,
          endsAt: new Date(NOW.getTime() + 86_400_000),
          isActive: true,
          source: 'coupon',
          serviceCategory: 'car_wash',
          perUserLimit: 1,
          totalUsageLimit: 1,
        }
      : undefined
  )
  patch(discountsRepository, 'findCouponVoucher', async () => coupon)
  patch(discountsRepository, 'hasKeptBooking', async () => keptBooking)
  patch(discountsRepository, 'countHeld', async () => 0)
})

beforeEach(() => {
  failures = { ipFailures: 0, userFailures: 0 }
  hashesLookedUp.length = 0
  recorded.length = 0
  scans.length = 0
  redeemCalls.length = 0
  listedFor.length = 0
  created.length = 0
  coupon = { userId: PEOPLE.holder, cancelledAt: null, newCustomersOnly: false }
  keptBooking = false
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
users.route('/me/coupons', customerCouponRoutes)
app.route('/users', users)
app.route('/coupons', publicCouponRoutes)
app.route('/admin/coupons', adminCouponRoutes)

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
  return { status: response.status, body: json, headers: response.headers }
}

const NEW_BATCH = {
  name: 'Anna Nagar flyer',
  location: 'Anna Nagar 2nd Avenue',
  kind: 'unique',
  count: 3,
  reward: 'amount',
  amountOff: 100,
  minOrder: 499,
  validFrom: new Date(NOW.getTime() - 86_400_000).toISOString().slice(0, 10),
  validTo: new Date(NOW.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
  actorName: 'Asha',
}

describe('admin: batches, codes and redemptions', () => {
  test('super-admin only: signed out 401, a customer 403, for every route', async () => {
    const routes: Array<[string, string, unknown?]> = [
      ['GET', '/admin/coupons/config'],
      ['GET', '/admin/coupons/batches'],
      ['POST', '/admin/coupons/batches', NEW_BATCH],
      ['GET', `/admin/coupons/batches/${BATCH_ID}`],
      ['GET', `/admin/coupons/batches/${BATCH_ID}/codes`],
      ['GET', `/admin/coupons/batches/${BATCH_ID}/redemptions`],
      ['POST', `/admin/coupons/batches/${BATCH_ID}/void`, { actorName: 'Asha', reason: 'Leaked online' }],
      ['POST', `/admin/coupons/batches/${BATCH_ID}/codes/void`, { code: CODE, actorName: 'Asha', reason: 'Lost card' }],
    ]
    for (const [method, path, body] of routes) {
      expect({ path, status: (await call(method, path, null, body)).status }).toEqual({ path, status: 401 })
      expect({ path, status: (await call(method, path, 'holder', body)).status }).toEqual({ path, status: 403 })
    }
    expect(created).toEqual([])
  })

  test('a super-admin (or the break-glass login) creates a batch with the typed name; codes are hashed, never stored', async () => {
    const { status, body } = await call('POST', '/admin/coupons/batches', 'superAdmin', NEW_BATCH)
    expect(status).toBe(201)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ createdByName: 'Asha', codeCount: 3, keyId: KEYS.keyId, amountOff: '100.00', minOrderAmount: '499.00' })
    expect(JSON.stringify(created[0])).not.toContain(CODE)
    expect(body.data!.batch).toMatchObject({ title: '₹100 off', canReprint: true })
    expect((await call('GET', '/admin/coupons/batches', 'breakGlass')).status).toBe(200)
  })

  test('a batch that does not fit together is a 400 in plain words; extra fields are refused', async () => {
    const bad = await call('POST', '/admin/coupons/batches', 'superAdmin', { ...NEW_BATCH, reward: 'percent', amountOff: null, percentOff: 20 })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('COUPON_BATCH_INVALID')
    expect(bad.body.message).toContain('needs a cap')
    // Stamps need Rewards live (off here).
    const stamps = await call('POST', '/admin/coupons/batches', 'superAdmin', { ...NEW_BATCH, reward: 'stamps', amountOff: null, minOrder: null, stamps: 2 })
    expect(stamps.body.message).toContain('Detlio Rewards')
    expect((await call('POST', '/admin/coupons/batches', 'superAdmin', { ...NEW_BATCH, createdBySub: 'x' })).status).toBe(400)
    expect((await call('POST', '/admin/coupons/batches', 'superAdmin', { ...NEW_BATCH, actorName: '' })).status).toBe(400)
    expect((await call('POST', '/admin/coupons/batches', 'superAdmin', { ...NEW_BATCH, count: 5001 })).status).toBe(400)
    // A garage that does not exist.
    expect((await call('POST', '/admin/coupons/batches', 'superAdmin', { ...NEW_BATCH, vendorId: PEOPLE.other })).status).toBe(404)
    expect(created).toEqual([])
  })

  test('the print sheet re-derives each code, never cached; a changed secret refuses to print', async () => {
    const { status, body, headers } = await call('GET', `/admin/coupons/batches/${BATCH_ID}/codes`, 'superAdmin')
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    const codes = body.data!.codes as Array<{ code: string; link: string }>
    expect(codes).toEqual([expect.objectContaining({ seq: 1, code: formatCouponCode(CODE), link: `${env.couponSiteUrl}/c/${CODE}`, state: 'new' })])

    envValues.couponSecret = 'rotated'
    const rotated = await call('GET', `/admin/coupons/batches/${BATCH_ID}/codes`, 'superAdmin')
    envValues.couponSecret = SECRET
    expect(rotated.status).toBe(409)
    expect(rotated.body.code).toBe('COUPON_KEY_CHANGED')
  })

  test('void one code by typing it; a code from elsewhere is a 404', async () => {
    const ok = await call('POST', `/admin/coupons/batches/${BATCH_ID}/codes/void`, 'superAdmin', { code: formatCouponCode(CODE), actorName: 'Asha', reason: 'Lost card' })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ suffix: CODE.slice(-4) })
    const other = deriveCouponCode(KEYS.codeKey, BATCH_ID, 99)
    expect((await call('POST', `/admin/coupons/batches/${BATCH_ID}/codes/void`, 'superAdmin', { code: other, actorName: 'Asha', reason: 'Lost card' })).status).toBe(404)
  })
})

describe('the coupon page (signed out)', () => {
  test('shows the offer and counts a scan; only the keyed hash is looked up', async () => {
    const { status, body, headers } = await call('POST', '/coupons/lookup', null, { code: formatCouponCode(CODE) })
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(body.data!.coupon).toMatchObject({ title: '₹100 off', state: 'available' })
    // The team's own words never reach a customer.
    expect(JSON.stringify(body)).not.toContain('Anna Nagar')
    expect(scans).toEqual([CODE_ID])
    expect(hashesLookedUp).toEqual([couponCodeHash(KEYS.lookupKey, CODE)])
  })

  test('a wrong code is counted; a typo is neither looked up nor counted', async () => {
    const wrong = deriveCouponCode(KEYS.codeKey, BATCH_ID, 42)
    const missing = await call('POST', '/coupons/lookup', null, { code: wrong })
    expect(missing.status).toBe(404)
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.userId).toBeNull()

    const typo = `${CODE.slice(0, 9)}${CODE[9] === 'A' ? 'B' : 'A'}`
    const typoed = await call('POST', '/coupons/lookup', null, { code: typo })
    expect(typoed.status).toBe(400)
    expect(typoed.body.code).toBe('COUPON_CODE_TYPO')
    expect(recorded).toHaveLength(1)
    expect(hashesLookedUp).toHaveLength(1)
  })

  test('past the hourly limit nothing is looked up at all', async () => {
    failures = { ipFailures: 30, userFailures: null }
    const { status, body } = await call('POST', '/coupons/lookup', null, { code: CODE })
    expect(status).toBe(429)
    expect(body.code).toBe('COUPON_CODE_RATE_LIMIT')
    expect(hashesLookedUp).toEqual([])
  })
})

describe('customers: their own coupons only', () => {
  test('signed in to add or list; the session decides whose, never the body', async () => {
    expect((await call('GET', '/users/me/coupons', null)).status).toBe(401)
    expect((await call('POST', '/users/me/coupons/redeem', null, { code: CODE })).status).toBe(401)
    expect((await call('POST', '/users/me/coupons/redeem', 'holder', { code: CODE, userId: PEOPLE.other })).status).toBe(400)

    const added = await call('POST', '/users/me/coupons/redeem', 'holder', { code: CODE, channel: 'link' })
    expect(added.status).toBe(200)
    expect(redeemCalls[0]).toMatchObject({ userId: PEOPLE.holder, channel: 'link', codeId: CODE_ID })
    expect(added.body.data!.coupon).toMatchObject({ state: 'ready', code: 'CPABCDEFGH', title: '₹100 off' })

    const list = await call('GET', '/users/me/coupons', 'other')
    expect(list.status).toBe(200)
    expect(listedFor.at(-1)).toBe(PEOPLE.other)
  })

  test('the second customer to add a unique code hears it was used', async () => {
    await call('POST', '/users/me/coupons/redeem', 'holder', { code: CODE })
    const second = await call('POST', '/users/me/coupons/redeem', 'other', { code: CODE })
    expect(second.status).toBe(409)
    expect(second.body.code).toBe('COUPON_ALREADY_REDEEMED')
  })

  test("a signed-in customer's wrong codes count against them", async () => {
    failures = { ipFailures: 0, userFailures: 10 }
    const { status } = await call('POST', '/users/me/coupons/redeem', 'holder', { code: CODE })
    expect(status).toBe(429)
    expect(redeemCalls).toEqual([])
  })
})

describe('checkout: a coupon voucher is its owner\'s alone', () => {
  const wash = [{ category: 'car_wash', amount: '299.00' }, { category: 'detailing', amount: '900.00' }]

  test('the owner, on a booking with a car wash, gets the wash off (₹1 floor kept on the whole)', async () => {
    const resolved = await resolveDiscount({ code: 'CPABCDEFGH', userId: PEOPLE.holder, vendorId: PEOPLE.other, subtotal: '1199.00', lines: wash })
    expect(resolved).toMatchObject({ discountAmount: '299.00', finalAmount: '900.00', fundedBy: 'platform' })
  })

  test('anyone else, a voided coupon, a returning customer, or no car wash: refused', async () => {
    const attempt = (userId: string, lines = wash) =>
      resolveDiscount({ code: 'CPABCDEFGH', userId, vendorId: PEOPLE.other, subtotal: '1199.00', lines }).catch((err: InstanceType<typeof AppError>) => err.code)
    expect(await attempt(PEOPLE.other)).toBe('DISCOUNT_NOT_FOUND')
    coupon = { ...coupon, cancelledAt: NOW }
    expect(await attempt(PEOPLE.holder)).toBe('DISCOUNT_NOT_FOUND')
    coupon = { ...coupon, cancelledAt: null, newCustomersOnly: true }
    keptBooking = true
    expect(await attempt(PEOPLE.holder)).toBe('COUPON_NOT_NEW')
    keptBooking = false
    coupon = { ...coupon, newCustomersOnly: false }
    expect(await attempt(PEOPLE.holder, [{ category: 'detailing', amount: '1199.00' }])).toBe('DISCOUNT_NOT_FOR_SERVICE')
  })
})
