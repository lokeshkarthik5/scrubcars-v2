/**
 * The category a booking line keeps (booking_items.category, 0080), without
 * a database: a move copies each line's booked category rather than reading
 * the service's category again, and bookedCategory keeps a copied one as it
 * is. The writes and reads against a real Postgres are in
 * modules/payouts/booked-category.db.test.ts.
 */
import { describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { moveParams } = await import('./bookings.service.js')
const { bookedCategory } = await import('./bookings.repository.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('a booking line keeps the category it was booked at', () => {
  test('bookedCategory keeps a copied category and reads the service otherwise', () => {
    expect(bookedCategory(id(7801), 'others')).toBe('others')
    const read = bookedCategory(id(7801))
    expect(typeof read).toBe('object')
    expect(bookedCategory(id(7801), null)).not.toBe(null)
  })

  test('a move copies each line’s booked category, not the service’s now', () => {
    const booking = {
      id: id(7820),
      originalBookingId: null,
      vendorId: id(7800),
      vehicleId: id(7821),
      bookingType: 'dropin',
      subtotalAmount: '1500.00',
      amount: '1500.00',
      travelFee: '0.00',
      roadKm: null,
      convenienceFee: '0.00',
      discountAmount: '0.00',
      discountId: null,
      discountCode: null,
      discountFundedBy: null,
      paymentMethod: 'online',
      lat: null,
      lng: null,
      address: null,
      pickupCode: null,
      deliveryCode: null,
      payment: null,
      markedTestAt: null,
      markedTestBy: null,
      items: [
        // Booked in Others, though the service has since moved to Repairs.
        { serviceId: id(7811), name: 'Clutch overhaul', amount: '1000.00', durationMins: 60, isAddon: false, category: 'others', service: { pricingType: 'flat', category: 'repairs' } },
        // Written before 0080: no category, so the write reads the service's.
        { serviceId: id(7814), name: 'Foam wash', amount: '500.00', durationMins: 30, isAddon: false, category: null, service: { pricingType: 'flat' } },
      ],
    } as unknown as Parameters<typeof moveParams>[0]

    const params = moveParams(booking, {
      userId: id(7822),
      newScheduledAt: new Date('2026-11-20T10:00:00+05:30'),
      durationMins: 90,
      expectedStatus: 'pending',
      reason: null,
    })
    expect(params.items.map((item) => item.category)).toEqual(['others', null])
  })
})
