import { describe, expect, test } from 'bun:test'
import {
  afterFailedRefund,
  appRefundNote,
  AUTO_REFUND_LOOKBACK_MS,
  AUTO_REFUND_MAX_ATTEMPTS,
  autoRefundCause,
  autoRefundFitsCap,
  autoRefundHold,
  failureReasonFor,
  parseDailyCap,
  razorpayRefundNotes,
  refundIdempotencyKey,
  refundToSend,
  refusalIsDefinite,
  sourceOfFoundRefund,
  unrecordedGatewayRefunds,
  settledByGateway,
  distinctTargets,
  type GatewayRefund,
} from './refund-sending.js'
import { afterRefund } from './refunds.js'

const NOW = new Date('2026-10-17T06:30:00Z')
const HOUR = 60 * 60 * 1000

const gateway = (overrides: Partial<GatewayRefund> = {}): GatewayRefund => ({
  id: 'rfnd_DASH0001',
  amountPaise: 49_900,
  status: 'processed',
  notes: {},
  ...overrides,
})

/** A clear-cut automatic refund: a garage decline an hour ago, nothing sent yet. */
const clearCut = (overrides: Partial<Parameters<typeof autoRefundHold>[0]> = {}) =>
  autoRefundHold({
    kind: 'booking',
    owed: '499.00',
    refunded: null,
    paymentId: 'pay_ABC',
    cause: 'garage_declined',
    complaintOpen: false,
    failedAttempts: 0,
    since: new Date(NOW.getTime() - HOUR),
    now: NOW,
    ...overrides,
  })

describe('settling our pending refunds from what Razorpay lists', () => {
  const record = (refundRef: string | null) => ({ id: `rec_${refundRef}`, refundRef })

  test('processed and failed ones are settled; one still pending or not listed stays', () => {
    const pending = [record('rfnd_A'), record('rfnd_B'), record('rfnd_C'), record('rfnd_D'), record(null)]
    const listed = [
      gateway({ id: 'rfnd_A', status: 'processed' }),
      gateway({ id: 'rfnd_B', status: 'failed' }),
      gateway({ id: 'rfnd_C', status: 'pending' }),
    ]
    expect(settledByGateway(pending, listed)).toEqual({
      processed: [record('rfnd_A')],
      failed: [record('rfnd_B')],
    })
    expect(settledByGateway(pending, [])).toEqual({ processed: [], failed: [] })
  })

  test('each piece of money is checked once, however many of its refunds are pending', () => {
    expect(
      distinctTargets([
        { kind: 'booking', targetId: 'b1' },
        { kind: 'checkout', targetId: 'b1' },
        { kind: 'booking', targetId: 'b1' },
        { kind: 'bill', targetId: 'c1' },
      ])
    ).toEqual([
      { kind: 'booking', id: 'b1' },
      { kind: 'checkout', id: 'b1' },
      { kind: 'bill', id: 'c1' },
    ])
  })
})

describe('what Razorpay already has', () => {
  test('a refund done in the dashboard that we have no record of is found', () => {
    expect(unrecordedGatewayRefunds([gateway()], new Set())).toEqual([gateway()])
  })

  test('one we recorded is not found again, and a failed one moved no money', () => {
    expect(unrecordedGatewayRefunds([gateway()], new Set(['rfnd_DASH0001']))).toEqual([])
    expect(unrecordedGatewayRefunds([gateway({ status: 'failed' })], new Set())).toEqual([])
    expect(unrecordedGatewayRefunds([gateway({ status: 'pending' })], new Set())).toHaveLength(1)
  })

  test('already refunded in the dashboard is recorded, not repeated', () => {
    // The dashboard refund is found and recorded first…
    const [found] = unrecordedGatewayRefunds([gateway()], new Set())
    const recorded = afterRefund('499.00', null, found!.amountPaise / 100)
    expect(recorded).toEqual({ refundedAmount: '499.00', full: true })
    // …so there is nothing left to send.
    expect(
      refundToSend({ refundable: true, paid: '499.00', refunded: recorded.refundedAmount, paymentId: 'pay_ABC' })
    ).toEqual({ kind: 'already_refunded' })
    // A part done in the dashboard leaves only the rest to send.
    const part = afterRefund('499.00', null, 200)
    expect(
      refundToSend({ refundable: true, paid: '499.00', refunded: part.refundedAmount, paymentId: 'pay_ABC' })
    ).toEqual({ kind: 'send', amount: '299.00' })
  })

  test("a refund is ours only when its notes name this money and the app as sender", () => {
    const target = { kind: 'booking' as const, id: 'b1' }
    const notes = razorpayRefundNotes({ ...target, bookingId: 'b1', source: 'auto' })
    expect(sourceOfFoundRefund({ notes }, target)).toBe('auto')
    expect(sourceOfFoundRefund({ notes }, { kind: 'booking', id: 'b2' })).toBe('razorpay')
    expect(sourceOfFoundRefund({ notes: {} }, target)).toBe('razorpay')
    expect(sourceOfFoundRefund({ notes: { ...notes, detlio_source: 'someone' } }, target)).toBe('razorpay')
  })

  test('the notes carry our ids under the names our orders use', () => {
    expect(razorpayRefundNotes({ kind: 'booking', id: 'b1', bookingId: 'b1', source: 'admin' })).toEqual({
      detlio_kind: 'booking',
      detlio_id: 'b1',
      detlio_source: 'admin',
      booking_id: 'b1',
    })
    expect(razorpayRefundNotes({ kind: 'checkout', id: 'i1', bookingId: null, source: 'auto' })).toMatchObject({
      intent_id: 'i1',
    })
    expect(razorpayRefundNotes({ kind: 'bill', id: 'c1', bookingId: 'b1', source: 'admin' })).toMatchObject({
      charge_id: 'c1',
      booking_id: 'b1',
    })
  })
})

