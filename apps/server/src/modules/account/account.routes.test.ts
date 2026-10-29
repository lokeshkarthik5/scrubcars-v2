/**
 * Deleting an account (0066) through the real routes and auth middleware.
 * Only the database is stood in for (the account repository and the money
 * reads it asks; put back afterwards).
 *
 * The rules: the account is always the session's own, from either app (a
 * staff login with no customer flag too); an admin login has no account
 * here. Anything open refuses it with the first blocker's code and words,
 * and nothing is written. Otherwise it is anonymised once, both session
 * cookies are cleared in the answer, and a second try is a 404.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { AppError } = await import('../../lib/errors.js')
const { signAccessToken, signAdminToken } = await import('../../lib/jwt.js')
const { refundsService } = await import('../refunds/refunds.service.js')
const { giftCreditService } = await import('../gift-credit/gift-credit.service.js')
const { giftsService } = await import('../gifts/gifts.service.js')
const { accountRepository, DeletionRaced } = await import('./account.repository.js')
const { accountRoutes } = await import('./account.routes.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CUSTOMER = id(5101)
const STAFF = id(5102)
const OWNER = id(5103)

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

let deleted: Set<string>
let openBookings: Array<{ id: string; status: string }>
let openCheckout: boolean
let owed: Array<{ reference: string; amountOwed: string }>
let credit: number
let gifts: Array<{ number: string; expiresAt: Date | null }>
let anonymised: Array<{ userId: string; phone: string }>
let race: boolean

beforeAll(() => {
  patch(accountRepository, 'findUser', async (userId: string) =>
    [CUSTOMER, STAFF, OWNER].includes(userId) ? { id: userId, deletedAt: deleted.has(userId) ? new Date() : null } : undefined
  )
  patch(accountRepository, 'ownsGarage', async (userId: string) => userId === OWNER)
  patch(accountRepository, 'listOpenBookings', async () => openBookings)
  patch(accountRepository, 'hasOpenCheckout', async () => openCheckout)
  patch(accountRepository, 'anonymise', async (input: { userId: string; phone: string }) => {
    if (race) throw new DeletionRaced()
    anonymised.push({ userId: input.userId, phone: input.phone })
    deleted.add(input.userId)
    return { avatarKey: null, avatarUrl: null }
  })
  patch(refundsService, 'listOwedForUser', async () => owed)
  patch(giftCreditService, 'availablePaise', async () => credit)
  patch(giftsService, 'unredeemedBought', async () => gifts)
})

beforeEach(() => {
  deleted = new Set()
  openBookings = []
  openCheckout = false
  owed = []
  credit = 0
  gifts = []
  anonymised = []
  race = false
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

const app = new Hono()
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ success: false, message: err.message, code: err.code }, err.statusCode as 400)
    : c.json({ success: false, message: String(err) }, 500)
)
app.route('/account', accountRoutes)

async function cookieFor(who: 'customer' | 'staff' | 'owner' | 'admin' | null): Promise<Record<string, string>> {
  if (who === null) return {}
  if (who === 'admin') return { Cookie: `access_token=${await signAdminToken()}` }
  const sub = who === 'customer' ? CUSTOMER : who === 'staff' ? STAFF : OWNER
  const token = await signAccessToken({
    sub,
    aud: who === 'customer' ? 'customer' : 'vendor',
    isCustomer: who === 'customer',
    isVendorOwner: who !== 'customer',
  })
  return { Cookie: `access_token=${token}` }
}

async function call(method: string, path: string, who: Parameters<typeof cookieFor>[0]) {
  const response = await app.request(path, { method, headers: await cookieFor(who) })
  const body = (await response.json()) as { code?: string; message?: string; data?: { canDelete: boolean; blockers: Array<{ code: string }> } }
  return { status: response.status, body, cookies: response.headers.getSetCookie() }
}

describe('who', () => {
  test('signed out is a 401; an admin login has no account here (404)', async () => {
    expect((await call('GET', '/account/deletion', null)).status).toBe(401)
    expect((await call('DELETE', '/account', 'admin')).status).toBe(404)
    expect(anonymised).toEqual([])
  })

  test('a garage staff login (no customer flag) can delete its own account', async () => {
    const preview = await call('GET', '/account/deletion', 'staff')
    expect(preview.status).toBe(200)
    expect(preview.body.data).toEqual({ canDelete: true, blockers: [] })
    const done = await call('DELETE', '/account', 'staff')
    expect(done.status).toBe(200)
    expect(anonymised.map((row) => row.userId)).toEqual([STAFF])
  })
})

describe('refusals', () => {
  test('a garage owner is refused, and nothing is written', async () => {
    const preview = await call('GET', '/account/deletion', 'owner')
    expect(preview.body.data?.canDelete).toBe(false)
    expect(preview.body.data?.blockers.map((b) => b.code)).toEqual(['VENDOR_OWNER_ACCOUNT'])
    const refused = await call('DELETE', '/account', 'owner')
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('VENDOR_OWNER_ACCOUNT')
    expect(anonymised).toEqual([])
  })

  test('an open booking, a refund owed, credit and an unredeemed gift each refuse; the first is the answer', async () => {
    openBookings = [{ id: id(5110), status: 'confirmed' }]
    owed = [{ reference: 'AB12CD34', amountOwed: '299.00' }]
    credit = 10_000
    gifts = [{ number: 'G-000001', expiresAt: null }]
    const preview = await call('GET', '/account/deletion', 'customer')
    expect(preview.body.data?.blockers.map((b) => b.code)).toEqual([
      'ACCOUNT_HAS_OPEN_BOOKING',
      'ACCOUNT_REFUND_OWED',
      'ACCOUNT_HAS_CREDIT',
      'ACCOUNT_HAS_UNREDEEMED_GIFT',
    ])
    const refused = await call('DELETE', '/account', 'customer')
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('ACCOUNT_HAS_OPEN_BOOKING')
    expect(refused.body.message).toContain(`#${id(5110).slice(0, 8).toUpperCase()}`)
    expect(anonymised).toEqual([])
  })

  test('a payment in progress refuses', async () => {
    openCheckout = true
    expect((await call('DELETE', '/account', 'customer')).body.code).toBe('ACCOUNT_HAS_OPEN_CHECKOUT')
  })

  test('a booking made between the checks and the write rolls it back with a 409', async () => {
    race = true
    const raced = await call('DELETE', '/account', 'customer')
    expect(raced.status).toBe(409)
    expect(raced.body.code).toBe('ACCOUNT_CHANGED')
  })
})

describe('deleting', () => {
  test('anonymises once with a freed phone, clears both cookies, and a second try is a 404', async () => {
    const done = await call('DELETE', '/account', 'customer')
    expect(done.status).toBe(200)
    expect(anonymised).toHaveLength(1)
    expect(anonymised[0]!.phone).toMatch(/^deleted-[a-z]{12}$/)
    const cleared = done.cookies.join('\n')
    expect(cleared).toMatch(/access_token=;.*Max-Age=0/)
    expect(cleared).toMatch(/refresh_token=;.*Max-Age=0/)

    const again = await call('DELETE', '/account', 'customer')
    expect(again.status).toBe(404)
    expect((await call('GET', '/account/deletion', 'customer')).status).toBe(404)
    expect(anonymised).toHaveLength(1)
  })
})
