import { describe, expect, test } from 'bun:test'
import {
  customerWaitingLine,
  customerWaitingNote,
  garageCountdown,
  notAcceptedRefundLine,
  notAcceptedTitle,
} from './response-deadline'

const at = (time: string) => new Date(`2026-10-19T${time}:00+05:30`).getTime()
const deadline = (time: string, enforced = true) => ({
  respondBy: new Date(at(time)).toISOString(),
  enforced,
  windowMins: 30,
})

describe('garageCountdown', () => {
  test('counts down in whole minutes inside the window', () => {
    expect(garageCountdown(deadline('10:42'), at('10:30'))).toEqual({
      kind: 'within',
      text: 'Accept within 12 min',
      amber: false,
    })
    expect(garageCountdown(deadline('10:42'), at('10:12')).text).toBe('Accept within 30 min')
  })

  test('amber in the last five minutes, never "within 0 min"', () => {
    expect(garageCountdown(deadline('10:42'), at('10:37')).amber).toBe(true)
    expect(garageCountdown(deadline('10:42'), at('10:36')).amber).toBe(false)
    expect(garageCountdown(deadline('10:42'), at('10:41') + 50_000).text).toBe('Accept within 1 min')
  })

  test('names the time while the clock has not started (it starts at opening)', () => {
    expect(garageCountdown(deadline('09:30'), at('07:15'))).toEqual({
      kind: 'by',
      text: 'Accept by 9:30 am',
      amber: false,
    })
  })

  test('past it with the switch on: cancelled and refunded', () => {
    const passed = garageCountdown(deadline('10:42'), at('10:43'))
    expect(passed.kind).toBe('passed')
    expect(passed.text).toBe('Not accepted in time — cancelled and refunded')
  })

  test('past it with the switch off: only late', () => {
    expect(garageCountdown(deadline('10:42', false), at('10:50')).text).toBe(
      'Accept as soon as you can — it was due by 10:42 am'
    )
  })
})

describe("the customer's lines", () => {
  test('waiting, with the time while it is ahead', () => {
    expect(customerWaitingLine('Marina Auto Spa', deadline('10:42'), at('10:20'))).toBe(
      'Waiting for Marina Auto Spa to accept — by 10:42 am'
    )
    expect(customerWaitingLine('Marina Auto Spa', deadline('10:42'), at('10:50'))).toBe(
      'Waiting for Marina Auto Spa to accept'
    )
    expect(customerWaitingLine('Marina Auto Spa', null, at('10:20'))).toBe('Waiting for Marina Auto Spa to accept')
  })

  test('promises a cancellation only with the switch on', () => {
    expect(customerWaitingNote(deadline('10:42', false), at('10:20'))).toBeNull()
    expect(customerWaitingNote(deadline('10:42'), at('10:20'))).toMatch(/refunded in full/)
    expect(customerWaitingNote(deadline('10:42'), at('10:50'))).toMatch(/being cancelled/)
  })

  test('after the auto-cancel', () => {
    expect(notAcceptedTitle('Marina Auto Spa')).toBe("Marina Auto Spa didn't accept in time")
    expect(notAcceptedRefundLine({ status: 'owed', amount: 799, amountRefunded: 0 })).toBe(
      'Your full refund is on its way (5–7 working days).'
    )
    expect(
      notAcceptedRefundLine({ status: 'owed', amount: 799, amountRefunded: 0, started: { amount: 799, at: '2026-10-19T05:30:00.000Z' } })
    ).toMatch(/^Refund of ₹799 started on/)
    expect(notAcceptedRefundLine({ status: 'refunded', amount: 799, amountRefunded: 799, refundedAt: '2026-10-19T05:30:00.000Z' })).toMatch(
      /^Refunded ₹799/
    )
  })
})