describe('how much is sent', () => {
  const owed = { refundable: true, paid: '499.00', refunded: null, paymentId: 'pay_ABC' }

  test('everything still owed, when no amount is asked for', () => {
    expect(refundToSend(owed)).toEqual({ kind: 'send', amount: '499.00' })
  })

  test('a part amount, at most what is owed', () => {
    expect(refundToSend({ ...owed, requested: '200' })).toEqual({ kind: 'send', amount: '200.00' })
    expect(refundToSend({ ...owed, requested: 499 })).toEqual({ kind: 'send', amount: '499.00' })
    expect(refundToSend({ ...owed, requested: '499.01' })).toEqual({ kind: 'too_much' })
    expect(refundToSend({ ...owed, refunded: '300.00', requested: '200' })).toEqual({ kind: 'too_much' })
    expect(refundToSend({ ...owed, requested: 0 })).toEqual({ kind: 'too_much' })
  })

  test('nothing for money that is not to go back, or has all gone back', () => {
    expect(refundToSend({ ...owed, refundable: false })).toEqual({ kind: 'not_due' })
    expect(refundToSend({ ...owed, refunded: '499.00' })).toEqual({ kind: 'already_refunded' })
  })

  test('nothing without a Razorpay payment to refund', () => {
    expect(refundToSend({ ...owed, paymentId: null })).toEqual({ kind: 'no_payment' })
  })
})

describe('the automatic mode', () => {
  test('takes the clear-cut causes', () => {
    const base = { status: 'cancelled', noShow: null, cancelledBy: null, moved: false } as const
    expect(autoRefundCause({ ...base, cancelledBy: 'vendor' })).toBe('garage_declined')
    expect(autoRefundCause({ ...base, cancelledBy: 'user' })).toBe('customer_cancelled')
    expect(autoRefundCause({ ...base, cancelledBy: 'admin' })).toBe('detlio_cancelled')
    expect(autoRefundCause({ ...base, cancelledBy: 'admin', noShow: 'garage' })).toBe('garage_no_show')
  })

  test('never a customer no-show, a moved booking, one still on, or one nobody cancelled', () => {
    const base = { status: 'cancelled', noShow: null, cancelledBy: 'admin', moved: false } as const
    expect(autoRefundCause({ ...base, noShow: 'customer' })).toBeNull()
    expect(autoRefundCause({ ...base, cancelledBy: 'user', moved: true })).toBeNull()
    expect(autoRefundCause({ ...base, status: 'confirmed' })).toBeNull()
    expect(autoRefundCause({ ...base, cancelledBy: null })).toBeNull()
  })

  test('sends a clear-cut whole payment, and a checkout paid with no booking', () => {
    expect(clearCut()).toBeNull()
    expect(clearCut({ kind: 'checkout', cause: 'paid_no_booking' })).toBeNull()
  })

  test('never final-bill money', () => {
    expect(clearCut({ kind: 'bill' })).toBe('bill')
    expect(clearCut({ kind: 'bill', cause: 'detlio_cancelled' })).toBe('bill')
  })

  test('an open or acknowledged complaint holds it for a person', () => {
    expect(clearCut({ complaintOpen: true })).toBe('complaint')
  })

  test('never a part amount: anything already refunded leaves the rest to a person', () => {
    expect(clearCut({ owed: '299.00', refunded: '200.00' })).toBe('part_refunded')
  })

  test('nothing owed, no cause, or no payment id holds it', () => {
    expect(clearCut({ owed: '0.00' })).toBe('not_owed')
    expect(clearCut({ cause: null })).toBe('not_clear_cut')
    expect(clearCut({ paymentId: null })).toBe('no_payment_id')
  })

  test('an old backlog is left alone', () => {
    expect(clearCut({ since: new Date(NOW.getTime() - AUTO_REFUND_LOOKBACK_MS) })).toBeNull()
    expect(clearCut({ since: new Date(NOW.getTime() - AUTO_REFUND_LOOKBACK_MS - 1) })).toBe('too_old')
    expect(clearCut({ since: null })).toBe('too_old')
  })

  test('gives up after its tries', () => {
    expect(clearCut({ failedAttempts: AUTO_REFUND_MAX_ATTEMPTS - 1 })).toBeNull()
    expect(clearCut({ failedAttempts: AUTO_REFUND_MAX_ATTEMPTS })).toBe('gave_up')
  })

  test('the daily cap: up to and including it, never past it', () => {
    expect(autoRefundFitsCap({ sentToday: '19501.00', amount: '499.00', cap: 20_000 })).toBe(true)
    expect(autoRefundFitsCap({ sentToday: '19501.01', amount: '499.00', cap: 20_000 })).toBe(false)
    expect(autoRefundFitsCap({ sentToday: '0.00', amount: '20000.01', cap: 20_000 })).toBe(false)
    expect(autoRefundFitsCap({ sentToday: '0.00', amount: '1.00', cap: 0 })).toBe(false)
  })

  test('the cap is ₹20,000 unless set to a number', () => {
    expect(parseDailyCap(undefined)).toBe(20_000)
    expect(parseDailyCap('')).toBe(20_000)
    expect(parseDailyCap('abc')).toBe(20_000)
    expect(parseDailyCap('-5')).toBe(20_000)
    expect(parseDailyCap('5000')).toBe(5_000)
    expect(parseDailyCap('0')).toBe(0)
    expect(parseDailyCap('1e12')).toBe(10_000_000)
  })
})

