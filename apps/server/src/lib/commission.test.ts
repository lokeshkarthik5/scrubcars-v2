import { describe, expect, test } from 'bun:test'
import {
  bookingCommission,
  chainCommission,
  COMMISSION_RATES,
  commissionRules,
  earnsPayout,
  FREE_BOOKINGS,
  garageCommissionStatus,
  mainCategory,
  queuePositions,
  wasReceived,
  type CommissionBooking,
  type GarageQueueChain,
  type QueuedChain,
} from './commission.js'

const DAY = 24 * 60 * 60 * 1000
const START = Date.parse('2026-09-01T05:00:00.000Z')

let nextId = 0
const chain = (overrides: Partial<GarageQueueChain> = {}): GarageQueueChain => {
  const n = ++nextId
  return {
    rootId: `c${String(n).padStart(4, '0')}`,
    vendorId: 'marina',
    vendorName: 'Marina Auto Spa',
    bookedAt: new Date(START + n * 60_000),
    bookedDay: '2026-09-01',
    status: 'completed',
    acceptedBy: null,
    paymentStatus: 'paid',
    markedTest: false,
    ...overrides,
  }
}

const booking = (overrides: Partial<CommissionBooking> = {}): CommissionBooking => ({
  status: 'completed',
  noShow: null,
  paymentStatus: 'paid',
  paymentRefunded: '0.00',
  amount: '500.00',
  subtotalAmount: '500.00',
  discountFundedBy: null,
  items: [{ category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0 }],
  billsPaid: null,
  ...overrides,
})

describe('COMMISSION_RATES', () => {
  test('8% on washes, packages and others; 5% on the high-ticket work', () => {
    expect(COMMISSION_RATES).toEqual({
      car_wash: 0.08,
      package: 0.08,
      others: 0.08,
      detailing: 0.05,
      coating: 0.05,
      scratch_removal: 0.05,
    })
    expect(FREE_BOOKINGS).toBe(25)
  })

  test('stated for the page from the same table, highest rate first', () => {
    expect(commissionRules()).toEqual({
      rates: [
        { rate: 0.08, categories: ['car_wash', 'package', 'others'] },
        { rate: 0.05, categories: ['detailing', 'coating', 'scratch_removal'] },
      ],
      freeBookings: 25,
    })
  })
})

describe('wasReceived', () => {
  test('a payment that landed: paid, collected, or paid and refunded since', () => {
    for (const paymentStatus of ['paid', 'collected', 'refunded']) {
      expect(wasReceived({ status: 'cancelled', acceptedBy: null, paymentStatus })).toBe(true)
    }
  })

  test('an old pay-later booking counts once the garage accepted it, unpaid or not', () => {
    expect(wasReceived({ status: 'confirmed', acceptedBy: null, paymentStatus: 'pending' })).toBe(true)
    expect(wasReceived({ status: 'cancelled', acceptedBy: 'u1', paymentStatus: 'pending' })).toBe(true)
  })

  test('an unpaid booking nobody accepted never reached the garage', () => {
    expect(wasReceived({ status: 'pending', acceptedBy: null, paymentStatus: 'pending' })).toBe(false)
    expect(wasReceived({ status: 'cancelled', acceptedBy: null, paymentStatus: 'pending' })).toBe(false)
    expect(wasReceived({ status: 'cancelled', acceptedBy: null, paymentStatus: 'failed' })).toBe(false)
    expect(wasReceived({ status: 'pending', acceptedBy: null, paymentStatus: null })).toBe(false)
  })
})

describe('queuePositions', () => {
  test('each garage has its own queue, in the order bookings were made', () => {
    const a1 = chain({ vendorId: 'a', bookedAt: new Date(START + 2 * DAY) })
    const b1 = chain({ vendorId: 'b', bookedAt: new Date(START + DAY) })
    const a2 = chain({ vendorId: 'a', bookedAt: new Date(START + 3 * DAY) })
    const a0 = chain({ vendorId: 'a', bookedAt: new Date(START) })
    const positions = queuePositions([a1, b1, a2, a0])
    expect(positions.get(a0.rootId)).toBe(1)
    expect(positions.get(a1.rootId)).toBe(2)
    expect(positions.get(a2.rootId)).toBe(3)
    expect(positions.get(b1.rootId)).toBe(1)
  })

  test('two made in the same instant come out by id, every time', () => {
    const at = new Date(START)
    const later = chain({ rootId: 'zz', bookedAt: at })
    const earlier = chain({ rootId: 'aa', bookedAt: at })
    expect(queuePositions([later, earlier]).get('aa')).toBe(1)
    expect(queuePositions([earlier, later]).get('aa')).toBe(1)
  })

  test('cancelled and no-show bookings use up a free place; unreceived and Test ones do not', () => {
    const declined = chain({ status: 'cancelled', paymentStatus: 'refunded' })
    const noShow = chain({ status: 'cancelled', paymentStatus: 'paid' })
    const neverPaid = chain({ status: 'cancelled', paymentStatus: 'pending' })
    const test = chain({ markedTest: true })
    const next = chain()
    const positions = queuePositions([declined, noShow, neverPaid, test, next])
    expect(positions.get(declined.rootId)).toBe(1)
    expect(positions.get(noShow.rootId)).toBe(2)
    expect(positions.has(neverPaid.rootId)).toBe(false)
    expect(positions.has(test.rootId)).toBe(false)
    expect(positions.get(next.rootId)).toBe(3)
  })

  test('the 26th booking is charged even when cancelled ones filled the first 25', () => {
    const queue: QueuedChain[] = [
      ...Array.from({ length: 5 }, () => chain({ status: 'cancelled', paymentStatus: 'refunded' })),
      ...Array.from({ length: 20 }, () => chain()),
    ]
    const twentySixth = chain()
    const positions = queuePositions([...queue, twentySixth])
    expect(positions.get(twentySixth.rootId)).toBe(26)
    expect(chainCommission(booking(), positions.get(twentySixth.rootId))).toBe(40)
    expect(chainCommission(booking(), positions.get(queue[24].rootId))).toBe(0)
  })
})

