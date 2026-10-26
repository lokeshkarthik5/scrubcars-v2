import { describe, expect, test } from 'bun:test'
import { ApiError } from '@repo/core/api/client'
import {
  BOOKING_VIEWS,
  PAYMENT_FILTERS,
  TODAY_GROUPS,
  TYPE_FILTERS,
  bookingNeedsAction,
  defaultView,
  emptyViewText,
  isBookingView,
  matchesView,
  parsePaymentFilter,
  parseTypeFilter,
  parseView,
  todayGroup,
  viewFilter,
  viewParam,
  viewsUnsupported,
  viewsWithCounts,
} from './booking-views'
import { bookingsListHref, listQueryForDetail } from './bookings'

type Row = Parameters<typeof matchesView>[0]
const booking = (overrides: Partial<Row> = {}): Row => ({
  status: 'confirmed',
  payment: { status: 'paid', gatewayTxnId: null, paidAt: null },
  markedTest: null,
  refundOwed: null,
  scheduledAt: '2026-10-26T06:30:00Z',
  ...overrides,
})
const NOW = Date.parse('2026-10-26T04:00:00Z') // 9:30 am in Chennai

describe('the views in the URL', () => {
  test('six views, in the mockup order', () => {
    expect(BOOKING_VIEWS.map((v) => v.label)).toEqual([
      'Needs action',
      'Today',
      'Upcoming',
      'Completed',
      'Cancelled',
      'All',
    ])
    expect(isBookingView('today')).toBe(true)
    expect(isBookingView('pending')).toBe(false)
  })

  test('opens on Needs action, or All while searching', () => {
    expect(defaultView('')).toBe('needs_action')
    expect(defaultView(null)).toBe('needs_action')
    expect(defaultView(' #3F2A ')).toBe('all')
    expect(parseView(null, '')).toBe('needs_action')
    expect(parseView(null, '#3F2A')).toBe('all')
    expect(parseView('today', '#3F2A')).toBe('today')
    expect(parseView('nonsense', '')).toBe('needs_action')
  })

  test('the default is left out of the URL', () => {
    expect(viewParam('needs_action', '')).toBeNull()
    expect(viewParam('all', '')).toBe('all')
    expect(viewParam('all', 'priya')).toBeNull()
    expect(viewParam('needs_action', 'priya')).toBe('needs_action')
  })

  test('All is no filter for the API', () => {
    expect(viewFilter('all')).toBeUndefined()
    expect(viewFilter('cancelled')).toBe('cancelled')
  })

  test('counts when known, none otherwise', () => {
    const counts = {
      needs_action: 3,
      today: 14,
      upcoming: 22,
      completed: 318,
      cancelled: 27,
      all: 400,
    }
    expect(viewsWithCounts(counts).map((v) => v.count)).toEqual([
      3, 14, 22, 318, 27, 400,
    ])
    expect(viewsWithCounts(undefined).every((v) => v.count === undefined)).toBe(
      true
    )
  })

  test('only a 404 means an API older than the views', () => {
    expect(viewsUnsupported(new ApiError(404, 'Not found'))).toBe(true)
    expect(viewsUnsupported(new ApiError(500, 'Boom'))).toBe(false)
    expect(viewsUnsupported(new Error('offline'))).toBe(false)
    expect(viewsUnsupported(null)).toBe(false)
  })
})

describe('the views on the rows, for an older API', () => {
  test('needs action: paid and waiting, not Test; or a refund owed', () => {
    expect(bookingNeedsAction(booking({ status: 'pending' }))).toBe(true)
    expect(
      bookingNeedsAction(
        booking({ status: 'pending', markedTest: { at: 'x', by: null } })
      )
    ).toBe(false)
    expect(
      bookingNeedsAction(
        booking({
          status: 'pending',
          payment: { status: 'pending', gatewayTxnId: null, paidAt: null },
        })
      )
    ).toBe(false)
    expect(
      bookingNeedsAction(booking({ status: 'cancelled', refundOwed: '499.00' }))
    ).toBe(true)
    expect(bookingNeedsAction(booking())).toBe(false)
  })

  test('today and upcoming go by the day in Chennai', () => {
    expect(matchesView(booking(), 'today', NOW)).toBe(true)
    // 11:30 pm on the 26th in Chennai is still today.
    expect(
      matchesView(
        booking({ scheduledAt: '2026-10-26T18:00:00Z' }),
        'today',
        NOW
      )
    ).toBe(true)
    // 12:30 am on the 27th is tomorrow.
    const tomorrow = booking({ scheduledAt: '2026-10-26T19:00:00Z' })
    expect(matchesView(tomorrow, 'today', NOW)).toBe(false)
    expect(matchesView(tomorrow, 'upcoming', NOW)).toBe(true)
    expect(
      matchesView({ ...tomorrow, status: 'cancelled' }, 'upcoming', NOW)
    ).toBe(false)
    expect(matchesView(booking(), 'upcoming', NOW)).toBe(false)
  })

  test('completed, cancelled and all', () => {
    expect(
      matchesView(booking({ status: 'completed' }), 'completed', NOW)
    ).toBe(true)
    expect(matchesView(booking(), 'completed', NOW)).toBe(false)
    expect(
      matchesView(booking({ status: 'cancelled' }), 'cancelled', NOW)
    ).toBe(true)
    expect(matchesView(booking({ status: 'cancelled' }), 'all', NOW)).toBe(true)
  })

  test('an empty view says why', () => {
    expect(emptyViewText('needs_action', false)).toMatch(
      /^Nothing needs action/
    )
    expect(emptyViewText('today', true)).toMatch(
      /^Nothing matches these filters/
    )
  })
})

describe('the Type and Payment filters', () => {
  test('mockup 03 words, read from the URL as an allow-list', () => {
    expect(TYPE_FILTERS.map((f) => f.label)).toEqual([
      'At garage',
      'Doorstep',
      'Pickup & drop',
    ])
    expect(PAYMENT_FILTERS.map((f) => f.label)).toEqual([
      'Paid',
      'Pay at garage',
      'Money owed',
    ])
    expect(parseTypeFilter('doorstep')).toBe('doorstep')
    expect(parseTypeFilter('DOORSTEP')).toBeNull()
    expect(parseTypeFilter(null)).toBeNull()
    expect(parsePaymentFilter('refund_owed')).toBe('refund_owed')
    expect(parsePaymentFilter('free')).toBeNull()
  })
})

describe('the Today groups', () => {
  test('late or due soon first, the rest on track; none in other views', () => {
    expect(TODAY_GROUPS).toEqual(['Needs attention', 'Today · on track'])
    expect(todayGroup('today', 'urgent')).toBe('Needs attention')
    expect(todayGroup('today', 'attention')).toBe('Needs attention')
    expect(todayGroup('today', null)).toBe('Today · on track')
    expect(todayGroup('upcoming', 'urgent')).toBeNull()
  })
})

describe("a booking's back arrow keeps the new filters", () => {
  test('type and payment ride along; anything else is dropped', () => {
    const query = listQueryForDetail(
      new URLSearchParams('view=today&type=pickup&payment=paid&evil=1')
    )
    expect(query).toBe('view=today&type=pickup&payment=paid')
    expect(bookingsListHref(query)).toBe(`/bookings?${query}`)
  })
})
