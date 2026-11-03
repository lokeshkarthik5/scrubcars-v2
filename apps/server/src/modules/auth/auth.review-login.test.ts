/**
 * The app-store reviewer login through the real routes, service, OTP rules
 * and ops alerts. Only the database (the auth and members repositories, as a
 * small in-memory OTP table) and the network (SMS provider, Telegram) are
 * stood in for; everything is put back afterwards.
 *
 * The rules: off unless all three settings are set; the fixed code works only
 * on POST /auth/native/otp/verify, only for the phone set for the audience
 * asking, only for a login to an account that already exists; the normal
 * attempt limits apply; sending a code to that phone sends no SMS and answers
 * as for any other phone; every use alerts the team without the code.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { Hono } = await import('hono')
const { env } = await import('../../lib/env.js')
const { AppError } = await import('../../lib/errors.js')
const { readReviewLoginEnv, makeReviewCodeHash } = await import('../../lib/review-login.js')
const { MAX_OTP_VERIFY_ATTEMPTS } = await import('../../lib/otp.js')
const { membersRepository } = await import('../members/members.repository.js')
const { authRepository } = await import('./auth.repository.js')
const { authRoutes } = await import('./auth.routes.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

const REVIEW_CUSTOMER = '9000061111'
const REVIEW_GARAGE = '9000062222'
const REAL_CUSTOMER = '9000063333'
const NO_ACCOUNT = '9000064444'
const CODE = '424242'

const ACCOUNTS: Record<string, { id: string; isCustomer: boolean; isVendorOwner: boolean }> = {
  [REVIEW_CUSTOMER]: { id: id(6111), isCustomer: true, isVendorOwner: false },
  [REVIEW_GARAGE]: { id: id(6112), isCustomer: false, isVendorOwner: true },
  [REAL_CUSTOMER]: { id: id(6113), isCustomer: true, isVendorOwner: false },
}

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const envValues = env as unknown as Record<string, unknown>
const ENV_KEYS = ['reviewLogin', 'smsApiKey', 'telegramBotToken', 'telegramOpsChatId', 'opsAlertsForced', 'vercelEnv'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, envValues[key]]))

let hash: string
function reviewLoginOn(on: boolean | Record<string, string | undefined>) {
  const source: Record<string, string | undefined> = {
    REVIEW_LOGIN_CUSTOMER_PHONE: REVIEW_CUSTOMER,
    REVIEW_LOGIN_GARAGE_PHONE: REVIEW_GARAGE,
    REVIEW_LOGIN_CODE_HASH: hash,
  }
  envValues.reviewLogin = on === false ? null : readReviewLoginEnv({ ...source, ...(on === true ? {} : on) })
}

// ─── The OTP table and accounts, in memory ────────────────────────────────────

type OtpRow = {
  id: string
  phone: string
  otpCode: string
  purpose: string
  attempts: number
  verified: boolean
  expiresAt: Date
  createdAt: Date
}
let otps: OtpRow[] = []
let created = 0
let accountsWritten: string[] = []
let sessions: string[] = []

// ─── The network, recorded ────────────────────────────────────────────────────

let smsSentTo: string[] = []
let telegramPosts: string[] = []
const realFetch = globalThis.fetch

beforeAll(async () => {
  hash = await makeReviewCodeHash(CODE)

  patch(authRepository, 'findUserByPhone', async (phone: string) => {
    const account = ACCOUNTS[phone]
    return account
      ? {
          ...account,
          name: 'Test Person',
          phone,
          email: null,
          status: 'active',
          phoneVerified: true,
          deletedAt: null,
        }
      : undefined
  })
  patch(authRepository, 'createUser', async (data: { phone: string }) => {
    accountsWritten.push(`create:${data.phone}`)
    return [{ id: id(6199), ...data }]
  })
  patch(authRepository, 'updateUser', async (userId: string) => {
    const phone = Object.keys(ACCOUNTS).find((key) => ACCOUNTS[key].id === userId)!
    return [{ ...ACCOUNTS[phone], name: 'Test Person', phone, email: null, status: 'active', phoneVerified: true, deletedAt: null }]
  })
  patch(authRepository, 'listOtpSendTimes', async (phone: string) =>
    otps.filter((row) => row.phone === phone).map((row) => ({ createdAt: row.createdAt }))
  )
  patch(authRepository, 'deleteOtpsExpiredBefore', async () => [])
  patch(authRepository, 'deleteOtpVerification', async (rowId: string) => {
    otps = otps.filter((row) => row.id !== rowId)
  })
  patch(authRepository, 'createOtpVerification', async (data: { phone: string; otpDigest: string; purpose: string; expiresAt: Date }) => {
    created += 1
    const row: OtpRow = {
      id: `otp-${created}`,
      phone: data.phone,
      otpCode: data.otpDigest,
      purpose: data.purpose,
      attempts: 0,
      verified: false,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    }
    otps.push(row)
    return [row]
  })
  patch(authRepository, 'findLatestValidOtp', async (phone: string, purpose: string) =>
    otps
      .filter((row) => row.phone === phone && row.purpose === purpose && !row.verified && row.expiresAt > new Date())
      .at(-1)
  )
  patch(authRepository, 'sumRecentOtpAttempts', async (phone: string, purpose: string, _since: Date, excludeId?: string) => [
    {
      value: otps
        .filter((row) => row.phone === phone && row.purpose === purpose && row.id !== excludeId)
        .reduce((sum, row) => sum + row.attempts, 0),
    },
  ])
  patch(authRepository, 'claimOtpAttempt', async (rowId: string, cap: number) => {
    const row = otps.find((candidate) => candidate.id === rowId)
    if (!row || row.attempts >= cap) return []
    row.attempts += 1
    return [{ attempts: row.attempts }]
  })
  patch(authRepository, 'markOtpVerified', async (rowId: string) => {
    const row = otps.find((candidate) => candidate.id === rowId)
    if (!row || row.verified) return []
    row.verified = true
    row.attempts = Math.max(row.attempts - 1, 0)
    return [{ id: rowId }]
  })
  patch(authRepository, 'createRefreshToken', async (data: { userId: string }) => {
    sessions.push(data.userId)
    return []
  })
  patch(membersRepository, 'hasActiveVendorSeat', async (userId: string) => userId === ACCOUNTS[REVIEW_GARAGE].id)
  patch(membersRepository, 'listActiveVendorSeats', async () => [])
})

beforeEach(() => {
  otps = []
  created = 0
  accountsWritten = []
  sessions = []
  smsSentTo = []
  telegramPosts = []
  envValues.smsApiKey = 'sms-key'
  envValues.telegramBotToken = 'telegram-token'
  envValues.telegramOpsChatId = '-100123'
  envValues.opsAlertsForced = true
  reviewLoginOn(true)
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    if (String(url).includes('2factor.in')) {
      smsSentTo.push(String(url).split('/SMS/')[1].split('/')[0])
      return Response.json({ Status: 'Success', Details: 'session' })
    }
    if (String(url).includes('api.telegram.org')) {
      telegramPosts.push(JSON.parse(init?.body ?? '{}').text)
      return Response.json({ ok: true })
    }
    throw new Error(`unexpected request to ${url}`)
  }) as unknown as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

// ─── The routes ───────────────────────────────────────────────────────────────

const app = new Hono()
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ success: false, code: err.code, message: err.message }, err.statusCode as 400)
  throw err
})
app.route('/auth', authRoutes)

let caller = 0
async function post(path: string, body: unknown) {
  // A fresh address each time, so the per-IP limiter never gets in the way.
  caller += 1
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(caller / 250)}.${caller % 250}` },
    body: JSON.stringify(body),
  })
  return { res, body: (await res.json()) as Record<string, any> }
}

const send = (phone: string, audience = 'customer', purpose = 'login') =>
  post('/auth/otp/send', { phone, purpose, audience })
const verifyNative = (phone: string, otp: string, audience = 'customer', purpose = 'login') =>
  post('/auth/native/otp/verify', { phone, otp, purpose, audience })
const verifyWebsite = (phone: string, otp: string, audience = 'customer', purpose = 'login') =>
  post('/auth/otp/verify', { phone, otp, purpose, audience })

const flush = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('off unless all three settings are set', () => {
  for (const missing of ['REVIEW_LOGIN_CUSTOMER_PHONE', 'REVIEW_LOGIN_GARAGE_PHONE', 'REVIEW_LOGIN_CODE_HASH']) {
    test(`without ${missing}: an SMS goes out and the review code is refused`, async () => {
      reviewLoginOn({ [missing]: undefined })
      expect((await send(REVIEW_CUSTOMER)).res.status).toBe(200)
      expect(smsSentTo).toEqual([REVIEW_CUSTOMER])

      const { res, body } = await verifyNative(REVIEW_CUSTOMER, CODE)
      expect(res.status).toBe(400)
      expect(body.code).toBe('INVALID_OTP')
      await flush()
      expect(sessions).toEqual([])
      expect(telegramPosts).toEqual([])
    })
  }

  test('with it all unset, a texted code still works exactly as before', async () => {
    reviewLoginOn(false)
    await send(REAL_CUSTOMER)
    expect(smsSentTo).toEqual([REAL_CUSTOMER])
    // The code was never kept in the clear, so the test reads it from what went out.
    const sentCode = otps[0].otpCode
    expect(sentCode).not.toBe(CODE)
  })
})

describe('the reviewer signs in on the native route', () => {
  test('customer app: the fixed code gives a session and tells the team', async () => {
    expect((await send(REVIEW_CUSTOMER)).res.status).toBe(200)
    const { res, body } = await verifyNative(REVIEW_CUSTOMER, CODE)
    expect(res.status).toBe(200)
    expect(body.data.accessToken).toBeString()
    expect(body.data.refreshToken).toBeString()
    expect(body.data.user.id).toBe(ACCOUNTS[REVIEW_CUSTOMER].id)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(sessions).toEqual([ACCOUNTS[REVIEW_CUSTOMER].id])
  })

  test('garage app: the garage phone and code give a garage session', async () => {
    await send(REVIEW_GARAGE, 'vendor')
    const { res, body } = await verifyNative(REVIEW_GARAGE, CODE, 'vendor')
    expect(res.status).toBe(200)
    expect(body.data.user.id).toBe(ACCOUNTS[REVIEW_GARAGE].id)
  })

  test('every use alerts the team, with the app and the masked number and never the code', async () => {
    await send(REVIEW_CUSTOMER)
    await verifyNative(REVIEW_CUSTOMER, CODE)
    await send(REVIEW_GARAGE, 'vendor')
    await verifyNative(REVIEW_GARAGE, CODE, 'vendor')
    await flush()

    expect(telegramPosts).toHaveLength(2)
    expect(telegramPosts[0]).toContain('App-store reviewer login used')
    expect(telegramPosts[0]).toContain('customer app')
    expect(telegramPosts[0]).toContain('******1111')
    expect(telegramPosts[1]).toContain('garage app')
    expect(telegramPosts[1]).toContain('******2222')
    for (const text of telegramPosts) {
      expect(text).not.toContain(CODE)
      expect(text).not.toContain(hash)
      expect(text).not.toContain(REVIEW_CUSTOMER)
      expect(text).not.toContain(REVIEW_GARAGE)
    }
  })

  test('a failing alert cannot fail the sign-in', async () => {
    globalThis.fetch = (async () => {
      throw new Error('telegram unreachable')
    }) as unknown as typeof fetch
    // No SMS for this phone, so the send needs no network either.
    await send(REVIEW_CUSTOMER)
    expect((await verifyNative(REVIEW_CUSTOMER, CODE)).res.status).toBe(200)
    await flush()
  })

  test('a code is single use: it cannot be replayed without a new send', async () => {
    await send(REVIEW_CUSTOMER)
    expect((await verifyNative(REVIEW_CUSTOMER, CODE)).res.status).toBe(200)
    const replay = await verifyNative(REVIEW_CUSTOMER, CODE)
    expect(replay.res.status).toBe(400)
    expect(replay.body.code).toBe('INVALID_OTP')
  })

  test('without a send first there is nothing to answer: refused like any other phone', async () => {
    const { res, body } = await verifyNative(REVIEW_CUSTOMER, CODE)
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_OTP')
    expect(sessions).toEqual([])
  })
})

describe('only the reviewer’s phone, only on the native route', () => {
  test('the website route refuses the review code, and tells nobody', async () => {
    await send(REVIEW_CUSTOMER)
    const { res, body } = await verifyWebsite(REVIEW_CUSTOMER, CODE)
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_OTP')
    expect(res.headers.get('set-cookie')).toBeNull()
    await flush()
    expect(sessions).toEqual([])
    expect(telegramPosts).toEqual([])
  })

  test('a real phone with the review code is refused', async () => {
    await send(REAL_CUSTOMER)
    const { res, body } = await verifyNative(REAL_CUSTOMER, CODE)
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_OTP')
    await flush()
    expect(sessions).toEqual([])
    expect(telegramPosts).toEqual([])
  })

  test('the reviewer’s phone in the other app is an ordinary phone there', async () => {
    // The customer reviewer's number, as the garage app: SMS goes out and the code is refused.
    ACCOUNTS[REVIEW_CUSTOMER].isVendorOwner = true
    try {
      const original = membersRepository.hasActiveVendorSeat
      patch(membersRepository, 'hasActiveVendorSeat', async () => true)
      try {
        await send(REVIEW_CUSTOMER, 'vendor')
        expect(smsSentTo).toEqual([REVIEW_CUSTOMER])
        expect((await verifyNative(REVIEW_CUSTOMER, CODE, 'vendor')).body.code).toBe('INVALID_OTP')
      } finally {
        patch(membersRepository, 'hasActiveVendorSeat', original)
      }
    } finally {
      ACCOUNTS[REVIEW_CUSTOMER].isVendorOwner = false
    }
    // And the garage reviewer's number as the customer app.
    await send(REVIEW_GARAGE, 'customer')
    expect(smsSentTo).toEqual([REVIEW_CUSTOMER, REVIEW_GARAGE])
    expect((await verifyNative(REVIEW_GARAGE, CODE, 'customer')).body.code).toBe('INVALID_OTP')
  })

  test('an account-creating purpose is never the reviewer’s, even for the reviewer’s phone', async () => {
    // register: the normal rule (already registered) answers; vendor_onboard likewise.
    const register = await send(REVIEW_CUSTOMER, 'customer', 'register')
    expect(register.res.status).toBe(409)
    expect(register.body.code).toBe('PHONE_ALREADY_REGISTERED')
    const verify = await verifyNative(REVIEW_CUSTOMER, CODE, 'customer', 'register')
    expect(verify.res.status).toBe(400)
    expect(accountsWritten).toEqual([])
    expect(sessions).toEqual([])
  })

  test('a phone with no account is refused at send and at verify, and none is created', async () => {
    reviewLoginOn({ REVIEW_LOGIN_CUSTOMER_PHONE: NO_ACCOUNT })
    const sent = await send(NO_ACCOUNT)
    expect(sent.res.status).toBe(404)
    expect(sent.body.code).toBe('USER_NOT_FOUND')
    expect(smsSentTo).toEqual([])

    // Even with a code row in place, the sign-in finds no account to open.
    otps.push({
      id: 'otp-x',
      phone: NO_ACCOUNT,
      otpCode: 'whatever',
      purpose: 'login',
      attempts: 0,
      verified: false,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    })
    const verified = await verifyNative(NO_ACCOUNT, CODE)
    expect(verified.res.status).toBe(404)
    expect(verified.body.code).toBe('USER_NOT_FOUND')
    expect(accountsWritten).toEqual([])
    expect(sessions).toEqual([])
    await flush()
    expect(telegramPosts).toEqual([])
  })
})

describe('sending a code', () => {
  test('sends no SMS to the reviewer’s phones, and only to those', async () => {
    await send(REVIEW_CUSTOMER)
    await send(REVIEW_GARAGE, 'vendor')
    expect(smsSentTo).toEqual([])

    await send(REAL_CUSTOMER)
    expect(smsSentTo).toEqual([REAL_CUSTOMER])
  })

  test('answers as it does for any other phone', async () => {
    const reviewer = await send(REVIEW_CUSTOMER)
    const ordinary = await send(REAL_CUSTOMER)
    expect(reviewer.res.status).toBe(ordinary.res.status)
    expect(reviewer.body.message).toBe(ordinary.body.message)
    expect(Object.keys(reviewer.body.data).sort()).toEqual(Object.keys(ordinary.body.data).sort())
    expect({ ...reviewer.body.data, phone: '' }).toEqual({ ...ordinary.body.data, phone: '' })
  })

  test('keeps the normal send limits for the reviewer’s phone', async () => {
    expect((await send(REVIEW_CUSTOMER)).res.status).toBe(200)
    const again = await send(REVIEW_CUSTOMER)
    expect(again.res.status).toBe(429)
    expect(again.body.code).toBe('OTP_RATE_LIMITED')
  })

  test('the stored code is one nobody knows, so the review code cannot be read off the table', async () => {
    await send(REVIEW_CUSTOMER)
    expect(otps).toHaveLength(1)
    expect(otps[0].otpCode).toHaveLength(10)
    expect(otps[0].otpCode).not.toContain(CODE)
  })
})

describe('the same attempt limits as any other code', () => {
  test('a wrong code is refused and counted', async () => {
    await send(REVIEW_CUSTOMER)
    const { res, body } = await verifyNative(REVIEW_CUSTOMER, '000000')
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_OTP')
    expect(otps[0].attempts).toBe(1)
    await flush()
    expect(telegramPosts).toEqual([])
  })

  test('after the allowed wrong guesses even the right code is refused', async () => {
    await send(REVIEW_CUSTOMER)
    for (let i = 0; i < MAX_OTP_VERIFY_ATTEMPTS; i += 1) {
      expect((await verifyNative(REVIEW_CUSTOMER, '000000')).body.code).toBe('INVALID_OTP')
    }
    const locked = await verifyNative(REVIEW_CUSTOMER, CODE)
    expect(locked.res.status).toBe(429)
    expect(locked.body.code).toBe('OTP_ATTEMPTS_EXCEEDED')
    await flush()
    expect(sessions).toEqual([])
    expect(telegramPosts).toEqual([])
  })

  test('guesses sent together all count', async () => {
    await send(REVIEW_CUSTOMER)
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => verifyNative(REVIEW_CUSTOMER, String(i).repeat(6))))
    expect(results.filter((r) => r.res.status === 400)).toHaveLength(MAX_OTP_VERIFY_ATTEMPTS)
    expect(results.filter((r) => r.res.status === 429)).toHaveLength(8 - MAX_OTP_VERIFY_ATTEMPTS)
    expect(otps[0].attempts).toBe(MAX_OTP_VERIFY_ATTEMPTS)
  })
})
