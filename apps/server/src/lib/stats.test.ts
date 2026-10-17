import { describe, expect, test } from 'bun:test'
import {
  bookingsPerDay,
  busyHoursGrid,
  collectedPaise,
  collectedPerPeriod,
  commissionByChain,
  itemsByChain,
  outcomeOf,
  previousRange,
  rangeDays,
  rangeInstants,
  summariseFunnel,
  summariseGarages,
  summariseKpis,
  summariseServiceTypes,
  type StatsChainRow,
  type StatsItemRow,
} from './stats.js'

let nextId = 0
const row = (overrides: Partial<StatsChainRow> = {}): StatsChainRow => ({
  rootId: `r${++nextId}`,
  vendorId: 'marina',
  vendorName: 'Marina Auto Spa',
  bookedDay: '2026-10-05',
  status: 'completed',
  noShow: null,
  acceptedBy: 'u1',
  paymentStatus: 'paid',
  paymentAmount: '500.00',
  paymentRefunded: '0.00',
  amount: '500.00',
  subtotalAmount: '500.00',
  discountFundedBy: null,
  billsPaid: null,
  refundsRecorded: null,
  markedTest: false,
  ...overrides,
})

const item = (rootId: string, overrides: Partial<StatsItemRow> = {}): StatsItemRow => ({
  rootId,
  category: 'car_wash',
  amount: '500.00',
  pricingType: 'flat',
  sortOrder: 0,
  ...overrides,
})

const NO_CHECKOUTS = { pending: 0, failed: 0 }

