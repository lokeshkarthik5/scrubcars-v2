import { describe, expect, test } from 'bun:test'
import type { AdminCouponBatch, CouponFigures } from '@repo/core/api/coupons'
import {
  batchStage,
  byLocation,
  codesCsv,
  codesToPrint,
  printDate,
  rate,
  redemptionsCsv,
  scannedFigure,
  sheetPages,
  wholeOrNull,
} from './coupons'

const figures = (overrides: Partial<CouponFigures> = {}): CouponFigures => ({
  codes: 100,
  scannedCodes: 40,
  scans: 55,
  voidedCodes: 0,
  redeemed: 20,
  cancelled: 0,
  stampsGiven: 0,
  usedAtCheckout: 12,
  bookings: 10,
  revenue: '4990.00',
  cost: '1000.00',
  newCustomers: 6,
  ...overrides,
})

const batch = (
  overrides: Partial<AdminCouponBatch> = {}
): AdminCouponBatch => ({
  id: 'b1',
  name: 'Anna Nagar flyer',
  location: 'Anna Nagar',
  kind: 'unique',
  reward: 'amount',
  title: '₹100 off',
  conditions: [],
  offAmount: 100,
  offPercent: null,
  stamps: null,
  validFrom: '',
  validUntil: '',
  amountOff: '100.00',
  percentOff: null,
  maxDiscount: null,
  minOrder: null,
  serviceCategory: null,
  vendor: null,
  newCustomersOnly: false,
  validFromDate: '2026-11-01',
  validToDate: '2026-11-30',
  codeCount: 100,
  maxRedemptions: null,
  createdBy: 'Asha',
  createdAt: '',
  voided: null,
  canReprint: true,
  figures: figures(),
  ...overrides,
})

describe('coupon batches in the panel', () => {
  test('stage by IST date, void first', () => {
    expect(batchStage(batch(), '2026-10-31')).toBe('scheduled')
    expect(batchStage(batch(), '2026-11-01')).toBe('running')
    expect(batchStage(batch(), '2026-11-30')).toBe('running')
    expect(batchStage(batch(), '2026-12-01')).toBe('ended')
    expect(
      batchStage(
        batch({ voided: { at: '', by: 'Asha', reason: 'Leaked' } }),
        '2026-11-10'
      )
    ).toBe('void')
  })

  test('scanned is codes opened for unique batches, opens for a shared code', () => {
    expect(scannedFigure(batch())).toBe(40)
    expect(scannedFigure(batch({ kind: 'shared', codeCount: 1 }))).toBe(55)
    expect(rate(20, 100)).toBe('20%')
    expect(rate(1, 0)).toBe('—')
  })

  test('by location: case and spaces ignored, most bookings first', () => {
    const rows = byLocation([
      batch({ id: 'a', location: 'Anna Nagar' }),
      batch({
        id: 'b',
        location: ' anna nagar ',
        figures: figures({ bookings: 5, revenue: '1000.00' }),
      }),
      batch({
        id: 'c',
        location: 'Marina Auto Spa counter',
        kind: 'shared',
        codeCount: 1,
        figures: figures({ bookings: 30 }),
      }),
    ])
    expect(rows.map((r) => r.location)).toEqual([
      'Marina Auto Spa counter',
      'Anna Nagar',
    ])
    expect(rows[1]).toMatchObject({
      batches: 2,
      printed: 200,
      scanned: 80,
      bookings: 15,
      revenue: 5990,
      newCustomers: 12,
    })
    expect(rows[0]).toMatchObject({ printed: 1, scanned: 55 })
  })

  test('the CSVs: codes for the print shop, redemptions with masked phones', () => {
    const csv = codesCsv(batch(), [
      {
        seq: 1,
        code: 'DTL-7K4QM-92MXA',
        link: 'https://detlio.com/c/7K4QM92MXA',
        scans: 0,
        state: 'new',
      },
    ])
    expect(csv).toContain(
      'DTL-7K4QM-92MXA,https://detlio.com/c/7K4QM92MXA,₹100 off,2026-11-30,Not scanned,0'
    )
    const r = redemptionsCsv(batch(), [
      {
        id: 'r1',
        addedAt: '2026-11-02T10:00:00Z',
        channel: 'link',
        kind: 'voucher',
        stamps: null,
        codeSuffix: '2MXA',
        customer: { id: 'u1', name: 'Meena', phone: '••••••4321' },
        state: 'used',
        cancelledBy: null,
        booking: {
          id: 'abcdef12-0000',
          amount: '399.00',
          discount: '100.00',
          at: '',
        },
      },
    ])
    expect(r).toContain(
      '2026-11-02,Anna Nagar flyer,Anna Nagar,QR link,2MXA,Meena,••••••4321,Used,abcdef12,399.00,100.00'
    )
  })

  test('sheet pages of ten; typed numbers', () => {
    expect(
      sheetPages(Array.from({ length: 23 }, (_, i) => i)).map((p) => p.length)
    ).toEqual([10, 10, 3])
    expect(wholeOrNull('')).toBeNull()
    expect(wholeOrNull('₹1,500')).toBe(1500)
    expect(Number.isNaN(wholeOrNull('12.5'))).toBe(true)
  })

  test('the sheet: dates as printed; never a void code, added ones only when asked', () => {
    expect(printDate('2026-11-30')).toBe('30 Nov 2026')
    const codes = [
      { state: 'new' as const },
      { state: 'scanned' as const },
      { state: 'redeemed' as const },
      { state: 'void' as const },
    ]
    expect(codesToPrint(codes, false).map((c) => c.state)).toEqual([
      'new',
      'scanned',
    ])
    expect(codesToPrint(codes, true).map((c) => c.state)).toEqual([
      'new',
      'scanned',
      'redeemed',
    ])
  })
})
