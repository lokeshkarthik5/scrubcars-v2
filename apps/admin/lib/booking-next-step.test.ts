import { describe, expect, test } from 'bun:test'
import { bookingNextStep, bookingRowTone } from './booking-next-step'

type Row = Parameters<typeof bookingNextStep>[0]
const NOW = Date.parse('2026-10-26T04:00:00Z') // 9:30 am in Chennai
const booking = (overrides: Partial<Row> = {}): Row => ({
  status: 'confirmed',
  waitingMins: null,
  scheduledAt: '2026-10-26T08:00:00Z',
  cancelledAt: null,
  noShow: null,
  pickup: null,
  startedAt: null,
  respondBy: null,
  refundOwed: null,
  billDue: null,
  notAcceptedInTime: null,
  ...overrides,
})

describe('bookingNextStep', () => {
  test('a refund owed comes first, aged, never grey', () => {
    expect(
      bookingNextStep(
        booking({
          status: 'cancelled',
          refundOwed: '1299.00',
          cancelledAt: '2026-10-24T03:00:00Z',
        }),
        NOW
      )
    ).toEqual({ text: 'Refund ₹1,299', detail: 'Owed 2 days', urgency: 'late' })
    expect(
      bookingNextStep(
        booking({
          status: 'cancelled',
          refundOwed: '499.00',
          cancelledAt: '2026-10-26T03:00:00Z',
        }),
        NOW
      )?.urgency
    ).toBe('attention')
  })

  test('a pending booking: its accept deadline, and how long it has waited', () => {
    expect(
      bookingNextStep(
        booking({
          status: 'pending',
          waitingMins: 45,
          respondBy: '2026-10-26T04:10:00Z',
        }),
        NOW
      )
    ).toEqual({
      text: 'Garage to accept · Accept in 10 min',
      detail: 'Waiting 45 min',
      urgency: 'late',
    })
    expect(
      bookingNextStep(booking({ status: 'pending', waitingMins: 12 }), NOW)
    ).toEqual({
      text: 'Garage to accept',
      detail: 'Waiting 12 min',
      urgency: 'attention',
    })
    expect(
      bookingNextStep(booking({ status: 'pending', waitingMins: 40 }), NOW)
        ?.urgency
    ).toBe('late')
  })

  test('a bill due, a cancelled booking, a job not started, a pickup step', () => {
    expect(
      bookingNextStep(
        booking({ status: 'in_progress', billDue: '400.00' }),
        NOW
      )
    ).toEqual({
      text: 'Bill due ₹400',
      detail: null,
      urgency: 'attention',
    })
    expect(
      bookingNextStep(
        booking({ status: 'cancelled', notAcceptedInTime: 'x' }),
        NOW
      )?.text
    ).toBe('Not accepted in time')
    expect(
      bookingNextStep(booking({ status: 'cancelled', noShow: 'customer' }), NOW)
        ?.text
    ).toBe('Customer no-show')
    expect(bookingNextStep(booking({ status: 'cancelled' }), NOW)).toBeNull()
    expect(
      bookingNextStep(booking({ scheduledAt: '2026-10-26T03:00:00Z' }), NOW)
        ?.text
    ).toBe('Not started')
    expect(
      bookingNextStep(
        booking({ scheduledAt: '2026-10-26T03:00:00Z', startedAt: 'x' }),
        NOW
      )
    ).toBeNull()
    const pickup = {
      pickedUpAt: '2026-10-26T03:30:00Z',
      atGarageAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      pickupOverrideBy: null,
      deliveryOverrideBy: null,
      pickupCodeTriesLeft: 3,
      deliveryCodeTriesLeft: 3,
    }
    expect(
      bookingNextStep(booking({ status: 'in_progress', pickup }), NOW)?.text
    ).toMatch(/^Picked up · /)
    expect(
      bookingNextStep(booking({ status: 'completed', pickup }), NOW)
    ).toBeNull()
    expect(bookingNextStep(booking(), NOW)).toBeNull()
  })

  test('the row edge follows the urgency', () => {
    expect(bookingRowTone({ text: 'x', detail: null, urgency: 'late' })).toBe(
      'urgent'
    )
    expect(
      bookingRowTone({ text: 'x', detail: null, urgency: 'attention' })
    ).toBe('attention')
    expect(
      bookingRowTone({ text: 'x', detail: null, urgency: 'neutral' })
    ).toBeNull()
    expect(bookingRowTone(null)).toBeNull()
  })
})
