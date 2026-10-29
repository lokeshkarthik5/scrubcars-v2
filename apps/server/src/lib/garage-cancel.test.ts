import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  GARAGE_CANCEL_REFUSAL_WORDS,
  GARAGE_CANCEL_RULES,
  garageCancelRefusal,
  isLateGarageCancel,
  lateGarageCancelSql,
} from './garage-cancel.js'

const HOUR = 60 * 60 * 1000
const slot = new Date('2026-11-02T04:30:00Z')

describe('garageCancelRefusal: only an accepted job that has not started', () => {
  test('confirmed and not started: the garage may cancel', () => {
    expect(garageCancelRefusal({ status: 'confirmed', bookingType: 'dropin', pickedUpAt: null })).toBeNull()
    expect(garageCancelRefusal({ status: 'confirmed', bookingType: 'pickup', pickedUpAt: null })).toBeNull()
  })

  test('pending is a Reject, not a cancel', () => {
    expect(garageCancelRefusal({ status: 'pending', bookingType: 'dropin', pickedUpAt: null })).toBe('not_accepted')
  })

  test('started, finished or cancelled already: no', () => {
    expect(garageCancelRefusal({ status: 'in_progress', bookingType: 'dropin', pickedUpAt: null })).toBe('started')
    expect(garageCancelRefusal({ status: 'completed', bookingType: 'dropin', pickedUpAt: null })).toBe('finished')
    expect(garageCancelRefusal({ status: 'cancelled', bookingType: 'dropin', pickedUpAt: null })).toBe('finished')
  })

  test('pickup & drop with the car collected: bring it back first', () => {
    expect(garageCancelRefusal({ status: 'confirmed', bookingType: 'pickup', pickedUpAt: new Date() })).toBe('car_collected')
    expect(GARAGE_CANCEL_REFUSAL_WORDS.car_collected.code).toBe('CAR_WITH_GARAGE')
  })
})

describe('isLateGarageCancel: the counting rule', () => {
  test('within 24 hours of the slot counts as a missed booking', () => {
    expect(GARAGE_CANCEL_RULES.lateWindowHours).toBe(24)
    expect(isLateGarageCancel(slot, new Date(slot.getTime() - 23 * HOUR))).toBe(true)
    expect(isLateGarageCancel(slot, new Date(slot.getTime() - 24 * HOUR + 1))).toBe(true)
    // After the start, not yet begun: as late as it gets.
    expect(isLateGarageCancel(slot, new Date(slot.getTime() + HOUR))).toBe(true)
  })

  test('24 hours or more before counts like a decline', () => {
    expect(isLateGarageCancel(slot, new Date(slot.getTime() - 24 * HOUR))).toBe(false)
    expect(isLateGarageCancel(slot, new Date(slot.getTime() - 72 * HOUR))).toBe(false)
  })

  test('the SQL twin says the same, with the same number', () => {
    const query = new PgDialect().sqlToQuery(lateGarageCancelSql('b'))
    expect(query.sql).toBe(
      '(b.garage_cancelled_at IS NOT NULL AND b.scheduled_at < b.garage_cancelled_at + make_interval(hours => 24))'
    )
    expect(query.params).toEqual([])
  })
})
