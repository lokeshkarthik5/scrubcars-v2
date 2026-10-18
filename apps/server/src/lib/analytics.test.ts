import { describe, expect, test } from 'bun:test'
import {
  amountBucket,
  ANALYTICS_EVENTS,
  bookingEventProps,
  cleanPath,
  EVENT_PROPS,
  isLikelyBot,
  newVsRepeatByWeek,
  PROP_KEYS,
  retentionCutoff,
  returningCustomers,
  summariseCategories,
  summariseDevices,
  summariseEventFunnel,
  summariseGarageViews,
  type BookingFacts,
} from './analytics.js'
import { istMidnight } from './ist.js'

describe('what an event may carry', () => {
  test('every event has an allow-list, and every key in one is a known key', () => {
    for (const name of ANALYTICS_EVENTS) {
      expect(EVENT_PROPS[name]).toBeDefined()
      for (const key of EVENT_PROPS[name]) expect(PROP_KEYS).toContain(key)
    }
  })

  test('a price is only ever a band', () => {
    expect(amountBucket(0)).toBe('under_500')
    expect(amountBucket(499.99)).toBe('under_500')
    expect(amountBucket(500)).toBe('500_999')
    expect(amountBucket(1999)).toBe('1000_1999')
    expect(amountBucket(2000)).toBe('2000_4999')
    expect(amountBucket(5000)).toBe('5000_plus')
    expect(amountBucket(Number.NaN)).toBe('under_500')
  })

  test('a path loses its query, its hash and its ids', () => {
    expect(cleanPath('/garage/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10?mode=doorstep')).toBe('/garage/:id')
    expect(cleanPath('/bookings/2B7F6F0E-5D1C-4C11-9B55-2F0B6A1C9D10/receipt#top')).toBe('/bookings/:id/receipt')
    expect(cleanPath('/book/2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10?service=a,b&code=X')).toBe('/book/:id')
    // A gift link's code is the gift (0049): never kept.
    expect(cleanPath('/gift/ABCDEFGHJKMNPQRS')).toBe('/gift/:code')
    // A printed coupon's code likewise (0055); only at the top level.
    expect(cleanPath('/c/7K4QM92MXA')).toBe('/c/:code')
    expect(cleanPath('/profile/c/x')).toBe('/profile/c/x')
    expect(cleanPath('/')).toBe('/')
    expect(cleanPath('')).toBe('/')
    expect(cleanPath('/search/<script>')).toBe('/search/script')
    expect(cleanPath(`/${'a'.repeat(500)}`)).toHaveLength(200)
  })

  test('crawlers and headless browsers are dropped, phones are not', () => {
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(isLikelyBot('Mozilla/5.0 (compatible; AhrefsSpider)')).toBe(true)
    expect(isLikelyBot('some-crawler/1.0')).toBe(true)
    expect(isLikelyBot(undefined)).toBe(true)
    const headless = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/131.0 Safari/537.36'
    expect(isLikelyBot(headless)).toBe(true)
    // The E2E stack lets Playwright through.
    expect(isLikelyBot(headless, true)).toBe(false)
    expect(isLikelyBot('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36')).toBe(false)
  })

  test('events are kept 180 days', () => {
    const now = new Date('2026-10-17T00:00:00Z')
    expect(retentionCutoff(now).toISOString()).toBe('2026-04-20T00:00:00.000Z')
  })
})

