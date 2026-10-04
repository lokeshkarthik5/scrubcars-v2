import { describe, expect, test } from 'bun:test'
import {
  FINAL_BILL_WINDOW_DAYS,
  finalBillFigures,
  finalBillMayChange,
  finalBillStatusLabel,
  formatRupees,
  formatStepTime,
  jobStepTimes,
} from './job-records'

// 5 Oct 2026, 15:30 IST.
const NOW = new Date('2026-10-05T10:00:00Z').getTime()

describe('formatStepTime', () => {
  test('a time today is just the clock, in Chennai time', () => {
    expect(formatStepTime('2026-10-05T05:12:00Z', NOW)).toBe('10:42 am')
  })

  test('another day carries the date', () => {
    expect(formatStepTime('2026-10-04T05:12:00Z', NOW)).toBe('4 Oct, 10:42 am')
  })

  test('the day is the IST day, not UTC: 20:00 UTC on the 4th is the 5th in Chennai', () => {
    expect(formatStepTime('2026-10-04T20:00:00Z', NOW)).toBe('1:30 am')
  })

  test('nothing for a bad value', () => {
    expect(formatStepTime('not a date', NOW)).toBe('')
  })
})

describe('jobStepTimes', () => {
  test('lists only the steps that have a time', () => {
    expect(
      jobStepTimes(
        { acceptedAtIso: '2026-10-05T03:45:00Z', startedAtIso: '2026-10-05T05:12:00Z' },
        NOW
      )
    ).toEqual(['Accepted 9:15 am', 'Started 10:42 am'])
    expect(jobStepTimes({}, NOW)).toEqual([])
  })
})

describe('finalBillFigures', () => {
  test('a live total and what is left after the inspection fee', () => {
    expect(finalBillFigures([2200, '300.50'], 299)).toEqual({ total: 2500.5, amountDue: 2201.5 })
  })

  test('nothing left when the bill is no more than was paid', () => {
    expect(finalBillFigures([150], 299)).toEqual({ total: 150, amountDue: 0 })
  })

  test('a half-typed line counts as nothing', () => {
    expect(finalBillFigures(['', 'abc', -10, 100], 0)).toEqual({ total: 100, amountDue: 100 })
  })

  test('in paise, so 0.1 + 0.2 is 0.3', () => {
    expect(finalBillFigures([0.1, 0.2], 0).total).toBe(0.3)
  })
})

describe('labels', () => {
  test('rupees keep paise only when there are some', () => {
    expect(formatRupees(2201)).toBe('₹2,201')
    expect(formatRupees(2201.5)).toBe('₹2,201.50')
  })

  test('bill states', () => {
    expect(finalBillStatusLabel('not_needed')).toBe('Nothing due')
    expect(finalBillStatusLabel('due')).toBe('Due')
  })
})

describe('finalBillMayChange', () => {
  const DAY = 24 * 60 * 60 * 1000
  const completed = {
    status: 'completed',
    items: [{ pricingType: 'flat' }, { pricingType: 'on_inspection' }],
    finalBill: null,
    completedAtIso: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    scheduledAtIso: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
  }

  test('a finished inspection job can still get its bill for the window', () => {
    expect(finalBillMayChange(completed, NOW)).toBe(true)
    expect(
      finalBillMayChange(
        { ...completed, completedAtIso: new Date(NOW - FINAL_BILL_WINDOW_DAYS * DAY - 60_000).toISOString() },
        NOW
      )
    ).toBe(false)
  })

  test('a bill with nothing due can still be replaced in the window', () => {
    expect(finalBillMayChange({ ...completed, finalBill: { status: 'not_needed' } }, NOW)).toBe(true)
  })

  test('a due bill is watched until it is paid, whenever the job finished', () => {
    const old = { ...completed, completedAtIso: new Date(NOW - 10 * DAY).toISOString() }
    expect(finalBillMayChange({ ...old, finalBill: { status: 'due' } }, NOW)).toBe(true)
    expect(finalBillMayChange({ ...old, finalBill: { status: 'paid' } }, NOW)).toBe(false)
  })

  test('a flat-priced job never gets a bill', () => {
    expect(finalBillMayChange({ ...completed, items: [{ pricingType: 'flat' }] }, NOW)).toBe(false)
  })

  test('a cancelled booking is not watched', () => {
    expect(finalBillMayChange({ ...completed, status: 'cancelled', finalBill: { status: 'due' } }, NOW)).toBe(
      false
    )
  })
})
