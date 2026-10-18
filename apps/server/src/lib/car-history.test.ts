import { describe, expect, test } from 'bun:test'
import { amountPaidOf, buildCarHistory, categoriesOf, latestOfChains, type CarHistoryRow } from './car-history.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const NOW = IST('2026-10-18T12:00:00')

let seq = 0
function row(over: Partial<CarHistoryRow> = {}): CarHistoryRow {
  seq += 1
  const id = over.id ?? `b-${seq}`
  return {
    id,
    chainId: over.chainId ?? id,
    rescheduleCount: 0,
    createdAt: IST('2026-10-01T09:00:00'),
    status: 'completed',
    scheduledAt: IST('2026-10-02T10:00:00'),
    completedAt: IST('2026-10-02T11:00:00'),
    bookingType: 'dropin',
    vendorId: 'v-1',
    vendorName: 'Marina Auto Spa',
    items: [{ name: 'Exterior Wash', category: 'car_wash' }],
    packageCategories: [],
    payment: { amount: '499.00', status: 'paid', refundedAmount: null },
    chargesPaid: '0',
    photos: { before: 0, after: 0 },
    ...over,
  }
}

describe('reschedule chains are counted once', () => {
  test('the moved row is left out; the latest row stands for the booking', () => {
    const original = row({
      id: 'root',
      status: 'cancelled',
      scheduledAt: IST('2026-09-01T10:00:00'),
      completedAt: null,
      createdAt: IST('2026-08-30T09:00:00'),
    })
    const moved = row({
      id: 'moved',
      chainId: 'root',
      rescheduleCount: 1,
      createdAt: IST('2026-08-31T09:00:00'),
      scheduledAt: IST('2026-09-03T10:00:00'),
      completedAt: IST('2026-09-03T11:00:00'),
    })
    expect(latestOfChains([original, moved]).map((r) => r.id)).toEqual(['moved'])

    const history = buildCarHistory([original, moved], { now: NOW })
    expect(history.items.map((item) => item.bookingId)).toEqual(['moved'])
    expect(history.totals.washesTotal).toBe(1)
    // The payment copied onto the moved row is the same money, once.
    expect(history.totals.spentTotal).toBe('499.00')
    expect(history.cancelledCount).toBe(0)
  })

  test('a chain moved twice is still one entry', () => {
    const rows = [
      row({ id: 'a', status: 'cancelled', completedAt: null }),
      row({ id: 'b', chainId: 'a', rescheduleCount: 1, status: 'cancelled', completedAt: null }),
      row({ id: 'c', chainId: 'a', rescheduleCount: 2 }),
    ]
    expect(buildCarHistory(rows, { now: NOW }).items.map((i) => i.bookingId)).toEqual(['c'])
  })
})

describe('cancelled bookings are left out, and counted', () => {
  test('a cancelled chain, a no-show and a moved-then-cancelled chain', () => {
    const rows = [
      row({ id: 'done' }),
      row({ id: 'cancelled', status: 'cancelled', completedAt: null }),
      row({ id: 'x1', status: 'cancelled', completedAt: null }),
      row({ id: 'x2', chainId: 'x1', rescheduleCount: 1, status: 'cancelled', completedAt: null }),
    ]
    const history = buildCarHistory(rows, { now: NOW })
    expect(history.items.map((i) => i.bookingId)).toEqual(['done'])
    expect(history.cancelledCount).toBe(2)
  })

  test('jobs still to happen or under way are not history yet', () => {
    const rows = [
      row({ id: 'next', status: 'confirmed', completedAt: null, scheduledAt: IST('2026-10-20T10:00:00') }),
      row({ id: 'now', status: 'in_progress', completedAt: null }),
    ]
    const history = buildCarHistory(rows, { now: NOW })
    expect(history.items).toEqual([])
    expect(history.cancelledCount).toBe(0)
    expect(history.totals).toEqual({ washesThisYear: 0, spentThisYear: '0.00', washesTotal: 0, spentTotal: '0.00', since: null })
  })
})

