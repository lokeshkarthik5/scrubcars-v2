import { describe, expect, test } from 'bun:test'
import { ApiError } from '@repo/core/api/client'
import {
  confirmPayment,
  FALLBACK_REFUND_MESSAGE,
  FINAL_BILL_CANCELLED_MESSAGE,
  FINAL_BILL_REPLACED_MESSAGE,
  finalBillPollResult,
  intentPollResult,
  isRetryable,
  paymentHelpMessage,
  POLL_INTERVAL_MS,
  POLL_WINDOW_MS,
  refundMessage,
  VERIFY_RETRY_DELAYS_MS,
  type PollResult,
} from './payment-confirmation'

/**
 * A clock that only moves when the code under test sleeps, so a minute of
 * polling runs in microseconds and every wait is on the record.
 */
function fakeClock() {
  let time = Date.UTC(2026, 9, 4, 10, 0)
  const slept: number[] = []
  return {
    slept,
    now: () => time,
    sleep: async (ms: number) => {
      slept.push(ms)
      time += ms
    },
  }
}

const network = () => new TypeError('Failed to fetch')
const serverError = () => new ApiError(502, 'Bad gateway')
const refused = () => new ApiError(400, 'Invalid payment signature', 'INVALID_SIGNATURE')
const refund = () =>
  new ApiError(
    409,
    'That car already has an overlapping booking, so this one could not be confirmed. Your payment will be refunded.',
    'BOOKING_CONFIRM_FAILED_REFUND_DUE'
  )

/** Calls that fail with each given error in turn, then succeed. */
function failingThen<T>(errors: Error[], value: T) {
  let calls = 0
  const fn = async () => {
    calls++
    const error = errors.shift()
    if (error) throw error
    return value
  }
  return { fn, calls: () => calls }
}

const neverPolled = async (): Promise<PollResult> => {
  throw new Error('should not poll')
}

describe('isRetryable', () => {
  test('a dropped connection and a server error are blips', () => {
    expect(isRetryable(network())).toBe(true)
    expect(isRetryable(serverError())).toBe(true)
    expect(isRetryable(new ApiError(429, 'Too many requests'))).toBe(true)
  })

  test("a 4xx is the server's answer", () => {
    expect(isRetryable(refused())).toBe(false)
    expect(isRetryable(new ApiError(404, 'Booking intent not found'))).toBe(false)
  })

  test('anything else is not ours to retry', () => {
    expect(isRetryable(new Error('boom'))).toBe(false)
  })
})

describe('refundMessage', () => {
  test("only the paid-but-no-booking refusal carries one", () => {
    expect(refundMessage(refund())).toContain('Your payment will be refunded.')
    expect(refundMessage(refused())).toBeNull()
    expect(refundMessage(network())).toBeNull()
  })

  test('so does a final bill paid after the garage replaced it', () => {
    const replaced = new ApiError(409, FINAL_BILL_REPLACED_MESSAGE, 'FINAL_BILL_REFUND_DUE')
    expect(refundMessage(replaced)).toBe(FINAL_BILL_REPLACED_MESSAGE)
    expect(refundMessage(new ApiError(409, 'This bill is already paid.', 'CHARGE_ALREADY_PAID'))).toBeNull()
  })
})

