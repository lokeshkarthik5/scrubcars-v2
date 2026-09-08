import { describe, expect, it } from 'bun:test'
import { createBookingSchema } from './bookings.validation.js'

// The schema is where the old single-service shape and the new multi-service
// one are reconciled. Everything downstream reads `serviceIds` and knows
// nothing about `serviceId`, so this normalisation is load-bearing: get it
// wrong and a client that has not been updated silently stops being able to
// book.

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const ADDRESS = '55555555-5555-4555-8555-555555555555'

const base = {
  vendorId: '33333333-3333-4333-8333-333333333333',
  vehicleId: '44444444-4444-4444-8444-444444444444',
  bookingType: 'dropin' as const,
  scheduledAt: '2026-09-01T10:00:00.000Z',
}

describe('createBookingSchema', () => {
  it('accepts the old single serviceId', () => {
    const parsed = createBookingSchema.parse({ ...base, serviceId: A })
    expect(parsed.serviceIds).toEqual([A])
  })

  it('accepts a list and keeps the customer’s order', () => {
    const parsed = createBookingSchema.parse({ ...base, serviceIds: [B, A] })
    expect(parsed.serviceIds).toEqual([B, A])
  })

  it('dedupes a service added twice rather than charging for it twice', () => {
    const parsed = createBookingSchema.parse({ ...base, serviceIds: [A, B, A] })
    expect(parsed.serviceIds).toEqual([A, B])
  })

  it('rejects a booking with no service', () => {
    expect(() => createBookingSchema.parse(base)).toThrow()
    expect(() => createBookingSchema.parse({ ...base, serviceIds: [] })).toThrow()
  })

  it('rejects more services than a booking may carry', () => {
    const tooMany = Array.from(
      { length: 11 },
      (_, i) => `1111111${i}-1111-4111-8111-11111111111${i % 10}`
    )
    expect(() =>
      createBookingSchema.parse({ ...base, serviceIds: tooMany })
    ).toThrow()
  })

  // Doorstep used to be refused outright by a `z.literal('dropin')`, which is
  // why the booking page's Doorstep toggle 400'd. It is bookable now, and the
  // address it needs is required here rather than left to the service — a
  // doorstep request with nowhere to go is malformed, not a business-rule
  // failure.
  it('accepts a doorstep booking with an address', () => {
    const parsed = createBookingSchema.parse({
      ...base,
      serviceId: A,
      bookingType: 'doorstep',
      addressId: ADDRESS,
    })
    expect(parsed.bookingType).toBe('doorstep')
    expect(parsed.addressId).toBe(ADDRESS)
  })

  it('rejects a doorstep booking with no address', () => {
    expect(() =>
      createBookingSchema.parse({
        ...base,
        serviceId: A,
        bookingType: 'doorstep',
      })
    ).toThrow()
  })

  it('does not require an address for drop-in', () => {
    const parsed = createBookingSchema.parse({ ...base, serviceId: A })
    expect(parsed.addressId).toBeUndefined()
  })
})