describe('the request', () => {
  const key = {
    kind: 'booking' as const,
    targetId: 'b1',
    refundedBefore: '0.00',
    attempt: 0,
    amount: '499.00',
    source: 'admin' as const,
  }

  test('the same attempt always has the same key, in the form Razorpay takes', () => {
    expect(refundIdempotencyKey(key)).toBe(refundIdempotencyKey({ ...key, refundedBefore: '0' }))
    expect(refundIdempotencyKey(key)).toMatch(/^[A-Za-z0-9_-]{10,}$/)
  })

  test('a new try after a failure, another amount or another sender is a new key', () => {
    const first = refundIdempotencyKey(key)
    expect(refundIdempotencyKey({ ...key, attempt: 1 })).not.toBe(first)
    expect(refundIdempotencyKey({ ...key, amount: '200.00' })).not.toBe(first)
    expect(refundIdempotencyKey({ ...key, source: 'auto' })).not.toBe(first)
    expect(refundIdempotencyKey({ ...key, refundedBefore: '200.00' })).not.toBe(first)
  })

  test('only a client error means Razorpay made nothing', () => {
    expect(refusalIsDefinite(400)).toBe(true)
    expect(refusalIsDefinite(404)).toBe(true)
    for (const unknown of [null, 408, 409, 429, 500, 502, 504]) {
      expect(refusalIsDefinite(unknown)).toBe(false)
    }
  })
})

describe('the figures and the words', () => {
  test('a failed refund comes back off the total, and nothing left reads as untouched', () => {
    expect(afterFailedRefund('499.00', '499.00')).toEqual({ refundedAmount: null })
    expect(afterFailedRefund('499.00', '299.00')).toEqual({ refundedAmount: '200.00' })
    expect(afterFailedRefund(null, '100.00')).toEqual({ refundedAmount: null })
  })

  test('the marker on the money row says the app sent it', () => {
    expect(appRefundNote('admin', 'Anand')).toBe('Sent through Razorpay from the app by Anand.')
    expect(appRefundNote('auto', 'Detlio (automatic)')).toBe('Sent through Razorpay automatically.')
    expect(appRefundNote('admin', 'Anand', ' Goodwill ')).toBe('Sent through Razorpay from the app by Anand.\nGoodwill')
  })

  test("a failure reason is never empty and never long", () => {
    expect(failureReasonFor(null, 'Razorpay refused the refund.')).toBe('Razorpay refused the refund.')
    expect(failureReasonFor('  The   balance is low ', 'x')).toBe('The balance is low')
    expect(failureReasonFor('a'.repeat(400), 'x')).toHaveLength(300)
  })
})