describe("the API's own booking events", () => {
  const facts: BookingFacts = {
    vendorId: '2b7f6f0e-5d1c-4c11-9b55-2f0b6a1c9d10',
    bookingType: 'doorstep',
    amount: '1299.00',
    paymentStatus: 'paid',
    gatewayMode: 'live',
    serviceCount: 2,
  }

  test('booking_paid names the garage, type, services and a price band, nothing else', () => {
    expect(bookingEventProps('booking_paid', facts)).toEqual({
      vendorId: facts.vendorId,
      mode: 'doorstep',
      serviceCount: 2,
      amountBucket: '1000_1999',
    })
  })

  test('booking_cancelled says who cancelled', () => {
    expect(bookingEventProps('booking_cancelled', facts, 'garage')).toEqual({
      vendorId: facts.vendorId,
      mode: 'doorstep',
      cancelledBy: 'garage',
    })
  })

  test("test and E2E payments, and bookings never paid for, aren't recorded", () => {
    expect(bookingEventProps('booking_paid', { ...facts, gatewayMode: 'test' })).toBeNull()
    expect(bookingEventProps('booking_paid', { ...facts, gatewayMode: 'fake' })).toBeNull()
    expect(bookingEventProps('booking_cancelled', { ...facts, paymentStatus: 'pending' }, 'customer')).toBeNull()
    // Old rows have no mode: a real payment as far as we know.
    expect(bookingEventProps('booking_paid', { ...facts, gatewayMode: null })).not.toBeNull()
    // Refunded since still means it was paid.
    expect(bookingEventProps('booking_cancelled', { ...facts, paymentStatus: 'refunded' }, 'detlio')).not.toBeNull()
  })
})

describe('the funnel', () => {
  test('counts each step, its conversion from the one before and from visits', () => {
    const { steps } = summariseEventFunnel({ visits: 200, garage: 120, checkout: 30, slot: 24, pay: 18, paid: 12 })
    expect(steps.map((s) => s.count)).toEqual([200, 120, 30, 24, 18, 12])
    expect(steps[0].ofPrevious).toBeNull()
    expect(steps[1].ofPrevious).toBeCloseTo(0.6)
    expect(steps[2].ofPrevious).toBeCloseTo(0.25)
    expect(steps[5].ofPrevious).toBeCloseTo(2 / 3)
    expect(steps[5].ofVisits).toBeCloseTo(0.06)
    expect(steps.map((s) => s.label)).toEqual([
      'Visits',
      'Saw a garage',
      'Started checkout',
      'Picked a slot',
      'Pressed Pay',
      'Paid',
    ])
  })

  test('highlights the step most people were lost before', () => {
    const { biggestDrop } = summariseEventFunnel({ visits: 200, garage: 120, checkout: 30, slot: 24, pay: 18, paid: 12 })
    // 120 → 30 loses 90, more than 200 → 120 loses 80.
    expect(biggestDrop).toEqual({ key: 'checkout', lost: 90, ofPrevious: 0.25 })
  })

  test('a tie goes to the earlier step', () => {
    const { biggestDrop } = summariseEventFunnel({ visits: 100, garage: 50, checkout: 0, slot: 0, pay: 0, paid: 0 })
    expect(biggestDrop?.key).toBe('garage')
  })

  test('nothing fell, nothing to highlight; no visits, no percentages', () => {
    const empty = summariseEventFunnel({ visits: 0, garage: 0, checkout: 0, slot: 0, pay: 0, paid: 0 })
    expect(empty.biggestDrop).toBeNull()
    expect(empty.steps.every((s) => s.ofVisits === null)).toBe(true)
    expect(empty.steps.slice(1).every((s) => s.ofPrevious === null)).toBe(true)
  })

  test('a step above the one before (payments without events) is not a drop', () => {
    const { steps, biggestDrop } = summariseEventFunnel({ visits: 10, garage: 10, checkout: 4, slot: 4, pay: 2, paid: 3 })
    expect(steps[5].ofPrevious).toBeCloseTo(1.5)
    expect(biggestDrop?.key).toBe('checkout')
  })

  test('garages by views, with the share that became a booking', () => {
    const rows = summariseGarageViews(
      [
        { vendorId: 'b', name: 'B', views: 10, bookings: 1 },
        { vendorId: 'a', name: 'A', views: 40, bookings: 4 },
        { vendorId: 'c', name: null, views: 0, bookings: 2 },
      ],
      2
    )
    expect(rows).toEqual([
      { vendorId: 'a', name: 'A', views: 40, bookings: 4, viewToBooking: 0.1 },
      { vendorId: 'b', name: 'B', views: 10, bookings: 1, viewToBooking: 0.1 },
    ])
  })

  test('devices and categories list every class, unknown ones ignored', () => {
    expect(
      summariseDevices([
        { device: 'phone', visits: 30 },
        { device: 'desktop', visits: 10 },
        { device: 'fridge', visits: 99 },
      ])
    ).toEqual([
      { device: 'phone', visits: 30, share: 0.75 },
      { device: 'tablet', visits: 0, share: 0 },
      { device: 'desktop', visits: 10, share: 0.25 },
    ])
    const categories = summariseCategories([
      { category: 'detailing', visits: 4 },
      { category: 'car_wash', visits: 9 },
      { category: null, visits: 3 },
    ])
    expect(categories[0]).toEqual({ category: 'car_wash', visits: 9 })
    expect(categories[1]).toEqual({ category: 'detailing', visits: 4 })
    expect(categories).toHaveLength(6)
  })
})

