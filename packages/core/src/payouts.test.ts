import { describe, expect, test } from 'bun:test'
import type { PayoutLine } from './api/admin'
import {
  commissionLabel,
  earningsRange,
  istDateLabel,
  percentLabel,
  rupeesLabel,
  statementCsvRows,
  waitedLabel,
} from './payouts'

const line = (overrides: Partial<PayoutLine> = {}): PayoutLine => ({
  bookingId: 'e2e00000-0000-4000-8000-000000000001',
  reference: 'E2E00000',
  payableFrom: '2026-10-16T06:00:00.000Z',
  scheduledAt: '2026-10-16T04:30:00.000Z',
  customerFirstName: 'Bhavana',
  services: ['Express Wash'],
  bookingType: 'dropin',
  kind: 'job',
  price: 500,
  detlioPromo: 0,
  garagePromo: 0,
  refunds: 0,
  commission: { rates: [0.08], amount: 40, freePosition: null, freeOf: 25 },
  share: 460,
  heldByGarage: 0,
  due: 460,
  paid: 0,
  balance: 460,
  status: 'due',
  payouts: [],
  ...overrides,
})

describe('commissionLabel', () => {
  test('the rate and the amount', () => {
    expect(commissionLabel(line())).toBe('8% · ₹40')
    expect(
      commissionLabel(line({ commission: { rates: [0.08, 0.05], amount: 140, freePosition: null, freeOf: 25 } }))
    ).toBe('8% + 5% · ₹140')
  })

  test('inside the free 25 it says which booking it was', () => {
    const free = line({ commission: { rates: [], amount: 0, freePosition: 12, freeOf: 25 } })
    expect(commissionLabel(free)).toBe('Free — booking 12 of your first 25')
    expect(commissionLabel(free, 'admin')).toBe('Free — booking 12 of its first 25')
  })
})

describe('money and dates', () => {
  test('rupees, with paise only when there are some, and a minus sign', () => {
    expect(rupeesLabel(1234)).toBe('₹1,234')
    expect(rupeesLabel(1234.5)).toBe('₹1,234.50')
    expect(rupeesLabel(-40)).toBe('−₹40')
    expect(percentLabel(0.05)).toBe('5%')
  })

  test('IST dates', () => {
    expect(istDateLabel('2026-10-16T20:00:00.000Z')).toBe('17 Oct 2026')
  })

  test('the quick ranges, in IST', () => {
    const now = new Date('2026-10-17T05:00:00.000Z')
    expect(earningsRange('last30', now)).toEqual({ from: '2026-09-18', to: '2026-10-17' })
    expect(earningsRange('thisMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-17' })
    expect(earningsRange('lastMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(earningsRange('lastMonth', new Date('2026-01-10T05:00:00.000Z'))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
  })

  test('how long the oldest has waited', () => {
    const now = new Date('2026-10-17T06:00:00.000Z')
    expect(waitedLabel('2026-10-16T23:00:00.000Z', now)).toBe('7 h')
    expect(waitedLabel('2026-10-14T06:00:00.000Z', now)).toBe('3 days')
  })
})

describe('statementCsvRows', () => {
  test('one row a booking, with its payout references', () => {
    const { header, rows } = statementCsvRows([
      line({ status: 'paid', paid: 460, balance: 0, payouts: [{ payoutId: 'p', reference: 'UTR1', paidAt: '', amount: 460 }] }),
    ])
    expect(header[0]).toBe('Booking')
    expect(rows[0][0]).toBe('#E2E00000')
    expect(rows[0][15]).toBe('Paid')
    expect(rows[0][16]).toBe('UTR1')
    expect(rows[0]).toHaveLength(header.length)
  })
})