describe('earnsPayout', () => {
  test('a finished job and a customer no-show earn; the rest do not', () => {
    expect(earnsPayout(booking())).toBe(true)
    expect(earnsPayout(booking({ status: 'cancelled', noShow: 'customer' }))).toBe(true)
    expect(earnsPayout(booking({ status: 'cancelled', noShow: 'garage' }))).toBe(false)
    expect(earnsPayout(booking({ status: 'cancelled' }))).toBe(false)
    expect(earnsPayout(booking({ status: 'confirmed' }))).toBe(false)
  })

  test('a customer no-show refunded by hand earns nothing', () => {
    expect(
      earnsPayout(booking({ status: 'cancelled', noShow: 'customer', paymentRefunded: '100.00' }))
    ).toBe(false)
  })
})

describe('mainCategory', () => {
  test('the service priced on inspection, wherever it sits', () => {
    expect(
      mainCategory([
        { category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0 },
        { category: 'scratch_removal', amount: '300.00', pricingType: 'on_inspection', sortOrder: 1 },
      ])
    ).toBe('scratch_removal')
  })

  test('else the first item, by its order on the booking', () => {
    expect(
      mainCategory([
        { category: 'detailing', amount: '900.00', sortOrder: 1 },
        { category: 'coating', amount: '300.00', sortOrder: 0 },
      ])
    ).toBe('coating')
    expect(mainCategory([])).toBeNull()
  })
})

describe('bookingCommission', () => {
  test('a travel fee (0062) is the garage’s whole: no commission on it, and a garage promo never scales it in', () => {
    // ₹1,800 wash + ₹100 travel fee: 8% of the wash only.
    expect(
      bookingCommission(
        booking({
          amount: '1900.00',
          subtotalAmount: '1900.00',
          travelFee: '100.00',
          items: [{ category: 'car_wash', amount: '1800.00', sortOrder: 0 }],
        })
      )
    ).toBe(144)
    // A garage-funded ₹180 off the wash: 8% of ₹1,620.
    expect(
      bookingCommission(
        booking({
          amount: '1720.00',
          subtotalAmount: '1900.00',
          discountFundedBy: 'vendor',
          travelFee: '100.00',
          items: [{ category: 'car_wash', amount: '1800.00', sortOrder: 0 }],
        })
      )
    ).toBe(129.6)
  })

  test('each item at its own category rate', () => {
    expect(
      bookingCommission(
        booking({
          amount: '2000.00',
          subtotalAmount: '2000.00',
          items: [
            { category: 'car_wash', amount: '500.00', sortOrder: 0 },
            { category: 'detailing', amount: '1500.00', sortOrder: 1 },
          ],
        })
      )
    ).toBe(115) // 40 + 75
  })

  test('a Detlio-funded promo leaves the full price as the base', () => {
    expect(
      bookingCommission(
        booking({
          amount: '1800.00',
          subtotalAmount: '2000.00',
          discountFundedBy: 'platform',
          items: [{ category: 'detailing', amount: '2000.00', sortOrder: 0 }],
        })
      )
    ).toBe(100)
  })

  test('a garage-funded discount comes off the base, line by line', () => {
    expect(
      bookingCommission(
        booking({
          amount: '1600.00',
          subtotalAmount: '2000.00',
          discountFundedBy: 'vendor',
          items: [{ category: 'detailing', amount: '2000.00', sortOrder: 0 }],
        })
      )
    ).toBe(80)
    expect(
      bookingCommission(
        booking({
          amount: '900.00',
          subtotalAmount: '1000.00',
          discountFundedBy: 'vendor',
          items: [
            { category: 'car_wash', amount: '500.00', sortOrder: 0 },
            { category: 'coating', amount: '500.00', sortOrder: 1 },
          ],
        })
      )
    ).toBe(58.5) // 450 × 8% + 450 × 5%
  })

  test('a paid final bill at the inspected service rate', () => {
    expect(
      bookingCommission(
        booking({
          amount: '300.00',
          subtotalAmount: '300.00',
          items: [{ category: 'scratch_removal', amount: '300.00', pricingType: 'on_inspection', sortOrder: 0 }],
          billsPaid: '1200.00',
        })
      )
    ).toBe(75)
    expect(
      bookingCommission(
        booking({
          amount: '800.00',
          subtotalAmount: '800.00',
          items: [
            { category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0 },
            { category: 'scratch_removal', amount: '300.00', pricingType: 'on_inspection', sortOrder: 1 },
          ],
          billsPaid: '1000.00',
        })
      )
    ).toBe(105) // 40 + 15 + 50
  })

  test('paid extra work (0041) is charged like a final bill, at the main service rate', () => {
    // A ₹500 wash with ₹450 of extra work paid in the app: billsPaid is every
    // paid booking charge on the chain, final bill and extra work alike.
    expect(bookingCommission(booking({ billsPaid: '450.00' }))).toBe(76) // (500 + 450) × 8%
    expect(
      bookingCommission(
        booking({
          items: [
            { category: 'coating', amount: '300.00', pricingType: 'flat', sortOrder: 0 },
            { category: 'car_wash', amount: '200.00', pricingType: 'flat', sortOrder: 1 },
          ],
          billsPaid: '1000.00',
        })
      )
    ).toBe(81) // 15 + 16 + 1000 × 5% (the first item's coating)
  })

  test('to the paisa', () => {
    expect(
      bookingCommission(
        booking({
          amount: '499.00',
          subtotalAmount: '499.00',
          items: [{ category: 'car_wash', amount: '499.00', sortOrder: 0 }],
        })
      )
    ).toBe(39.92)
  })
})

