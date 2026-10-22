import { describe, expect, test } from 'bun:test'
import {
  EXTRA_WORK_MAX_OPEN,
  completionBlockedByExtraWork,
  extraWorkOf,
  extraWorkPayable,
  extraWorkRefusal,
  extraWorkState,
  extraWorkViews,
  openExtraWork,
  toExtraWorkView,
  type ExtraWorkRecord,
} from './extra-work.js'

const charge = (overrides: Partial<ExtraWorkRecord> = {}): ExtraWorkRecord => ({
  id: 'x1',
  kind: 'extra_work',
  status: 'due',
  lines: [{ description: 'Replace front wiper blades', amount: '450.00' }],
  amountDue: '450.00',
  note: 'Both blades are torn',
  photos: [{ storageKey: 'vendors/v/job-photos/b/1.jpg', url: 'https://cdn.example/1.jpg' }],
  paidAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: new Date('2026-10-16T05:00:00.000Z'),
  ...overrides,
})

describe('extraWorkRefusal', () => {
  test('on an accepted or under-way job without an inspection service', () => {
    for (const status of ['confirmed', 'in_progress']) {
      expect(extraWorkRefusal({ status, pricingTypes: ['flat'], openCount: 0 })).toBeNull()
    }
  })

  test('never on an inspection job: its final bill covers it', () => {
    expect(
      extraWorkRefusal({ status: 'in_progress', pricingTypes: ['flat', 'on_inspection'], openCount: 0 })
    ).toBe('on_inspection')
  })

  test('not before the garage accepts, nor once it is done, cancelled or moved', () => {
    for (const status of ['pending', 'completed', 'cancelled', 'rescheduled']) {
      expect(extraWorkRefusal({ status, pricingTypes: ['flat'], openCount: 0 })).toBe('not_open')
    }
  })

  test(`at most ${EXTRA_WORK_MAX_OPEN} waiting for the customer at once`, () => {
    expect(extraWorkRefusal({ status: 'in_progress', pricingTypes: [], openCount: EXTRA_WORK_MAX_OPEN - 1 })).toBeNull()
    expect(extraWorkRefusal({ status: 'in_progress', pricingTypes: [], openCount: EXTRA_WORK_MAX_OPEN })).toBe(
      'too_many_open'
    )
  })
})

describe('what waits, and what it blocks', () => {
  const charges = [
    charge({ id: 'a' }),
    charge({ id: 'b', status: 'paid', paidAt: new Date() }),
    charge({ id: 'c', status: 'cancelled', cancelReason: 'declined' }),
    { ...charge({ id: 'bill' }), kind: 'final_bill' },
  ]

  test('only extra work still due is open; a final bill due is not extra work', () => {
    expect(openExtraWork(charges).map((c) => c.id)).toEqual(['a'])
    expect(extraWorkOf(charges).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  test('the job cannot be completed while extra work waits for the customer', () => {
    expect(completionBlockedByExtraWork(charges)).toBe(true)
    expect(completionBlockedByExtraWork(charges.filter((c) => c.id !== 'a'))).toBe(false)
    expect(completionBlockedByExtraWork(null)).toBe(false)
  })

  test('paid (or declined) only while the job is on', () => {
    expect(extraWorkPayable('confirmed')).toBe(true)
    expect(extraWorkPayable('in_progress')).toBe(true)
    expect(extraWorkPayable('completed')).toBe(false)
    expect(extraWorkPayable('cancelled')).toBe(false)
  })
})

describe('toExtraWorkView', () => {
  test('what, how much, the photos and where it stands; never the storage key', () => {
    expect(toExtraWorkView(charge())).toEqual({
      id: 'x1',
      description: 'Replace front wiper blades',
      amount: '450.00',
      note: 'Both blades are torn',
      photos: [{ url: 'https://cdn.example/1.jpg' }],
      state: 'awaiting',
      paidAt: null,
      cancelledAt: null,
      createdAt: '2026-10-16T05:00:00.000Z',
    })
  })

  test('states: awaiting, paid, declined, withdrawn, or closed with its booking', () => {
    expect(extraWorkState({ status: 'due' })).toBe('awaiting')
    expect(extraWorkState({ status: 'paid' })).toBe('paid')
    expect(extraWorkState({ status: 'cancelled', cancelReason: 'declined' })).toBe('declined')
    expect(extraWorkState({ status: 'cancelled', cancelReason: 'withdrawn' })).toBe('withdrawn')
    expect(extraWorkState({ status: 'cancelled', cancelReason: 'booking_closed' })).toBe('closed')
    expect(extraWorkState({ status: 'cancelled', cancelReason: null })).toBe('closed')
  })

  test('newest first, extra work only', () => {
    const views = extraWorkViews([
      charge({ id: 'old', createdAt: new Date('2026-10-16T04:00:00.000Z') }),
      { ...charge({ id: 'bill' }), kind: 'final_bill' },
      charge({ id: 'new', createdAt: new Date('2026-10-16T06:00:00.000Z') }),
    ])
    expect(views.map((v) => v.id)).toEqual(['new', 'old'])
  })
})
