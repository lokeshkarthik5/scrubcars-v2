import { describe, expect, test } from 'bun:test'
import { listRefundsQuerySchema, recordRefundSchema, refundNowSchema } from './refunds.validation.js'

const ID = 'e2e00000-0000-4000-8000-000000000601'

describe('listRefundsQuerySchema', () => {
  test('owed by default, done on request, nothing else', () => {
    expect(listRefundsQuerySchema.parse({})).toEqual({ status: 'owed' })
    expect(listRefundsQuerySchema.parse({ status: 'done' })).toEqual({ status: 'done' })
    expect(listRefundsQuerySchema.safeParse({ status: 'all' }).success).toBe(false)
  })
})

describe('recordRefundSchema', () => {
  const base = { kind: 'booking', id: ID, amount: 499 }

  test('a Razorpay refund with its id', () => {
    expect(recordRefundSchema.parse({ ...base, refundRef: ' rfnd_FP8QHiV938haTz ', note: '' })).toEqual({
      kind: 'booking',
      id: ID,
      amount: 499,
      refundRef: 'rfnd_FP8QHiV938haTz',
      outsideRazorpayNote: undefined,
      note: undefined,
    })
  })

  test('a refund outside Razorpay, with how it went back', () => {
    expect(
      recordRefundSchema.safeParse({ ...base, outsideRazorpayNote: 'UPI, customer asked' }).success
    ).toBe(true)
  })

  test('needs one or the other, not both and not neither', () => {
    expect(recordRefundSchema.safeParse(base).success).toBe(false)
    expect(recordRefundSchema.safeParse({ ...base, refundRef: '', outsideRazorpayNote: '  ' }).success).toBe(false)
    expect(
      recordRefundSchema.safeParse({ ...base, refundRef: 'rfnd_ABC', outsideRazorpayNote: 'UPI' }).success
    ).toBe(false)
  })

  test('a payment id is not a refund id', () => {
    expect(recordRefundSchema.safeParse({ ...base, refundRef: 'pay_FP8QHiV938haTz' }).success).toBe(false)
  })

  test('the amount is positive rupees, to the paisa', () => {
    const ok = (amount: unknown) =>
      recordRefundSchema.safeParse({ ...base, amount, refundRef: 'rfnd_ABC' }).success
    expect(ok(0.01)).toBe(true)
    expect(ok(1299.5)).toBe(true)
    expect(ok(0)).toBe(false)
    expect(ok(-10)).toBe(false)
    expect(ok(10.005)).toBe(false)
    expect(ok('499')).toBe(false)
  })

  test('what was refunded already, as the dialog saw it: optional, zero or more, to the paisa', () => {
    const parse = (expectedRefunded: unknown) =>
      recordRefundSchema.safeParse({ ...base, refundRef: 'rfnd_ABC', expectedRefunded })
    expect(parse(undefined).success).toBe(true)
    expect(parse(0).data?.expectedRefunded).toBe(0)
    expect(parse(200).data?.expectedRefunded).toBe(200)
    expect(parse(-1).success).toBe(false)
    expect(parse(0.005).success).toBe(false)
  })

  test('only the three kinds, by uuid', () => {
    expect(recordRefundSchema.safeParse({ ...base, kind: 'wallet', refundRef: 'rfnd_ABC' }).success).toBe(false)
    expect(recordRefundSchema.safeParse({ ...base, id: 'abc', refundRef: 'rfnd_ABC' }).success).toBe(false)
  })
})

describe('refundNowSchema', () => {
  test('everything owed when no amount is given, or a part to the paisa', () => {
    expect(refundNowSchema.parse({ kind: 'booking', id: ID })).toEqual({ kind: 'booking', id: ID, note: undefined })
    expect(refundNowSchema.parse({ kind: 'checkout', id: ID, amount: 199.5, expectedRefunded: 0 })).toMatchObject({
      amount: 199.5,
      expectedRefunded: 0,
    })
    expect(refundNowSchema.safeParse({ kind: 'booking', id: ID, amount: 1.234 }).success).toBe(false)
    expect(refundNowSchema.safeParse({ kind: 'booking', id: ID, amount: 0 }).success).toBe(false)
  })

  test('nothing else rides along: no payment id, no speed', () => {
    expect(refundNowSchema.safeParse({ kind: 'booking', id: ID, paymentId: 'pay_X' }).success).toBe(false)
    expect(refundNowSchema.safeParse({ kind: 'booking', id: ID, speed: 'optimum' }).success).toBe(false)
  })
})