describe('chainCommission', () => {
  test('nothing for the first 25, from the 26th on', () => {
    expect(chainCommission(booking(), 1)).toBe(0)
    expect(chainCommission(booking(), 25)).toBe(0)
    expect(chainCommission(booking(), 26)).toBe(40)
  })

  test('nothing on a booking the garage never received, or that earns it nothing', () => {
    expect(chainCommission(booking(), undefined)).toBe(0)
    expect(chainCommission(booking({ status: 'cancelled', paymentStatus: 'refunded' }), 30)).toBe(0)
    expect(chainCommission(booking({ status: 'in_progress' }), 30)).toBe(0)
  })

  test('a customer no-show past the free 25 is charged like the job it paid for', () => {
    expect(chainCommission(booking({ status: 'cancelled', noShow: 'customer' }), 30)).toBe(40)
  })
})

describe('garageCommissionStatus', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' }

  test('garages past 25 with the period’s commission; the rest with their free bookings used', () => {
    const busy = Array.from({ length: 27 }, (_, i) =>
      chain({
        vendorId: 'busy',
        vendorName: 'Busy Bay',
        bookedAt: new Date(START + i * DAY),
        bookedDay: i >= 25 ? '2026-10-05' : '2026-09-10',
      })
    )
    const quiet = Array.from({ length: 18 }, () => chain({ vendorId: 'quiet', vendorName: 'Quiet Wash' }))
    const unpaid = chain({
      vendorId: 'ghost',
      vendorName: 'Ghost Garage',
      status: 'cancelled',
      paymentStatus: 'pending',
    })

    const status = garageCommissionStatus([...busy, ...quiet, unpaid], [
      { rootId: busy[25].rootId, vendorId: 'busy', paid: true, commission: 40 },
      { rootId: busy[26].rootId, vendorId: 'busy', paid: true, commission: 39.92 },
      { rootId: 'x', vendorId: 'busy', paid: false, commission: 0 },
    ], range)

    expect(status.active).toEqual([
      { vendorId: 'busy', name: 'Busy Bay', bookings: 2, commission: 79.92, activeSince: '2026-10-05' },
    ])
    expect(status.free).toEqual([{ vendorId: 'quiet', name: 'Quiet Wash', used: 18, left: 7 }])
  })

  test('active since only when the 26th fell in the period', () => {
    const busy = Array.from({ length: 26 }, () => chain({ vendorId: 'old', bookedDay: '2026-08-01' }))
    const { active } = garageCommissionStatus(busy, [], range)
    expect(active[0]).toMatchObject({ vendorId: 'old', bookings: 0, commission: 0, activeSince: null })
  })

  test('exactly 25 is still the free period, with none left', () => {
    const full = Array.from({ length: 25 }, () => chain({ vendorId: 'full' }))
    expect(garageCommissionStatus(full, [], range).free).toEqual([
      { vendorId: 'full', name: 'Marina Auto Spa', used: 25, left: 0 },
    ])
  })
})
