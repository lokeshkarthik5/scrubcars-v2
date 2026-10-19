import { describe, expect, test } from 'bun:test'
import {
  inboxSubtitle,
  inboxTitle,
  navCounts,
  taskLine,
  type TodayTask,
} from './today'

const NOW = Date.parse('2026-10-19T05:00:00Z') // Mon 19 Oct, 10:30 am IST
const MIN = 60_000

const waiting = (dueInMins: number | null): TodayTask => {
  const scheduledAt = new Date(NOW + 90 * MIN).toISOString()
  return {
    key: 'booking_waiting:b1',
    kind: 'booking_waiting',
    group: 'bookings',
    dueAt:
      dueInMins === null
        ? scheduledAt
        : new Date(NOW + dueInMins * MIN).toISOString(),
    since: null,
    late: dueInMins !== null && dueInMins <= 0,
    bookingId: 'b1',
    reference: '3F2A9C1B',
    garage: { name: 'Shine Auto Spa', phone: '9840000101' },
    customerName: 'Priya Raman',
    services: 'Foam wash',
    amount: '899.00',
    scheduledAt,
  }
}

describe('a task as a line', () => {
  test('a booking waiting for its garage counts down, coral inside 15 minutes', () => {
    const line = taskLine(waiting(10), NOW)
    expect(line.title).toBe('Shine Auto Spa hasn’t accepted #3F2A9C1B')
    expect(line.detail).toBe(
      'Priya Raman · Foam wash · ₹899 paid · Today · 12:00 pm'
    )
    expect(line.chip).toEqual({ text: 'Accept in 10 min', urgency: 'late' })
    expect(line.action).toMatchObject({ kind: 'call', phone: '9840000101' })
    expect(taskLine(waiting(41), NOW).chip).toEqual({
      text: 'Accept in 41 min',
      urgency: 'attention',
    })
    expect(taskLine(waiting(-26 * 60), NOW).chip).toEqual({
      text: 'Late · 26 h',
      urgency: 'late',
    })
    // No deadline on file: the slot is the clock, and it is not a cancellation.
    expect(taskLine(waiting(null), NOW).chip.text).toBe('Starts by 12:00 pm')
  })

  test('a refund owed reads as the Refunds page reads it', () => {
    const line = taskLine(
      {
        key: 'refund_owed:r1',
        kind: 'refund_owed',
        group: 'money',
        dueAt: null,
        since: new Date(NOW - 3 * 24 * 60 * MIN).toISOString(),
        late: false,
        refundId: 'r1',
        bookingId: 'b9',
        reference: 'A1C93F02',
        customerName: 'Arun Venkatesh',
        garageName: 'T. Nagar Quick Wash',
        amountOwed: '1299.50',
        razorpayPaymentId: 'pay_X',
      },
      NOW
    )
    expect(line.title).toBe('Refund ₹1,299.50 to Arun Venkatesh')
    expect(line.chip).toEqual({ text: 'Owed 3 days', urgency: 'late' })
    expect(line.href).toBe('/bookings/b9')
  })

  test('the title and the menu counts', () => {
    expect(inboxTitle(0)).toBe('Nothing needs you right now')
    expect(inboxTitle(1)).toBe('1 thing needs you today')
    expect(inboxTitle(9)).toBe('9 things need you today')
    expect(inboxSubtitle(2, 9)).toBe(
      '2 are late. Work top to bottom: the list is ordered by deadline.'
    )
    const counts = navCounts({
      counts: {
        today: { n: 9, late: 2 },
        bookings: { n: 3, late: 0 },
        issues: { n: 4, late: 1 },
        refunds: { n: 2, late: 0 },
        garages: { n: 5, late: 0 },
      },
    })
    expect(counts.today).toEqual({ n: 9, tone: 'late' })
    expect(counts.bookings).toEqual({ n: 3, tone: 'attention' })
    expect(counts.garages).toEqual({ n: 5, tone: 'neutral' })
  })
})
