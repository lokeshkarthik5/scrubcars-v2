import { describe, expect, test } from 'bun:test'
import {
  actionsByBooking,
  answersByLine,
  bookingHeadline,
  customerStatusChip,
  whenWords,
} from './booking-status'

// Mon 19 Oct 2026, 10:00 am in Chennai.
const NOW = Date.parse('2026-10-19T04:30:00.000Z')
const TOMORROW_1030 = '2026-10-20T05:00:00.000Z'

const base = {
  status: 'pending' as const,
  bookingType: 'dropin' as const,
  vendorName: 'Marina Auto Spa',
  scheduledAtIso: TOMORROW_1030,
  startedAtIso: undefined,
  completedAtIso: undefined,
  durationMins: 75,
  serviceSummary: 'Wash + wax',
  paymentStatus: 'paid' as const,
  paymentMethod: 'online' as const,
  responseDeadline: null,
  vehicle: { model: 'Creta' },
  timeProposal: null,
}

describe('bookingHeadline', () => {
  test('says when, in words', () => {
    expect(whenWords(TOMORROW_1030, NOW)).toBe('tomorrow at 10:30 am')
    expect(whenWords('2026-10-22T10:30:00.000Z', NOW)).toBe(
      'on Thu 22 Oct at 4:00 pm'
    )
  })

  test('a request waits for the garage, and never says Confirmed', () => {
    const line = bookingHeadline(base, NOW)
    expect(line.title).toBe('Waiting for Marina Auto Spa to accept')
    expect(line.detail).toBe('Requested for tomorrow at 10:30 am.')
    expect(line.step).toBe(0)
    expect(`${line.title} ${line.detail}`).not.toMatch(/confirmed/i)
  })

  test('an accepted booking says when to come, or when the garage comes', () => {
    expect(bookingHeadline({ ...base, status: 'confirmed' }, NOW).title).toBe(
      'See you tomorrow at 10:30 am'
    )
    expect(
      bookingHeadline(
        { ...base, status: 'confirmed', bookingType: 'doorstep' },
        NOW
      ).title
    ).toBe('Coming to you tomorrow at 10:30 am')
  })

  test('work under way says when it started and should be done', () => {
    const line = bookingHeadline(
      {
        ...base,
        status: 'in_progress',
        startedAtIso: '2026-10-19T03:42:00.000Z',
      },
      NOW
    )
    expect(line).toEqual({
      title: 'Washing your car now',
      detail: 'Started 9:12 am · done by about 10:27 am',
      step: 2,
    })
  })

  test('a finished job names the car', () => {
    expect(
      bookingHeadline(
        {
          ...base,
          status: 'completed',
          completedAtIso: '2026-10-19T04:00:00.000Z',
        },
        NOW
      )
    ).toEqual({
      title: 'Your Creta is done',
      detail: 'Marina Auto Spa · Today',
      step: 3,
    })
  })

  test('says by when the garage answers', () => {
    const line = bookingHeadline(
      {
        ...base,
        responseDeadline: {
          respondBy: '2026-10-19T12:30:00.000Z',
          enforced: true,
          windowMins: 120,
        },
      },
      NOW
    )
    expect(line.detail).toBe(
      'They answer by 6:00 pm today. Requested for tomorrow at 10:30 am.'
    )
  })

  test('an unpaid request asks for the payment first', () => {
    expect(
      bookingHeadline({ ...base, paymentStatus: 'pending' }, NOW).title
    ).toBe('Pay to send your request')
  })
})

describe('the bookings list', () => {
  test('chips use the customer words, and a request is never red', () => {
    expect(customerStatusChip('pending')).toEqual({
      label: 'Waiting for garage',
      tone: 'closed',
    })
    expect(customerStatusChip('confirmed').label).toBe('Accepted')
    expect(customerStatusChip('completed')).toEqual({
      label: 'Done',
      tone: 'done',
    })
  })

  test('says when the garage answers by', () => {
    expect(answersByLine('2026-10-19T12:30:00.000Z', NOW)).toBe(
      'Garage answers by 6:00 pm today'
    )
  })

  test('names what each booking needs, once per booking', () => {
    const rupees = (amount: string) => `₹${Number(amount)}`
    const actions = actionsByBooking(
      [
        {
          kind: 'extra_work_due',
          bookingId: 'b1',
          chargeId: 'c1',
          vendorName: 'G',
          description: 'Wipers',
          amount: '650.00',
          raisedAt: '',
          moreDue: 0,
        },
        {
          kind: 'bill_due',
          bookingId: 'b1',
          chargeId: 'c2',
          vendorName: 'G',
          serviceName: 'Dent',
          amountDue: '800.00',
          raisedAt: '',
          moreDue: 0,
        },
        {
          kind: 'bill_due',
          bookingId: 'b2',
          chargeId: 'c3',
          vendorName: 'G',
          serviceName: 'Dent',
          amountDue: '800.00',
          raisedAt: '',
          moreDue: 0,
        },
      ],
      rupees
    )
    expect(actions.get('b1')).toBe('Approve extra work · ₹650')
    expect(actions.get('b2')).toBe('Pay your final bill · ₹800')
  })
})
