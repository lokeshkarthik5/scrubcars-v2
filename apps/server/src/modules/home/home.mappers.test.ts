import { describe, expect, test } from 'bun:test'
import { money, toHubBooking } from './home.mappers.js'
import type { HubBookingRecord } from './home.repository.js'

// The row as the relational read really returns it: the nested payment,
// charges and refund records come through json_build_array, so their
// numeric(10,2) money arrives as JS numbers (800, not "800.00").
function row(overrides: Record<string, unknown> = {}): HubBookingRecord {
  return {
    id: 'b1',
    status: 'completed',
    bookingType: 'dropin',
    scheduledAt: new Date('2026-10-10T04:30:00Z'),
    createdAt: new Date('2026-10-08T04:30:00Z'),
    acceptedAt: null,
    startedAt: null,
    completedAt: new Date('2026-10-10T05:30:00Z'),
    cancelledAt: null,
    cancelledBy: null,
    cancelledOnBehalfOf: null,
    noShow: null,
    rescheduledFromId: null,
    rescheduleCount: 0,
    reviewPromptDismissedAt: null,
    vehicleId: 'car1',
    vendorId: 'v1',
    vendor: { id: 'v1', businessName: 'Next Level', bookingsPausedAt: null },
    vehicle: { make: 'Hyundai', model: 'i20' },
    service: null,
    items: [{ name: 'Dent Check', sortOrder: 0 }],
    payment: { status: 'paid', amount: 299, paidAt: new Date('2026-10-08T04:31:00Z'), refundedAmount: null, refundedAt: null },
    review: null,
    charges: [
      {
        id: 'c1',
        kind: 'final_bill',
        lines: [{ description: 'Dent repair', amount: '1099.00' }],
        cancelledAt: null,
        cancelReason: null,
        status: 'due',
        amountDue: 800,
        createdAt: new Date('2026-10-10T05:00:00Z'),
        paidAt: null,
        gatewayPaymentId: null,
        refundedAmount: 12.5,
        refundedAt: null,
      },
    ],
    photos: [
      { stage: 'before', createdAt: new Date('2026-10-10T04:35:00Z') },
      { stage: 'before', createdAt: new Date('2026-10-10T04:36:00Z') },
      { stage: 'after', createdAt: new Date('2026-10-10T05:25:00Z') },
    ],
    refundRecords: [{ id: 'r1', amount: 499, recordedAt: new Date('2026-10-11T04:30:00Z'), refundRef: 'rfnd_Abc123' }],
    timeProposals: [],
    ...overrides,
  } as unknown as HubBookingRecord
}

describe('a Home booking row', () => {
  test('nested money comes back with its two decimals, as the rest of the API sends it', () => {
    const booking = toHubBooking(row(), new Set())
    expect(booking.charges[0]).toMatchObject({ amountDue: '800.00', refundedAmount: '12.50' })
    expect(booking.payment).toMatchObject({ amount: '299.00', refundedAmount: null })
    expect(booking.refunds).toEqual([
      { id: 'r1', amount: '499.00', recordedAt: new Date('2026-10-11T04:30:00Z'), refundRef: 'rfnd_Abc123' },
    ])
  })

  test('text money is left as it is', () => {
    expect(money('800.00')).toBe('800.00')
    expect(money('1250.5')).toBe('1250.50')
    expect(money(0)).toBe('0.00')
  })

  test('photos are counted by stage, with the newest time', () => {
    expect(toHubBooking(row(), new Set()).photos).toEqual({
      count: 3,
      before: 2,
      after: 1,
      lastAt: new Date('2026-10-10T05:25:00Z'),
    })
  })

  test('labels, the car and whether it was moved', () => {
    const booking = toHubBooking(row({ payment: null }), new Set(['b1']))
    expect(booking).toMatchObject({
      serviceLabel: 'Dent Check',
      vehicleName: 'Hyundai i20',
      vendorName: 'Next Level',
      moved: true,
      hasReview: false,
      payment: null,
    })
  })

  test("pickup & drop's handover steps ride along; other types carry none", () => {
    const pickedUpAt = new Date('2026-10-10T04:40:00Z')
    const pickup = toHubBooking(
      row({ bookingType: 'pickup', pickedUpAt, atGarageAt: null, outForDeliveryAt: null, deliveredAt: null }),
      new Set()
    )
    expect(pickup.pickup).toEqual({ pickedUpAt, atGarageAt: null, outForDeliveryAt: null, deliveredAt: null })
    expect(toHubBooking(row(), new Set()).pickup).toBeNull()
  })
})

describe('suggested times and extra work (0041)', () => {
  test("extra work carries its one line as what it is; a final bill carries none", () => {
    const booking = toHubBooking(
      row({
        charges: [
          {
            id: 'x1',
            kind: 'extra_work',
            lines: [{ description: 'Replace wiper blades', amount: '450.00' }],
            cancelledAt: null,
            cancelReason: null,
            status: 'due',
            amountDue: 450,
            createdAt: new Date('2026-10-10T05:00:00Z'),
            paidAt: null,
            gatewayPaymentId: null,
            refundedAmount: null,
            refundedAt: null,
          },
        ],
      }),
      new Set()
    )
    expect(booking.charges[0]).toMatchObject({ kind: 'extra_work', description: 'Replace wiper blades', amountDue: '450.00' })
    expect(toHubBooking(row(), new Set()).charges[0].description).toBeNull()
  })

  test('the newest suggestion comes through, its times as a list however the jsonb arrives', () => {
    const proposal = {
      id: 'p1',
      status: 'open',
      expiresAt: new Date('2026-10-10T08:00:00Z'),
      createdAt: new Date('2026-10-10T04:00:00Z'),
      resolvedAt: null,
    }
    const slots = ['2026-10-10T09:30:00.000Z', '2026-10-10T10:30:00.000Z']
    expect(toHubBooking(row({ timeProposals: [{ ...proposal, slots }] }), new Set()).proposal).toEqual({ ...proposal, slots })
    expect(
      toHubBooking(row({ timeProposals: [{ ...proposal, slots: JSON.stringify(slots) }] }), new Set()).proposal?.slots
    ).toEqual(slots)
    expect(toHubBooking(row(), new Set()).proposal).toBeNull()
  })
})
