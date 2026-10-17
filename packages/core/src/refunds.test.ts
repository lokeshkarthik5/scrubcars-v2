import { describe, expect, test } from 'bun:test'
import { customerRefundLine, refundOwedAge, withoutRefundPromise } from './refunds'

// 12:00 IST on 5 Oct 2026.
const NOW = new Date('2026-10-05T06:30:00Z').getTime()
const HOUR = 60 * 60 * 1000

describe('customerRefundLine', () => {
  test('owed: who refunds it, where to, and how long it takes', () => {
    expect(customerRefundLine({ status: 'owed', amount: 499, amountRefunded: 0 })).toBe(
      'Our team will refund your payment to your original payment method within 5–7 working days.'
    )
  })

  test('refunded: how much and when, and that the bank can take a while', () => {
    expect(
      customerRefundLine({
        status: 'refunded',
        amount: 1299,
        amountRefunded: 1299,
        refundedAt: '2026-10-04T20:00:00Z',
      })
    ).toBe('Refunded ₹1,299 on 5 Oct 2026. It can take 5–7 working days to show in your account.')
  })

  test('partly refunded: how much of how much and when, and no promise about the rest', () => {
    expect(
      customerRefundLine({
        status: 'owed',
        amount: 499,
        amountRefunded: 200,
        refundedAt: '2026-10-05T06:00:00Z',
      })
    ).toBe('Refunded ₹200 of ₹499 on 5 Oct 2026. It can take 5–7 working days to show in your account.')
  })

  test('a replaced bill on a live booking says which payment it is', () => {
    expect(
      customerRefundLine({ status: 'owed', amount: 300, amountRefunded: 0 }, 'earlier_bill')
    ).toBe(
      'Our team will refund your ₹300 payment for the earlier final bill to your original payment method within 5–7 working days.'
    )
    expect(
      customerRefundLine(
        { status: 'refunded', amount: 300, amountRefunded: 300, refundedAt: '2026-10-05T06:00:00Z' },
        'earlier_bill'
      )
    ).toBe(
      'Refunded ₹300 for the earlier final bill on 5 Oct 2026. It can take 5–7 working days to show in your account.'
    )
  })

  test('started through Razorpay from the app: how much, the day, and when it arrives', () => {
    expect(
      customerRefundLine({
        status: 'refunded',
        amount: 499,
        amountRefunded: 499,
        refundedAt: '2026-10-05T06:00:00Z',
        started: { amount: 499, at: '2026-10-05T06:00:00Z' },
      })
    ).toBe('Refund of ₹499 started on 5 Oct 2026. It reaches your account in 5–7 working days.')
    // A part sent, the rest still owed: only what was started is promised.
    expect(
      customerRefundLine({
        status: 'owed',
        amount: 499,
        amountRefunded: 200,
        refundedAt: '2026-10-04T20:00:00Z',
        started: { amount: 200, at: '2026-10-04T20:00:00Z' },
      })
    ).toBe('Refund of ₹200 started on 5 Oct 2026. It reaches your account in 5–7 working days.')
    expect(
      customerRefundLine(
        { status: 'refunded', amount: 300, amountRefunded: 300, started: { amount: 300, at: '2026-10-05T06:00:00Z' } },
        'earlier_bill'
      )
    ).toBe('Refund of ₹300 for the earlier final bill started on 5 Oct 2026. It reaches your account in 5–7 working days.')
  })

  test('nothing to say when nothing is coming back', () => {
    expect(customerRefundLine({ status: 'none', amount: 0, amountRefunded: 0 })).toBeNull()
    expect(customerRefundLine(undefined)).toBeNull()
  })
})

describe('withoutRefundPromise', () => {
  test('drops the closing refund promise and keeps the rest', () => {
    expect(
      withoutRefundPromise(
        'That time was booked up at the garage before this payment completed, so the booking could not be confirmed. Your payment will be refunded.'
      )
    ).toBe(
      'That time was booked up at the garage before this payment completed, so the booking could not be confirmed.'
    )
  })

  test('leaves other reasons alone', () => {
    expect(withoutRefundPromise('Running late today.')).toBe('Running late today.')
    expect(withoutRefundPromise('Your payment will be refunded. Sorry.')).toBe('Your payment will be refunded. Sorry.')
    expect(withoutRefundPromise(null)).toBeNull()
    expect(withoutRefundPromise('Your payment will be refunded.')).toBeNull()
  })
})

describe('refundOwedAge', () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString()

  test('hours on the first day, then days', () => {
    expect(refundOwedAge(ago(20 * 60 * 1000), NOW)).toEqual({ label: 'owed under an hour', late: false })
    expect(refundOwedAge(ago(5 * HOUR), NOW)).toEqual({ label: 'owed 5 h', late: false })
    expect(refundOwedAge(ago(30 * HOUR), NOW)).toEqual({ label: 'owed 1 day', late: false })
  })

  test('late from two days', () => {
    expect(refundOwedAge(ago(47 * HOUR), NOW).late).toBe(false)
    expect(refundOwedAge(ago(48 * HOUR), NOW)).toEqual({ label: 'owed 2 days', late: true })
    expect(refundOwedAge(ago(10 * 24 * HOUR), NOW)).toEqual({ label: 'owed 10 days', late: true })
  })

  test('no time recorded reads as just owed', () => {
    expect(refundOwedAge(null, NOW)).toEqual({ label: 'owed', late: false })
  })
})
