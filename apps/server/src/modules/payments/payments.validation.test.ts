import { describe, expect, test } from 'bun:test'

// The schema imports lib/meta-capi.ts, which reads the app's env.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const { verifyPaymentSchema } = await import('./payments.validation.js')

const INTENT = 'e2e00000-0000-4000-8000-000000009101'
const base = {
  razorpayOrderId: 'order_ABC',
  razorpayPaymentId: 'pay_ABC',
  razorpaySignature: 'sig',
  intentId: INTENT,
}
const marketing = {
  consent: true,
  fbp: 'fb.1.1761543000000.1234567890',
  fbc: 'fb.1.1761543000000.IwAR2abc',
  eventSourceUrl: 'https://detlio.com/checkout',
}

function parse(body: unknown) {
  return verifyPaymentSchema.safeParse(body)
}

describe('verifyPaymentSchema: marketing consent', () => {
  test('without it, as before', () => {
    const result = parse(base)
    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('marketing.consent')
  })

  test('accepts consent with the cookies and the page', () => {
    const result = parse({ ...base, marketing })
    expect(result.success).toBe(true)
    expect(result.data?.marketing).toEqual(
      marketing as typeof marketing & { consent: true }
    )
  })

  test('accepts consent alone', () => {
    const result = parse({ ...base, marketing: { consent: true } })
    expect(result.success).toBe(true)
    expect(result.data?.marketing?.consent).toBe(true)
  })

  test('on the legacy booking flow too', () => {
    const { intentId: _intent, ...rest } = base
    const result = parse({ ...rest, bookingId: INTENT, marketing })
    expect(result.success).toBe(true)
    expect(result.data?.marketing?.consent).toBe(true)
  })

  test('refuses consent that is not true', () => {
    for (const consent of [false, 'true', 1, null, undefined]) {
      expect(
        parse({ ...base, marketing: { ...marketing, consent } }).success
      ).toBe(false)
    }
  })

  test('refuses unknown keys: no name, phone or email can ride along', () => {
    for (const extra of [
      { phone: '9876543210' },
      { email: 'a@b.c' },
      { name: 'A' },
      { em: 'hash' },
    ]) {
      expect(
        parse({ ...base, marketing: { ...marketing, ...extra } }).success
      ).toBe(false)
    }
  })

  test('refuses a marketing value that is not an object', () => {
    for (const value of [true, 'yes', [], null]) {
      expect(parse({ ...base, marketing: value }).success).toBe(false)
    }
  })

  test('drops a bad event source URL, keeping the payment confirmation', () => {
    for (const eventSourceUrl of [
      'https://detlio.com/checkout?utm_source=ig',
      'http://detlio.com/checkout',
      'https://evil.example/checkout',
      'https://vendor.detlio.com/x',
      `https://detlio.com/${'a'.repeat(300)}`,
      42,
    ]) {
      const result = parse({
        ...base,
        marketing: { ...marketing, eventSourceUrl },
      })
      expect(result.success).toBe(true)
      expect(result.data?.marketing?.eventSourceUrl).toBeUndefined()
      expect(result.data?.marketing?.fbp).toBe(marketing.fbp)
    }
  })

  test('drops a cookie that is not Meta’s, or over 200 characters', () => {
    for (const fbp of [
      'fb.2.1.2',
      'abc',
      `fb.1.${'1'.repeat(200)}`,
      'fb.1.has space',
      7,
    ]) {
      const result = parse({
        ...base,
        marketing: { ...marketing, fbp, fbc: fbp },
      })
      expect(result.success).toBe(true)
      expect(result.data?.marketing?.fbp).toBeUndefined()
      expect(result.data?.marketing?.fbc).toBeUndefined()
    }
  })
})
