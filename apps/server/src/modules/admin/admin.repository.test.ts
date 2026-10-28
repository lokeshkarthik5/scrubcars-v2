/**
 * The bookings list's filters (0059) as SQL: the list and its views' counts
 * build them in one place (bookingFilterConditions), so a chip's count is
 * the rows it lists. Rendered, never run: nothing here touches a database.
 */
import { describe, expect, test } from 'bun:test'
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { bookingFilterConditions } = await import('./admin.repository.js')

const render = (filters: Parameters<typeof bookingFilterConditions>[0]) =>
  new PgDialect().sqlToQuery(and(...bookingFilterConditions(filters))!)

const none = { search: null, start: null, end: null, refundOwedIds: [] }

describe('bookingFilterConditions', () => {
  test('no filters, no conditions', () => {
    expect(bookingFilterConditions(none)).toEqual([])
  })

  test('status, garage, dates, Test and type', () => {
    const start = new Date('2026-10-01T00:00:00+05:30')
    const end = new Date('2026-11-01T00:00:00+05:30')
    const { sql, params } = render({
      ...none,
      status: 'completed',
      vendorId: 'e2e00000-0000-4000-8000-000000004155',
      start,
      end,
      test: 'hide',
      bookingType: 'doorstep',
    })
    expect(sql).toBe(
      '("bookings"."status" = $1 and "bookings"."vendor_id" = $2 and "bookings"."scheduled_at" >= $3' +
        ' and "bookings"."scheduled_at" < $4 and "bookings"."marked_test_at" is null and "bookings"."booking_type" = $5)'
    )
    expect(params).toEqual([
      'completed',
      'e2e00000-0000-4000-8000-000000004155',
      start.toISOString(),
      end.toISOString(),
      'doorstep',
    ])
  })

  test('paid: a paid payment', () => {
    const { sql, params } = render({ ...none, payment: 'paid' })
    expect(sql).toContain('exists (select 1 from "payments"')
    expect(sql).toContain('"payments"."status" in ($1)')
    expect(params).toEqual(['paid'])
  })

  test('pay later: on or done, with no money in', () => {
    const { sql, params } = render({ ...none, payment: 'pay_later' })
    expect(sql).toContain('"bookings"."status" in ($1, $2, $3, $4)')
    expect(sql).toContain('not exists (select 1 from "payments"')
    expect(params).toEqual([
      'pending',
      'confirmed',
      'in_progress',
      'completed',
      'paid',
      'collected',
      'refunded',
    ])
  })

  test('refund owed: the refunds owed, and nothing when there are none', () => {
    const owed = render({
      ...none,
      payment: 'refund_owed',
      refundOwedIds: ['b1', 'b2'],
    })
    expect(owed.sql).toBe('"bookings"."id" in ($1, $2)')
    expect(owed.params).toEqual(['b1', 'b2'])
    expect(render({ ...none, payment: 'refund_owed' }).sql).toBe('false')
  })
})
