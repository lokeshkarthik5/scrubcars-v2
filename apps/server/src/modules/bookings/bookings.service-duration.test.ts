/**
 * A service's duration may be unset (0061), but the booking payload's
 * deprecated `service.durationMins` stays a number: clients older than
 * `items` read it, and the core type says number. It is what the calendar
 * holds for such a service (lib/service-duration.ts), as at checkout.
 */
import { describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { toBookingResponse } = await import('./bookings.service.js')
const { DEFAULT_SERVICE_DURATION_MINS } = await import('../../lib/service-duration.js')

type Row = Parameters<typeof toBookingResponse>[0]

function booking(serviceDuration: number | null): Row {
  return {
    id: 'b-4240',
    status: 'confirmed',
    bookingType: 'dropin',
    scheduledAt: new Date('2026-10-30T04:30:00Z'),
    durationMins: 60,
    amount: '450.00',
    paymentMethod: 'online',
    vendorId: 'v-4240',
    createdAt: new Date('2026-10-28T04:30:00Z'),
    service: {
      id: 's-4240',
      name: 'Foam Wash',
      category: 'car_wash',
      pricingType: 'flat',
      durationMins: serviceDuration,
    },
    items: [],
    payment: null,
  } as unknown as Row
}

describe('the deprecated service on a booking (0061)', () => {
  test('a service with no duration says the default, never null', () => {
    expect(toBookingResponse(booking(null)).service?.durationMins).toBe(DEFAULT_SERVICE_DURATION_MINS)
  })

  test('a service with its own duration says it', () => {
    expect(toBookingResponse(booking(45)).service?.durationMins).toBe(45)
  })
})