describe('newest first, with totals', () => {
  const rows = [
    row({ id: 'old', completedAt: IST('2025-12-28T11:00:00'), scheduledAt: IST('2025-12-28T10:00:00') }),
    row({ id: 'mid', completedAt: IST('2026-03-10T11:00:00'), payment: { amount: '1200.50', status: 'paid', refundedAmount: null } }),
    row({ id: 'new', completedAt: IST('2026-10-02T11:00:00') }),
  ]

  test('newest first', () => {
    expect(buildCarHistory(rows, { now: NOW }).items.map((i) => i.bookingId)).toEqual(['new', 'mid', 'old'])
  })

  test('this year by the IST date, and all time', () => {
    const { totals } = buildCarHistory(rows, { now: NOW })
    expect(totals.washesThisYear).toBe(2)
    expect(totals.spentThisYear).toBe('1699.50')
    expect(totals.washesTotal).toBe(3)
    expect(totals.spentTotal).toBe('2198.50')
    expect(totals.since).toBe('2025-12-28')
  })

  test('a job finished at 00:30 IST on 1 Jan is this year, though UTC says last year', () => {
    const newYear = row({ completedAt: IST('2026-01-01T00:30:00') })
    expect(buildCarHistory([newYear], { now: NOW }).totals.washesThisYear).toBe(1)
  })
})

describe('amount paid', () => {
  test('the payment less its refunds, plus paid bills and extra work less theirs', () => {
    expect(amountPaidOf({ payment: { amount: '800.00', status: 'paid', refundedAmount: '100.00' }, chargesPaid: '350.00' })).toBe('1050.00')
  })

  test('a fully refunded payment is nothing', () => {
    expect(amountPaidOf({ payment: { amount: '800.00', status: 'refunded', refundedAmount: '800.00' }, chargesPaid: '0' })).toBe('0.00')
  })

  test('an unpaid or failed payment counts nothing; collected cash does', () => {
    expect(amountPaidOf({ payment: { amount: '800.00', status: 'pending', refundedAmount: null }, chargesPaid: '0' })).toBe('0.00')
    expect(amountPaidOf({ payment: { amount: '800.00', status: 'failed', refundedAmount: null }, chargesPaid: '0' })).toBe('0.00')
    expect(amountPaidOf({ payment: { amount: '650.00', status: 'collected', refundedAmount: null }, chargesPaid: '0' })).toBe('650.00')
    expect(amountPaidOf({ payment: null, chargesPaid: '0' })).toBe('0.00')
  })

  test('paise are exact', () => {
    const rows = [row({ payment: { amount: '0.10', status: 'paid', refundedAmount: null } }), row({ payment: { amount: '0.20', status: 'paid', refundedAmount: null } })]
    expect(buildCarHistory(rows, { now: NOW }).totals.spentTotal).toBe('0.30')
  })

  test('receipt only once a payment went through', () => {
    const history = buildCarHistory(
      [row({ id: 'paid' }), row({ id: 'unpaid', payment: { amount: '0', status: 'pending', refundedAmount: null } })],
      { now: NOW }
    )
    expect(Object.fromEntries(history.items.map((i) => [i.bookingId, i.receiptAvailable]))).toEqual({ paid: true, unpaid: false })
  })
})

describe('filter by service type', () => {
  const rows = [
    row({ id: 'wash' }),
    row({ id: 'coat', items: [{ name: 'Ceramic Coating', category: 'coating' }] }),
    row({
      id: 'pack',
      items: [{ name: 'Monsoon Pack', category: 'package' }],
      packageCategories: ['car_wash', 'detailing'],
    }),
  ]

  test('a package stands for its members too', () => {
    expect(categoriesOf(rows[2])).toEqual(['car_wash', 'detailing', 'package'])
  })

  test('the chips list the categories present, in order', () => {
    expect(buildCarHistory(rows, { now: NOW }).categories).toEqual(['car_wash', 'detailing', 'coating', 'package'])
  })

  test('filtered items and totals; the chips stay', () => {
    const coating = buildCarHistory(rows, { now: NOW, category: 'coating' })
    expect(coating.items.map((i) => i.bookingId)).toEqual(['coat'])
    expect(coating.totals.washesTotal).toBe(1)
    expect(coating.categories).toHaveLength(4)

    const washes = buildCarHistory(rows, { now: NOW, category: 'car_wash' })
    expect(washes.items.map((i) => i.bookingId).sort()).toEqual(['pack', 'wash'])
  })
})