describe('returning customers', () => {
  const day = (date: string, hour = 10) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+05:30`)
  const start = istMidnight('2026-07-01')
  const end = istMidnight('2026-08-01')
  const now = day('2026-10-17')

  test('counts a customer once, from their first paid booking in the period', () => {
    const result = returningCustomers(
      [
        // Came back after 20 days: returned within 30 and 60.
        { userId: 'a', bookedAt: day('2026-07-02') },
        { userId: 'a', bookedAt: day('2026-07-22') },
        { userId: 'a', bookedAt: day('2026-07-25') },
        // Came back after 45 days, outside the period: 60 only.
        { userId: 'b', bookedAt: day('2026-07-10') },
        { userId: 'b', bookedAt: day('2026-08-24') },
        // Never came back.
        { userId: 'c', bookedAt: day('2026-07-15') },
        // Only booked before the period: not in it.
        { userId: 'd', bookedAt: day('2026-06-01') },
      ],
      start,
      end,
      now
    )
    expect(result.customers).toBe(3)
    expect(result.windows).toEqual([
      { days: 30, eligible: 3, returned: 1, rate: 1 / 3 },
      { days: 60, eligible: 3, returned: 2, rate: 2 / 3 },
    ])
  })

  test('a booking made before the period does not count as the return', () => {
    const result = returningCustomers(
      [
        { userId: 'a', bookedAt: day('2026-06-25') },
        { userId: 'a', bookedAt: day('2026-07-05') },
      ],
      start,
      end,
      now
    )
    expect(result.windows[0]).toMatchObject({ eligible: 1, returned: 0 })
  })

  test("a booking too recent to tell is left out of that window, not counted as lost", () => {
    const result = returningCustomers(
      [{ userId: 'a', bookedAt: day('2026-10-01') }],
      istMidnight('2026-10-01'),
      istMidnight('2026-10-18'),
      now
    )
    expect(result.customers).toBe(1)
    expect(result.windows).toEqual([
      { days: 30, eligible: 0, returned: 0, rate: null },
      { days: 60, eligible: 0, returned: 0, rate: null },
    ])
  })

  test('new against repeat bookings per week, Monday to Sunday', () => {
    const weeks = newVsRepeatByWeek(
      [
        { userId: 'a', bookedAt: day('2026-06-20') },
        { userId: 'a', bookedAt: day('2026-10-06') },
        { userId: 'b', bookedAt: day('2026-10-07') },
        { userId: 'b', bookedAt: day('2026-10-14') },
        { userId: 'c', bookedAt: day('2026-10-16', 23) },
      ],
      { from: '2026-10-05', to: '2026-10-17' }
    )
    expect(weeks).toEqual([
      { start: '2026-10-05', end: '2026-10-11', full: true, new: 1, repeat: 1 },
      { start: '2026-10-12', end: '2026-10-17', full: false, new: 1, repeat: 1 },
    ])
  })
})