describe('confirmPayment', () => {
  test('a confirm that works first time books at once, with no waiting', async () => {
    const clock = fakeClock()
    const verify = failingThen([], { bookingId: 'b1' })
    const outcome = await confirmPayment({ verify: verify.fn, poll: neverPolled, ...clock })
    expect(outcome).toEqual({ kind: 'booked', bookingId: 'b1' })
    expect(clock.slept).toEqual([])
  })

  test('blips are retried after 1, 3 and 6 seconds', async () => {
    const clock = fakeClock()
    const verify = failingThen([network(), serverError(), network()], { bookingId: 'b1' })
    const outcome = await confirmPayment({ verify: verify.fn, poll: neverPolled, ...clock })
    expect(outcome).toEqual({ kind: 'booked', bookingId: 'b1' })
    expect(verify.calls()).toBe(4)
    expect(clock.slept).toEqual([...VERIFY_RETRY_DELAYS_MS])
  })

  test('a refund refusal is final and shows the server\'s words', async () => {
    const clock = fakeClock()
    const verify = failingThen([refund()], { bookingId: 'never' })
    const outcome = await confirmPayment({ verify: verify.fn, poll: neverPolled, ...clock })
    expect(outcome).toEqual({ kind: 'failed', message: refund().message })
    expect(verify.calls()).toBe(1)
  })

  test('a 4xx is not retried, but the webhook may still have booked it', async () => {
    const clock = fakeClock()
    const verify = failingThen([refused()], { bookingId: 'never' })
    const poll = async (): Promise<PollResult> => ({ kind: 'booked', bookingId: 'from-webhook' })
    const outcome = await confirmPayment({ verify: verify.fn, poll, ...clock })
    expect(outcome).toEqual({ kind: 'booked', bookingId: 'from-webhook' })
    expect(verify.calls()).toBe(1)
    expect(clock.slept).toEqual([])
  })

  test('when the retries run out, it watches until the booking appears', async () => {
    const clock = fakeClock()
    const verify = failingThen([network(), network(), network(), network()], { bookingId: 'never' })
    let looks = 0
    const poll = async (): Promise<PollResult> =>
      ++looks < 3 ? { kind: 'pending' } : { kind: 'booked', bookingId: 'b2' }

    const outcome = await confirmPayment({ verify: verify.fn, poll, ...clock })
    expect(outcome).toEqual({ kind: 'booked', bookingId: 'b2' })
    expect(verify.calls()).toBe(4)
    expect(clock.slept).toEqual([...VERIFY_RETRY_DELAYS_MS, POLL_INTERVAL_MS, POLL_INTERVAL_MS])
  })

  test('a checkout found failed while watching shows its refund message', async () => {
    const clock = fakeClock()
    const verify = failingThen([refused()], { bookingId: 'never' })
    const poll = async (): Promise<PollResult> => ({ kind: 'failed', message: 'Your payment will be refunded.' })
    expect(await confirmPayment({ verify: verify.fn, poll, ...clock })).toEqual({
      kind: 'failed',
      message: 'Your payment will be refunded.',
    })
  })

  test('nothing after a minute of watching is unconfirmed, never a second Pay', async () => {
    const clock = fakeClock()
    const verify = failingThen([refused()], { bookingId: 'never' })
    let looks = 0
    const poll = async (): Promise<PollResult> => {
      looks++
      return { kind: 'pending' }
    }
    const started = clock.now()

    expect(await confirmPayment({ verify: verify.fn, poll, ...clock })).toEqual({ kind: 'unconfirmed' })
    // Watched for the whole minute and not a poll interval past it.
    expect(clock.now() - started).toBeLessThanOrEqual(POLL_WINDOW_MS)
    expect(clock.now() - started).toBeGreaterThan(POLL_WINDOW_MS - POLL_INTERVAL_MS)
    expect(looks).toBe(POLL_WINDOW_MS / POLL_INTERVAL_MS + 1)
  })

  test('a look that hits a blip keeps watching', async () => {
    const clock = fakeClock()
    const verify = failingThen([refused()], { bookingId: 'never' })
    const poll = failingThen<PollResult>([network(), serverError()], { kind: 'booked', bookingId: 'b3' })
    expect(await confirmPayment({ verify: verify.fn, poll: poll.fn, ...clock })).toEqual({
      kind: 'booked',
      bookingId: 'b3',
    })
  })

  test('a look the server refuses outright stops watching at once', async () => {
    const clock = fakeClock()
    const verify = failingThen([refused()], { bookingId: 'never' })
    const poll = failingThen<PollResult>([new ApiError(404, 'Booking intent not found')], {
      kind: 'booked',
      bookingId: 'never',
    })
    expect(await confirmPayment({ verify: verify.fn, poll: poll.fn, ...clock })).toEqual({
      kind: 'unconfirmed',
    })
    expect(clock.slept).toEqual([])
  })
})

