/**
 * The pickup fee (0079) through the real booking draft: the fee is worked
 * out from the garage's live fee and the address, and what checkout showed
 * (`pickupFee`) must be what is charged — a garage that changed its fee
 * since the page loaded gets a refusal before any charge
 * (PICKUP_FEE_CHANGED), never a different price. Only the database is
 * stood in for, and put back.
 */
import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { resolveBookingDraft } = await import('./bookings.service.js')
const { bookingsRepository } = await import('./bookings.repository.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { AppError } = await import('../../lib/errors.js')
const { pickupFeesRepository } = await import('../pickup-fees/pickup-fees.repository.js')
const { forgetPickupFeeSettings } = await import('../pickup-fees/pickup-fees.service.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = id(7791)
const WASH = id(7792)
const CAR = id(7793)
const HOME = id(7794)

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
  forgetPickupFeeSettings()
})

function slot(): string {
  const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  day.setUTCHours(5, 30, 0, 0)
  return day.toISOString()
}

// The garage's pin, and an address 0.1° of latitude north (11.1 km straight,
// 14.5 km by road): Detlio's suggestion is (14.5 − 3) × ₹15 = ₹172.50 → ₹170.
const PIN = { lat: 13.0, lng: 80.2 }

function standIn(fee: Record<string, unknown>) {
  const garage = {
    id: GARAGE,
    dropinEnabled: true,
    doorstepEnabled: false,
    pickup: 'yes',
    pickupRadiusKm: 20,
    pickupTermsAcceptedAt: new Date('2026-10-01T00:00:00Z'),
    bookingsPausedAt: null,
    bays: 2,
    jobsPerDay: null,
    slotIntervalMins: 30,
    ...PIN,
    pickupFeeMode: 'free',
    pickupFeeFixed: null,
    pickupFeeFreeKm: null,
    pickupFeePerKm: null,
    pickupFeeMin: null,
    pickupFeeMax: null,
    pickupFeeWaitingSince: null,
    pickupFeeLockedAt: null,
    ...fee,
  }
  forgetPickupFeeSettings()
  patch(pickupFeesRepository, 'readSettings', async () => null)
  patch(bookingsRepository, 'findPublicVendorById', async () => garage)
  patch(bookingsRepository, 'findVendorById', async () => garage)
  patch(bookingsRepository, 'findServicesForVendor', async () => [
    {
      id: WASH,
      vendorId: GARAGE,
      name: 'Foam wash',
      category: 'car_wash',
      pricingType: 'flat',
      price: '699.00',
      priceHatchback: null,
      priceSedan: null,
      priceSuv: null,
      approxPrice: null,
      durationMins: 60,
      isActive: true,
      isAddon: false,
    },
  ])
  patch(bookingsRepository, 'findVehicleForUser', async () => ({ id: CAR, vehicleType: 'sedan' }))
  patch(bookingsRepository, 'findAddressForUser', async () => ({
    id: HOME,
    address: '1 Main Road',
    lat: PIN.lat + 0.1,
    lng: PIN.lng,
  }))
  patch(bookingsRepository, 'isWithinPickupRadius', async () => true)
  patch(bookingsRepository, 'findClosure', async () => null)
  patch(bookingsRepository, 'listCapacityHolders', async () => [])
  patch(vendorsRepository, 'findWorkingHoursForDay', async () => ({
    openTime: '08:00',
    closeTime: '20:00',
    isClosed: false,
  }))
}

const input = (extra: Record<string, unknown> = {}) => ({
  vendorId: GARAGE,
  serviceIds: [WASH],
  vehicleId: CAR,
  bookingType: 'pickup' as const,
  addressId: HOME,
  scheduledAt: slot(),
  paymentMethod: 'online' as const,
  ...extra,
})

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (err) {
    return err
  }
  return null
}

describe('the pickup fee on a booking (0079)', () => {
  test('Free (every garage at merge): ₹0, the total as before', async () => {
    standIn({})
    const draft = await resolveBookingDraft('user', input({ pickupFee: 0 }))
    expect(draft.travelFee).toBe('0.00')
    expect(draft.convenienceFee).toBe('0.00')
    expect(draft.chargeAmount).toBe('699.00')
  })

  test('By distance on Detlio’s numbers: the fee for the road km, its own line', async () => {
    standIn({ pickupFeeMode: 'distance' })
    const draft = await resolveBookingDraft('user', input({ pickupFee: 170 }))
    expect(draft.travelFee).toBe('170.00')
    expect(draft.roadKm).toBe('14.5')
    expect(draft.amount).toBe('869.00')
    expect(draft.chargeAmount).toBe('869.00')
  })

  test('a fee that changed since checkout loaded is refused before any charge', async () => {
    // Checkout showed Free; the garage has since moved to Detlio's fee.
    standIn({ pickupFeeMode: 'distance' })
    const err = await refusal(resolveBookingDraft('user', input({ pickupFee: 0 })))
    expect(err).toBeInstanceOf(AppError)
    expect((err as InstanceType<typeof AppError>).code).toBe('PICKUP_FEE_CHANGED')
    expect((err as Error).message).toContain('₹170')
  })

  test('an older app that sends no fee is charged the live fee, as before', async () => {
    standIn({ pickupFeeMode: 'fixed', pickupFeeFixed: '150.00' })
    const draft = await resolveBookingDraft('user', input())
    expect(draft.travelFee).toBe('150.00')
  })
})
