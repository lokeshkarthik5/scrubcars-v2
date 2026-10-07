import { describe, expect, test } from 'bun:test'
import {
  cancelledBy,
  keptMoney,
  summarisePilot,
  wasAccepted,
  type PilotBookingRow,
  type PilotIntentRow,
} from './pilot-stats.js'

let nextId = 0
const row = (overrides: Partial<PilotBookingRow> = {}): PilotBookingRow => ({
  id: `b${++nextId}`,
  rescheduledFromId: null,
  vendorId: 'marina',
  vendorName: 'Marina Auto Spa',
  status: 'pending',
  acceptedBy: null,
  cancelledBy: null,
  cancelledOnBehalfOf: null,
  noShow: null,
  paymentStatus: 'paid',
  paymentAmount: '499.00',
  ...overrides,
})

const intents = (statuses: PilotIntentRow['status'][]): PilotIntentRow[] =>
  statuses.map((status) => ({ status }))

describe('wasAccepted', () => {
  test('a garage member on the row means accepted, even after a later cancel', () => {
    expect(wasAccepted({ status: 'cancelled', acceptedBy: 'u1' })).toBe(true)
  })

  test('confirmed or beyond counts for bookings older than the team model', () => {
    for (const status of ['confirmed', 'in_progress', 'completed']) {
      expect(wasAccepted({ status, acceptedBy: null })).toBe(true)
    }
  })

  test('still waiting, or turned down, is not accepted', () => {
    expect(wasAccepted({ status: 'pending', acceptedBy: null })).toBe(false)
    expect(wasAccepted({ status: 'cancelled', acceptedBy: null })).toBe(false)
  })
})

