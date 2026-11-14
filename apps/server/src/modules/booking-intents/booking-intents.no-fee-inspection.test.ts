/**
 * On inspection with no fee (0073), through the real checkout path: the
 * booking draft prices it at ₹0 and createIntent books it at once with no
 * Razorpay order (the free wash's way, 0062), while the pay-later path
 * refuses it and a code is refused before it is looked up. Only the
 * database (and the after-response pushes) are stood in for, and put back.
 */
import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { bookingIntentsService } = await import('./booking-intents.service.js')
const { bookingIntentsRepository } = await import('./booking-intents.repository.js')
const { bookingsService, resolveBookingDraft } = await import('../bookings/bookings.service.js')
const { bookingsRepository } = await import('../bookings/bookings.repository.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { pushService } = await import('../push/push.service.js')
const { analyticsService } = await import('../analytics/analytics.service.js')
const { AppError } = await import('../../lib/errors.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = id(7301)
const DENT = id(7302)
const HELMET = id(7303)
const CAR = id(7304)

const service = (rowId: string, overrides: Record<string, unknown> = {}) => ({
  id: rowId,
  vendorId: GARAGE,
  name: 'Dent repair',
  category: 'scratch_removal',
  pricingType: 'on_inspection',
  price: '0.00',
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  approxPrice: '1500.00',
  durationMins: 60,
  isActive: true,
  isAddon: false,
  ...overrides,
})

const restores: Array<() => void> = []
function patch(target: object, key: string, value: unknown) {
  const holder = target as Record<string, unknown>
  const original = holder[key]
  holder[key] = value
  restores.push(() => {
    holder[key] = original
  })
}
afterEach(() => {
  while (restores.length) restores.pop()!()
})

// Three days ahead at 11:00 IST: an open slot on a 30-minute grid.
function slot(): string {
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  day.setUTCHours(5, 30, 0, 0)
  return day.toISOString()
}

function standIn(rows: ReturnType<typeof service>[]) {
  const garage = {
    id: GARAGE,
    dropinEnabled: true,
    doorstepEnabled: false,
    bookingsPausedAt: null,
    bays: 2,
    jobsPerDay: null,
    slotIntervalMins: 30,
  }
  patch(bookingsRepository, 'findPublicVendorById', async () => garage)
  patch(bookingsRepository, 'findVendorById', async () => garage)
  patch(bookingsRepository, 'findServicesForVendor', async () => rows)
  patch(bookingsRepository, 'findVehicleForUser', async () => ({ id: CAR, vehicleType: 'sedan' }))
  patch(bookingsRepository, 'findClosure', async () => null)
  patch(bookingsRepository, 'listCapacityHolders', async () => [])
  patch(vendorsRepository, 'findWorkingHoursForDay', async () => ({
    openTime: '08:00',
    closeTime: '20:00',
    isClosed: false,
  }))
  // The after-response work reads the database; nothing to hear here.
  patch(pushService, 'notifyLater', () => {})
  patch(analyticsService, 'bookingPaid', () => {})
}

const input = (serviceIds: string[], extra: Record<string, unknown> = {}) => ({
  vendorId: GARAGE,
  serviceIds,
  vehicleId: CAR,
  bookingType: 'dropin' as const,
  scheduledAt: slot(),
  paymentMethod: 'online' as const,
  ...extra,
})

describe('a checkout of an inspection with no fee', () => {
  test('prices at ₹0, with its pricing type for the rule', async () => {
    standIn([service(DENT)])
    const draft = await resolveBookingDraft('user', input([DENT]))
    expect(draft.amount).toBe('0.00')
    expect(draft.chargeAmount).toBe('0.00')
    expect(draft.pricingTypes).toEqual(['on_inspection'])
    expect(draft.items[0]!.amount).toBe('0.00')
  })

  test('is booked at once with no Razorpay order and no payment id', async () => {
    standIn([service(DENT)])
    const consumed: Array<{ razorpayPaymentId: string | null }> = []
    patch(bookingIntentsRepository, 'findVehicleClash', async () => null)
    patch(bookingIntentsRepository, 'createIntent', async (row: Record<string, unknown>) => [
      { ...row, id: 'intent-7301', status: 'pending', gatewayTxnId: null },
    ])
    patch(bookingIntentsRepository, 'setGatewayTxnId', async () => {
      throw new Error('a Razorpay order was opened')
    })
    patch(bookingIntentsRepository, 'consumeIntent', async (params: { razorpayPaymentId: string | null }) => {
      consumed.push(params)
      return { kind: 'created', bookingId: 'booking-7301', receipt: { ok: true, number: 'DTL/26-27/000001' } }
    })

    const answer = await bookingIntentsService.createIntent('user', input([DENT]))
    expect(answer).toMatchObject({ free: true, paidWithCredit: false, orderId: null, keyId: null, amount: 0, bookingId: 'booking-7301' })
    expect(consumed).toEqual([expect.objectContaining({ razorpayPaymentId: null })])
  })

  test('with a paid add-on, is a normal paid checkout (the add-on is charged)', async () => {
    standIn([service(DENT), service(HELMET, { name: 'Helmet wash', category: 'others', pricingType: 'flat', price: '99.00', approxPrice: null, isAddon: true, durationMins: 0 })])
    const draft = await resolveBookingDraft('user', input([DENT, HELMET]))
    expect(draft.amount).toBe('99.00')
    expect(draft.chargeAmount).toBe('99.00')
  })

  test('takes no promo code: refused before the code is looked up', async () => {
    standIn([service(DENT)])
    patch(bookingsRepository, 'findAddressForUser', async () => null)
    const refusal = await resolveBookingDraft('user', input([DENT], { discountCode: 'SAVE50' })).catch((e: unknown) => e)
    expect(refusal).toBeInstanceOf(AppError)
    expect((refusal as InstanceType<typeof AppError>).code).toBe('DISCOUNT_NOTHING_TO_PAY')
  })

  test('the pay-later path refuses it, pointing at checkout, never a ₹0 order', async () => {
    standIn([service(DENT)])
    const refusal = await bookingsService.createBooking('user', input([DENT])).catch((e: unknown) => e)
    expect(refusal).toBeInstanceOf(AppError)
    expect((refusal as InstanceType<typeof AppError>).code).toBe('FREE_BOOKING_NEEDS_CHECKOUT')
    expect((refusal as Error).message).toBe("Book this through checkout: there's nothing to pay now.")
  })
})

describe('an inspection with a fee', () => {
  test('still charges the fee at checkout', async () => {
    standIn([service(DENT, { price: '299.00' })])
    const draft = await resolveBookingDraft('user', input([DENT]))
    expect(draft.chargeAmount).toBe('299.00')
  })
})
