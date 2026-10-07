import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  DISCOUNT_HELD,
  DISCOUNT_REALIZED,
  isRedemptionHeld,
  isRedemptionRealized,
  type RedemptionRow,
} from './discounts.predicates.js'

const row = (overrides: Partial<RedemptionRow> = {}): RedemptionRow => ({
  bookingStatus: 'confirmed',
  noShow: null,
  paymentStatus: 'paid',
  ...overrides,
})

describe('isRedemptionHeld', () => {
  test('a live booking holds its code, paid or not', () => {
    expect(isRedemptionHeld(row())).toBe(true)
    expect(isRedemptionHeld(row({ bookingStatus: 'pending', paymentStatus: 'pending' }))).toBe(true)
    // The customer can still retry a failed payment on a live booking.
    expect(isRedemptionHeld(row({ paymentStatus: 'failed' }))).toBe(true)
    expect(isRedemptionHeld(row({ bookingStatus: 'completed' }))).toBe(true)
  })

  test('a cancellation gives the use back', () => {
    expect(isRedemptionHeld(row({ bookingStatus: 'cancelled' }))).toBe(false)
    expect(isRedemptionHeld(row({ bookingStatus: 'cancelled', paymentStatus: 'refunded' }))).toBe(false)
  })

  test('a garage no-show gives it back, like any cancellation', () => {
    expect(isRedemptionHeld(row({ bookingStatus: 'cancelled', noShow: 'garage' }))).toBe(false)
  })

  test("a customer no-show keeps it spent: the customer walked away from the slot they booked with it", () => {
    expect(isRedemptionHeld(row({ bookingStatus: 'cancelled', noShow: 'customer' }))).toBe(true)
  })

  test('a refund gives it back', () => {
    expect(isRedemptionHeld(row({ paymentStatus: 'refunded' }))).toBe(false)
  })
})

describe('isRedemptionRealized', () => {
  test('money that landed on a live or finished booking is a saving', () => {
    expect(isRedemptionRealized(row())).toBe(true)
    expect(isRedemptionRealized(row({ bookingStatus: 'completed', paymentStatus: 'collected' }))).toBe(true)
  })

  test('nothing is saved until the money lands', () => {
    expect(isRedemptionRealized(row({ paymentStatus: 'pending' }))).toBe(false)
  })

  test('a cancelled booking saved nothing, unless the customer no-showed and the payment was kept', () => {
    expect(isRedemptionRealized(row({ bookingStatus: 'cancelled' }))).toBe(false)
    expect(isRedemptionRealized(row({ bookingStatus: 'cancelled', noShow: 'garage' }))).toBe(false)
    expect(isRedemptionRealized(row({ bookingStatus: 'cancelled', noShow: 'customer' }))).toBe(true)
  })
})

describe('the SQL predicates', () => {
  const dialect = new PgDialect()

  // The twins above are what the tests can run; the SQL is what the queries
  // run. This keeps the SQL from quietly losing a column the rule reads.
  test('both read the booking status, the no-show and the payment status', () => {
    for (const predicate of [DISCOUNT_HELD, DISCOUNT_REALIZED]) {
      const { sql, params } = dialect.sqlToQuery(predicate!)
      expect(sql).toContain('"bookings"."status"')
      expect(sql).toContain('"bookings"."no_show"')
      expect(sql).toContain('"payments"."status"')
      expect(params).toContain('customer')
    }
  })
})