describe('ranges', () => {
  test('both ends count, in India days', () => {
    expect(rangeDays({ from: '2026-09-17', to: '2026-10-16' })).toBe(30)
    const { start, end } = rangeInstants({ from: '2026-10-01', to: '2026-10-01' })
    // Midnight IST is 18:30 UTC the evening before.
    expect(start.toISOString()).toBe('2026-09-30T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-10-01T18:30:00.000Z')
  })

  test('compared with the same number of days just before', () => {
    expect(previousRange({ from: '2026-09-17', to: '2026-10-16' })).toEqual({
      from: '2026-08-18',
      to: '2026-09-16',
    })
    // This month so far: the 16 days before it, not a whole month.
    expect(previousRange({ from: '2026-10-01', to: '2026-10-16' })).toEqual({
      from: '2026-09-15',
      to: '2026-09-30',
    })
  })

  test('a whole month is compared with the month before', () => {
    expect(previousRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(previousRange({ from: '2027-01-01', to: '2027-01-31' })).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
  })
})

describe('collectedPaise', () => {
  test('the payment, plus paid bills, less recorded refunds', () => {
    expect(collectedPaise(row({ billsPaid: '1200.00' }))).toBe(170_000)
    expect(collectedPaise(row({ refundsRecorded: '200.00' }))).toBe(30_000)
  })

  test('a full refund leaves nothing; a payment that never landed counts nothing', () => {
    expect(collectedPaise(row({ paymentStatus: 'refunded', refundsRecorded: '500.00' }))).toBe(0)
    expect(collectedPaise(row({ paymentStatus: 'pending' }))).toBe(0)
    expect(collectedPaise(row({ paymentStatus: 'failed' }))).toBe(0)
  })

  test('cash collected counts like a payment', () => {
    expect(collectedPaise(row({ paymentStatus: 'collected' }))).toBe(50_000)
  })

  test('a refund owed but not yet recorded is still collected', () => {
    expect(collectedPaise(row({ status: 'cancelled' }))).toBe(50_000)
  })
})

describe('outcomeOf', () => {
  test('a no-show is its own outcome, not a cancellation', () => {
    expect(outcomeOf({ status: 'cancelled', noShow: 'customer' })).toBe('no_show')
    expect(outcomeOf({ status: 'cancelled', noShow: null })).toBe('cancelled')
    expect(outcomeOf({ status: 'completed', noShow: null })).toBe('completed')
    expect(outcomeOf({ status: 'confirmed', noShow: null })).toBe('not_done')
    expect(outcomeOf({ status: 'pending', noShow: null })).toBe('not_done')
  })
})

describe('summariseKpis', () => {
  test('the tiles, from fixed rows', () => {
    const rows = [
      row(), // 500
      row({ billsPaid: '1200.00' }), // 1700
      row({ status: 'cancelled', paymentStatus: 'refunded', refundsRecorded: '500.00' }), // 0, cancelled
      row({ status: 'cancelled', noShow: 'customer' }), // 500, a no-show
      row({ status: 'confirmed', paymentStatus: 'pending' }), // started, never paid
    ]
    const commission = new Map([[rows[1].rootId, 136]])
    expect(summariseKpis(rows, { pending: 2, failed: 1 }, commission)).toEqual({
      bookings: 4,
      collected: 2700,
      commission: 136,
      averageBooking: 675,
      checkoutsStarted: 8,
      paidOfStarted: 0.5,
      cancelled: 1,
      cancellationRate: 0.25,
    })
  })

  test('test bookings are left out of every figure', () => {
    const rows = [row(), row({ markedTest: true, billsPaid: '900.00' })]
    const commission = new Map([[rows[1].rootId, 72]])
    expect(summariseKpis(rows, NO_CHECKOUTS, commission)).toMatchObject({
      bookings: 1,
      collected: 500,
      commission: 0,
      checkoutsStarted: 1,
    })
  })

  test('nothing to divide by is null, not zero', () => {
    expect(summariseKpis([], NO_CHECKOUTS, new Map())).toEqual({
      bookings: 0,
      collected: 0,
      commission: 0,
      averageBooking: null,
      checkoutsStarted: 0,
      paidOfStarted: null,
      cancelled: 0,
      cancellationRate: null,
    })
  })
})

describe('bookingsPerDay', () => {
  test('every day present, zeros included; days outside the range ignored', () => {
    const rows = [
      row({ bookedDay: '2026-10-02' }),
      row({ bookedDay: '2026-10-02' }),
      row({ bookedDay: '2026-10-03', paymentStatus: 'pending' }),
      row({ bookedDay: '2026-09-30' }),
      row({ bookedDay: '2026-10-03', markedTest: true }),
    ]
    expect(bookingsPerDay(rows, { from: '2026-10-01', to: '2026-10-03' })).toEqual([
      { date: '2026-10-01', bookings: 0 },
      { date: '2026-10-02', bookings: 2 },
      { date: '2026-10-03', bookings: 0 },
    ])
  })
})

describe('collectedPerPeriod', () => {
  test('weeks start on Monday, and part weeks say so', () => {
    // Thu 17 Sep to Fri 16 Oct 2026.
    const rows = [
      row({ bookedDay: '2026-09-17' }),
      row({ bookedDay: '2026-09-21', billsPaid: '100.00' }),
      row({ bookedDay: '2026-09-27' }),
      row({ bookedDay: '2026-10-16' }),
    ]
    const { unit, bars } = collectedPerPeriod(rows, { from: '2026-09-17', to: '2026-10-16' })
    expect(unit).toBe('week')
    expect(bars).toEqual([
      { start: '2026-09-17', end: '2026-09-20', days: 4, full: false, collected: 500 },
      { start: '2026-09-21', end: '2026-09-27', days: 7, full: true, collected: 1100 },
      { start: '2026-09-28', end: '2026-10-04', days: 7, full: true, collected: 0 },
      { start: '2026-10-05', end: '2026-10-11', days: 7, full: true, collected: 0 },
      { start: '2026-10-12', end: '2026-10-16', days: 5, full: false, collected: 500 },
    ])
  })

  test('a long range goes by calendar month', () => {
    const rows = [row({ bookedDay: '2026-02-14' }), row({ bookedDay: '2026-02-28' })]
    const { unit, bars } = collectedPerPeriod(rows, { from: '2026-01-15', to: '2026-12-31' })
    expect(unit).toBe('month')
    expect(bars).toHaveLength(12)
    expect(bars[0]).toEqual({ start: '2026-01-15', end: '2026-01-31', days: 17, full: false, collected: 0 })
    expect(bars[1]).toEqual({ start: '2026-02-01', end: '2026-02-28', days: 28, full: true, collected: 1000 })
  })
})

describe('summariseFunnel', () => {
  test('from checkout to a finished job, with where the rest went', () => {
    const rows = [
      row(),
      row(),
      row({ status: 'cancelled', paymentStatus: 'refunded' }),
      row({ status: 'cancelled', noShow: 'garage' }),
      row({ status: 'confirmed' }),
      row({ status: 'cancelled', paymentStatus: 'pending' }),
      row({ markedTest: true }),
    ]
    expect(summariseFunnel(rows, { pending: 3, failed: 1 })).toEqual({
      checkoutsStarted: 10,
      paid: 5,
      completed: 2,
      leftWithoutPaying: 4,
      paidNoBooking: 1,
      cancelled: 1,
      noShows: 1,
      notDone: 1,
      paidOfStarted: 0.5,
      completedOfPaid: 0.4,
    })
  })
})

describe('summariseGarages', () => {
  test('most collected first, with the rating to one decimal', () => {
    const rows = [
      row({ vendorId: 'a', vendorName: 'Alpha' }),
      row({ vendorId: 'b', vendorName: 'Bravo', billsPaid: '700.00' }),
      row({ vendorId: 'a', vendorName: 'Alpha' }),
      row({ vendorId: 'c', vendorName: 'Charlie', paymentStatus: 'pending' }),
    ]
    const ratings = new Map([['a', { average: 4.666, count: 3 }]])
    expect(summariseGarages(rows, ratings)).toEqual([
      { vendorId: 'b', name: 'Bravo', bookings: 1, collected: 1200, rating: null, reviews: 0, notAcceptedInTime: 0 },
      { vendorId: 'a', name: 'Alpha', bookings: 2, collected: 1000, rating: 4.7, reviews: 3, notAcceptedInTime: 0 },
    ])
  })

  test('counts the bookings each garage did not accept in time, among its cancellations (0042)', () => {
    const missed = { status: 'cancelled', acceptedBy: null, responseMissed: true }
    const rows = [
      row({ vendorId: 'a', vendorName: 'Alpha', ...missed }),
      row({ vendorId: 'a', vendorName: 'Alpha', ...missed }),
      row({ vendorId: 'a', vendorName: 'Alpha' }),
      // A garage's own Reject is a decline, not a missed answer.
      row({ vendorId: 'b', vendorName: 'Bravo', status: 'cancelled', acceptedBy: null }),
      row({ vendorId: 'a', vendorName: 'Alpha', ...missed, markedTest: true }),
    ]
    const garages = summariseGarages(rows, new Map())
    expect(garages.find((g) => g.vendorId === 'a')?.notAcceptedInTime).toBe(2)
    expect(garages.find((g) => g.vendorId === 'b')?.notAcceptedInTime).toBe(0)
    expect(summariseFunnel(rows, { pending: 0, failed: 0 }).cancelled).toBe(3)
  })
})

describe('summariseServiceTypes', () => {
  test('a mixed booking counts under both types, its money split by price', () => {
    const wash = row()
    const mixed = row({ paymentAmount: '2000.00', amount: '2000.00', subtotalAmount: '2000.00' })
    const items = itemsByChain([
      item(wash.rootId),
      item(mixed.rootId, { amount: '500.00' }),
      item(mixed.rootId, { category: 'detailing', amount: '1500.00', sortOrder: 1 }),
    ])
    const types = summariseServiceTypes([wash, mixed], items)
    expect(types.slice(0, 2)).toEqual([
      { category: 'detailing', bookings: 1, collected: 1500 },
      { category: 'car_wash', bookings: 2, collected: 1000 },
    ])
    // Every type is listed, and the money adds up exactly.
    expect(types).toHaveLength(6)
    expect(types.reduce((sum, t) => sum + t.collected, 0)).toBe(2500)
  })

  test('the rounding paise land on the last line', () => {
    const odd = row({ paymentAmount: '100.00' })
    const items = itemsByChain([
      item(odd.rootId, { amount: '1.00' }),
      item(odd.rootId, { category: 'coating', amount: '1.00', sortOrder: 1 }),
      item(odd.rootId, { category: 'others', amount: '1.00', sortOrder: 2 }),
    ])
    const types = summariseServiceTypes([odd], items)
    const byType = Object.fromEntries(types.map((t) => [t.category, t.collected]))
    expect(byType.car_wash).toBe(33.33)
    expect(byType.coating).toBe(33.33)
    expect(byType.others).toBe(33.34)
  })
})

describe('commissionByChain', () => {
  test('each chain at its place in the queue', () => {
    const free = row()
    const charged = row()
    const items = itemsByChain([item(free.rootId), item(charged.rootId)])
    const commission = commissionByChain([free, charged], items, new Map([
      [free.rootId, 25],
      [charged.rootId, 26],
    ]))
    expect(commission.get(free.rootId)).toBe(0)
    expect(commission.get(charged.rootId)).toBe(40)
  })
})

describe('busyHoursGrid', () => {
  test('every weekday by every hour from 7 AM to 9 PM, zeros included', () => {
    const grid = busyHoursGrid([
      { weekday: 6, hour: 10, bookings: 3 },
      { weekday: 1, hour: 9, bookings: 1 },
    ])
    expect(grid.firstHour).toBe(7)
    expect(grid.lastHour).toBe(21)
    expect(grid.cells).toHaveLength(7 * 15)
    expect(grid.total).toBe(4)
    expect(grid.cells.find((c) => c.weekday === 6 && c.hour === 10)?.bookings).toBe(3)
    expect(grid.cells.find((c) => c.weekday === 2 && c.hour === 10)?.bookings).toBe(0)
  })

  test('wider when a slot falls outside those hours', () => {
    const grid = busyHoursGrid([{ weekday: 3, hour: 6, bookings: 1 }])
    expect(grid.firstHour).toBe(6)
    expect(grid.cells).toHaveLength(7 * 16)
  })
})