describe('cancelledBy', () => {
  const cancelled = (o: Partial<PilotBookingRow>) => row({ status: 'cancelled', ...o })

  test('the customer and the garage cancelling for themselves', () => {
    expect(cancelledBy(cancelled({ cancelledBy: 'user' }))).toBe('customer')
    expect(cancelledBy(cancelled({ cancelledBy: 'vendor' }))).toBe('garage')
  })

  test('ops cancelling counts for whoever ops was acting for', () => {
    expect(cancelledBy(cancelled({ cancelledBy: 'admin', cancelledOnBehalfOf: 'customer' }))).toBe('customer')
    expect(cancelledBy(cancelled({ cancelledBy: 'admin', cancelledOnBehalfOf: 'garage' }))).toBe('garage')
    expect(cancelledBy(cancelled({ cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' }))).toBe('detlio')
  })

  test("a no-show is its own count, not Detlio's cancellation", () => {
    expect(
      cancelledBy(cancelled({ cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio', noShow: 'customer' }))
    ).toBeNull()
  })

  test('a booking that was not cancelled has nobody to blame', () => {
    expect(cancelledBy(row({ status: 'completed' }))).toBeNull()
  })
})

describe('keptMoney', () => {
  test('a paid or cash-collected booking that went ahead keeps its money', () => {
    expect(keptMoney(row({ status: 'completed' }))).toBe(true)
    expect(keptMoney(row({ status: 'completed', paymentStatus: 'collected' }))).toBe(true)
  })

  test('a cancelled booking still reads paid, but the money is going back', () => {
    expect(keptMoney(row({ status: 'cancelled', cancelledBy: 'vendor' }))).toBe(false)
    expect(keptMoney(row({ status: 'cancelled', cancelledBy: 'admin', noShow: 'garage' }))).toBe(false)
  })

  test('a customer no-show keeps the payment, per the policy', () => {
    expect(keptMoney(row({ status: 'cancelled', cancelledBy: 'admin', noShow: 'customer' }))).toBe(true)
  })

  test('no money in, nothing kept', () => {
    expect(keptMoney(row({ paymentStatus: 'pending' }))).toBe(false)
    expect(keptMoney(row({ paymentStatus: null }))).toBe(false)
  })
})

describe('summarisePilot', () => {
  test('an empty window is all zeroes, with no rates rather than divide-by-zero', () => {
    const stats = summarisePilot([], [])
    expect(stats.checkoutsStarted).toBe(0)
    expect(stats.revenue).toBe(0)
    expect(stats.rates).toEqual({ paidOfStarted: null, acceptedOfPaid: null, completedOfAccepted: null })
    expect(stats.topGarages).toEqual([])
  })

  test('the funnel from checkout to a finished car', () => {
    const stats = summarisePilot(
      intents(['consumed', 'consumed', 'consumed', 'consumed', 'pending', 'pending', 'pending', 'failed']),
      [
        row({ status: 'completed', acceptedBy: 'u1' }),
        row({ status: 'completed', acceptedBy: 'u1' }),
        row({ status: 'confirmed', acceptedBy: 'u1' }),
        row({ status: 'pending' }),
      ]
    )

    expect(stats.checkoutsStarted).toBe(8)
    expect(stats.paid).toBe(4)
    expect(stats.paidNoBooking).toBe(1)
    expect(stats.accepted).toBe(3)
    expect(stats.completed).toBe(2)
    expect(stats.rates.paidOfStarted).toBe(0.5)
    expect(stats.rates.acceptedOfPaid).toBe(0.75)
    expect(stats.rates.completedOfAccepted).toBeCloseTo(2 / 3)
  })

  test('cancellations by whose call, and no-shows by who missed it', () => {
    const stats = summarisePilot([], [
      row({ status: 'cancelled', cancelledBy: 'user' }),
      row({ status: 'cancelled', cancelledBy: 'admin', cancelledOnBehalfOf: 'customer' }),
      row({ status: 'cancelled', cancelledBy: 'vendor' }),
      row({ status: 'cancelled', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio' }),
      row({ status: 'cancelled', acceptedBy: 'u1', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio', noShow: 'customer' }),
      row({ status: 'cancelled', acceptedBy: 'u1', cancelledBy: 'admin', cancelledOnBehalfOf: 'detlio', noShow: 'garage' }),
    ])

    expect(stats.cancelledByCustomer).toBe(2)
    expect(stats.cancelledByGarage).toBe(1)
    expect(stats.cancelledByDetlio).toBe(1)
    expect(stats.customerNoShows).toBe(1)
    expect(stats.garageNoShows).toBe(1)
    // Both no-shows had been accepted.
    expect(stats.accepted).toBe(2)
  })

  test('revenue is money actually in, to the paisa', () => {
    const stats = summarisePilot([], [
      row({ paymentAmount: '499.10' }),
      row({ paymentAmount: '1999.20' }),
      row({ paymentStatus: 'collected', paymentAmount: '300.00' }),
      row({ paymentStatus: 'pending', paymentAmount: '799.00' }),
      row({ paymentStatus: 'refunded', paymentAmount: '899.00' }),
      row({ paymentStatus: null, paymentAmount: null }),
    ])
    expect(stats.revenue).toBe(2798.3)
  })

  test('declined and cancelled prepaid bookings are not revenue and do not rank a garage', () => {
    const declined = () =>
      row({ vendorId: 'x', vendorName: 'Garage X', status: 'cancelled', cancelledBy: 'vendor', paymentAmount: '900.00' })
    const stats = summarisePilot([], [
      declined(),
      declined(),
      declined(),
      row({ vendorId: 'y', vendorName: 'Garage Y', status: 'completed', acceptedBy: 'u1' }),
    ])

    expect(stats.revenue).toBe(499)
    expect(stats.cancelledByGarage).toBe(3)
    expect(stats.topGarages).toEqual([{ vendorId: 'y', name: 'Garage Y', paidBookings: 1, revenue: 499 }])
  })

  test('a rescheduled booking counts once, as its latest row, and is not a cancellation', () => {
    // Paid ₹500, the garage accepted, then the customer moved the slot twice.
    // Each move cancelled the old row as the customer's and copied the 'paid'
    // payment onto the new one; the garage has re-accepted the latest.
    const first = row({ id: 'r1', status: 'cancelled', cancelledBy: 'user', acceptedBy: 'u1', paymentAmount: '500.00' })
    const second = row({ id: 'r2', rescheduledFromId: 'r1', status: 'cancelled', cancelledBy: 'user', paymentAmount: '500.00' })
    const latest = row({ id: 'r3', rescheduledFromId: 'r2', status: 'confirmed', acceptedBy: 'u1', paymentAmount: '500.00' })

    const stats = summarisePilot(intents(['consumed']), [first, second, latest])

    expect(stats.cancelledByCustomer).toBe(0)
    expect(stats.accepted).toBe(1)
    expect(stats.revenue).toBe(500)
    expect(stats.topGarages[0].paidBookings).toBe(1)
    expect(stats.rates.acceptedOfPaid).toBe(1)
  })

  test('a moved booking still waiting for the garage is not accepted yet', () => {
    const first = row({ id: 'm1', status: 'cancelled', cancelledBy: 'user', acceptedBy: 'u1' })
    const moved = row({ id: 'm2', rescheduledFromId: 'm1', status: 'pending' })

    const stats = summarisePilot(intents(['consumed']), [first, moved])

    expect(stats.accepted).toBe(0)
    expect(stats.revenue).toBe(499)
  })

  test('the top five garages by paid bookings, then by money, then by name', () => {
    const garage = (id: string, n: number, amountEach = '100.00') =>
      Array.from({ length: n }, () => row({ vendorId: id, vendorName: `Garage ${id}`, paymentAmount: amountEach }))

    const stats = summarisePilot([], [
      ...garage('a', 1),
      ...garage('b', 3),
      ...garage('c', 2, '500.00'),
      ...garage('d', 2, '100.00'),
      ...garage('e', 4),
      ...garage('f', 1, '900.00'),
      // Unpaid bookings do not put a garage on the board.
      row({ vendorId: 'g', vendorName: 'Garage g', paymentStatus: 'pending' }),
      row({ vendorId: 'g', vendorName: 'Garage g', paymentStatus: 'pending' }),
      row({ vendorId: 'g', vendorName: 'Garage g', paymentStatus: 'pending' }),
      row({ vendorId: 'g', vendorName: 'Garage g', paymentStatus: 'pending' }),
      row({ vendorId: 'g', vendorName: 'Garage g', paymentStatus: 'pending' }),
    ])

    expect(stats.topGarages.map((g) => g.vendorId)).toEqual(['e', 'b', 'c', 'd', 'f'])
    expect(stats.topGarages[2]).toEqual({ vendorId: 'c', name: 'Garage c', paidBookings: 2, revenue: 1000 })
  })
})
