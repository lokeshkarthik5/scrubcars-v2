/**
 * The API's own health, and the per-phone limit on login codes.
 *
 * Both are API-level on purpose. The health check is what the uptime monitor
 * calls, so its exact shape is the contract; the send limit is a server rule
 * the E2E stack does not relax (only the per-IP limits are raised in
 * .env.e2e), so it is asserted here as production applies it.
 */
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { forgetOtps, sql } from '../../support/db'
import { OTP_LIMITED_CUSTOMER } from '../../support/seed-ids'

const SEND = `${API}/api/v1/auth/otp/send`
const phone = OTP_LIMITED_CUSTOMER.phone
const body = { phone, purpose: 'login', audience: 'customer' }

test.describe('health @p0', () => {
  test('reports the API and its database up, uncached and unauthenticated', async ({ request }) => {
    const response = await request.get(`${API}/api/v1/health`)

    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('no-store')
    const json = await response.json()
    expect(json).toEqual({
      success: true,
      data: { status: 'ok', db: 'ok', version: expect.any(String) },
    })
  })
})

test.describe('login code limits @p0', () => {
  // Serial: both tests count this one number's sends.
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async () => {
    await forgetOtps(phone)
  })

  test('a second code inside 30 seconds is refused with when to try again', async ({ request }) => {
    const first = await request.post(SEND, { data: body })
    expect(first.status()).toBe(200)
    // What the verify screen counts down from: the code's real life.
    expect((await first.json()).data.expiresInSeconds).toBe(180)

    const second = await request.post(SEND, { data: body })
    expect(second.status()).toBe(429)
    const refusal = await second.json()
    expect(refusal).toMatchObject({ success: false, code: 'OTP_RATE_LIMITED' })
    expect(refusal.message).toMatch(
      /^Too many codes requested for this number\. Try again in \d+ seconds?\.$/
    )
    expect(refusal.retryAfterSeconds).toBeGreaterThan(0)
    expect(refusal.retryAfterSeconds).toBeLessThanOrEqual(30)
    expect(second.headers()['retry-after']).toBe(String(refusal.retryAfterSeconds))

    // Refused before anything was sent: still the one code.
    const [{ n }] = await sql<{ n: string }[]>`
      select count(*)::text as n from otp_verifications where phone = ${phone}
    `
    expect(Number(n)).toBe(1)
  })

  test('a sixth code in an hour waits for the oldest to age out', async ({ request }) => {
    // Five earlier codes, each well clear of the 30-second gap, the oldest
    // fifty minutes ago: it leaves the hour in ten.
    await sql`
      insert into otp_verifications (phone, otp_code, purpose, expires_at, created_at)
      select ${phone}, '000000', 'login', now() - interval '1 minute' * m + interval '3 minutes',
             now() - interval '1 minute' * m
        from unnest(array[50, 40, 30, 20, 10]) as m
    `

    const response = await request.post(SEND, { data: body })
    expect(response.status()).toBe(429)
    const refusal = await response.json()
    expect(refusal.code).toBe('OTP_RATE_LIMITED')
    expect(refusal.message).toBe(
      'Too many codes requested for this number. Try again in 10 minutes.'
    )
  })
})