describe('intentPollResult', () => {
  test('a consumed checkout is the booking', () => {
    expect(intentPollResult({ status: 'consumed', bookingId: 'b1', message: null })).toEqual({
      kind: 'booked',
      bookingId: 'b1',
    })
  })

  test("a failed one is the server's refund message, or a plain one", () => {
    expect(intentPollResult({ status: 'failed', bookingId: null, message: 'Refunded soon.' })).toEqual({
      kind: 'failed',
      message: 'Refunded soon.',
    })
    expect(intentPollResult({ status: 'failed', bookingId: null, message: null })).toEqual({
      kind: 'failed',
      message: FALLBACK_REFUND_MESSAGE,
    })
  })

  test('anything else is still on its way', () => {
    expect(intentPollResult({ status: 'pending', bookingId: null, message: null })).toEqual({ kind: 'pending' })
    // Consumed with no booking id would be a server bug; keep watching rather than navigate nowhere.
    expect(intentPollResult({ status: 'consumed', bookingId: null, message: null })).toEqual({ kind: 'pending' })
  })
})

describe('finalBillPollResult', () => {
  test('the bill that stands, paid, is done', () => {
    expect(finalBillPollResult('b1', 'c1', { id: 'c1', status: 'paid' })).toEqual({
      kind: 'booked',
      bookingId: 'b1',
    })
  })

  test('still due is still on its way: the webhook may settle it', () => {
    expect(finalBillPollResult('b1', 'c1', { id: 'c1', status: 'due' })).toEqual({ kind: 'pending' })
  })

  test('another bill standing in its place means the one paid for was replaced', () => {
    expect(finalBillPollResult('b1', 'c1', { id: 'c2', status: 'due' })).toEqual({
      kind: 'failed',
      message: FINAL_BILL_REPLACED_MESSAGE,
    })
    expect(finalBillPollResult('b1', 'c1', null)).toEqual({
      kind: 'failed',
      message: FINAL_BILL_REPLACED_MESSAGE,
    })
  })

  test('no bill standing on a cancelled booking means the booking was cancelled, not the bill changed', () => {
    expect(finalBillPollResult('b1', 'c1', null, 'cancelled')).toEqual({
      kind: 'failed',
      message: FINAL_BILL_CANCELLED_MESSAGE,
    })
    expect(finalBillPollResult('b1', 'c1', null, 'in_progress')).toEqual({
      kind: 'failed',
      message: FINAL_BILL_REPLACED_MESSAGE,
    })
  })

  test('confirmPayment never asks again once the bill is paid by the webhook', async () => {
    const clock = fakeClock()
    let looks = 0
    const outcome = await confirmPayment({
      verify: async () => {
        throw new TypeError('Failed to fetch')
      },
      poll: async () => finalBillPollResult('b1', 'c1', { id: 'c1', status: ++looks < 3 ? 'due' : 'paid' }),
      ...clock,
    })
    expect(outcome).toEqual({ kind: 'booked', bookingId: 'b1' })
  })
})

describe('paymentHelpMessage', () => {
  test('carries the payment id, whatever the situation', () => {
    for (const situation of ['missing_booking', 'not_marked_paid', 'bill_not_marked_paid', 'refund', 'bill_refund'] as const) {
      expect(paymentHelpMessage('pay_ABC123', situation)).toContain('Payment ID: pay_ABC123')
    }
  })

  test('checkout with no booking yet asks where the booking is', () => {
    expect(paymentHelpMessage('pay_ABC123')).toContain("hasn't shown up yet")
  })

  test('the refund case asks about the refund, not a missing booking', () => {
    const message = paymentHelpMessage('pay_ABC123', 'refund')
    expect(message).toContain('refund')
    expect(message).not.toContain("hasn't shown up")
  })

  test('the Pay Now case says the booking does not show the payment', () => {
    expect(paymentHelpMessage('pay_ABC123', 'not_marked_paid')).toContain("doesn't show as paid yet")
  })

  test('a final bill refund is about the bill, not a booking that was never made', () => {
    const message = paymentHelpMessage('pay_ABC123', 'bill_refund')
    expect(message).toContain('paid the final bill for my booking and was told this payment will be refunded')
    expect(message).not.toContain("couldn't be made into a booking")
  })

  test('a final bill says it is the bill that does not show as paid', () => {
    expect(paymentHelpMessage('pay_ABC123', 'bill_not_marked_paid')).toContain(
      "paid the final bill for my booking but it doesn't show as paid yet"
    )
  })
})
