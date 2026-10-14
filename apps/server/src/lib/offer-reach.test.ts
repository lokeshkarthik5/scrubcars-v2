import { describe, expect, test } from 'bun:test'
import { AppError } from './errors.js'
import { countReach, draftOfferRow, reachSettings, type ReachCustomer, type ReachDraft } from './offer-reach.js'

// Fixed clock: Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')
const GARAGE = 'garage-1'
const OTHER = 'garage-2'

function draft(overrides: Partial<ReachDraft> = {}): ReachDraft {
  return {
    audience: 'everyone',
    vendorId: null,
    radiusKm: null,
    vehicleTypes: null,
    vendorPublic: true,
    ...overrides,
  }
}

function customer(id: string, overrides: Partial<ReachCustomer> = {}): ReachCustomer {
  return {
    userId: id,
    carTypes: ['sedan'],
    bookedVendorIds: new Set(),
    washDue: false,
    distanceKm: null,
    ...overrides,
  }
}

const on = { now: NOW, targetingEnabled: true }
const off = { now: NOW, targetingEnabled: false }

describe('countReach', () => {
  const people = [
    customer('a'),
    customer('b', { carTypes: [] }),
    customer('c', { carTypes: ['suv', 'hatchback'], bookedVendorIds: new Set([GARAGE]), washDue: true, distanceKm: 3 }),
    customer('d', { bookedVendorIds: new Set([OTHER]), distanceKm: 12 }),
  ]

  test('a Detlio-wide offer for everyone reaches every signed-in customer, car or not', () => {
    expect(countReach(draft(), people, off)).toBe(4)
    expect(countReach(draft(), people, on)).toBe(4)
  })

  test('a garage offer for everyone needs a car, as Home does', () => {
    expect(countReach(draft({ vendorId: GARAGE }), people, off)).toBe(3)
  })

  test('a garage that is not live for customers reaches nobody', () => {
    expect(countReach(draft({ vendorId: GARAGE, vendorPublic: false }), people, on)).toBe(0)
  })

  test('with targeting off, every other audience reaches nobody', () => {
    for (const audience of ['new_customers', 'booked_this_garage', 'near_this_garage', 'wash_due', 'car_type'] as const) {
      expect(
        countReach(draft({ audience, vendorId: GARAGE, vehicleTypes: ['sedan'] }), people, off)
      ).toBe(0)
    }
  })

  test('each audience, with targeting on', () => {
    // a and b have no paid booking anywhere.
    expect(countReach(draft({ audience: 'new_customers' }), people, on)).toBe(2)
    expect(countReach(draft({ audience: 'booked_this_garage', vendorId: GARAGE }), people, on)).toBe(1)
    // 10 km by default: c at 3 km, not d at 12.
    expect(countReach(draft({ audience: 'near_this_garage', vendorId: GARAGE }), people, on)).toBe(1)
    expect(countReach(draft({ audience: 'near_this_garage', vendorId: GARAGE, radiusKm: 15 }), people, on)).toBe(2)
    expect(countReach(draft({ audience: 'wash_due' }), people, on)).toBe(1)
    expect(countReach(draft({ audience: 'car_type', vehicleTypes: ['sedan'] }), people, on)).toBe(2)
    expect(countReach(draft({ audience: 'car_type', vehicleTypes: ['hatchback', 'suv'] }), people, on)).toBe(1)
  })

  test('an unknown distance is not near', () => {
    expect(
      countReach(draft({ audience: 'near_this_garage', vendorId: GARAGE, radiusKm: 50 }), [customer('x')], on)
    ).toBe(0)
  })
})

describe('draftOfferRow', () => {
  test('is live now and keeps only the setting its audience uses', () => {
    const row = draftOfferRow(draft({ audience: 'everyone', radiusKm: 5, vehicleTypes: ['suv'] }), NOW)
    expect(row.homeAudienceRadiusKm).toBeNull()
    expect(row.homeAudienceVehicleTypes).toBeNull()
    expect(row.endsAt!.getTime()).toBeGreaterThan(NOW.getTime())
    expect(draftOfferRow(draft({ audience: 'near_this_garage' }), NOW).homeAudienceRadiusKm).toBe(10)
  })
})

describe('reachSettings', () => {
  /** The AppError `fn` throws, or null. */
  function refusal(fn: () => unknown): AppError | null {
    try {
      fn()
      return null
    } catch (error) {
      if (error instanceof AppError) return error
      throw error
    }
  }

  test('with targeting off, any audience but Everyone is a 409 TARGETING_DISABLED', () => {
    for (const audience of ['new_customers', 'booked_this_garage', 'near_this_garage', 'wash_due', 'car_type'] as const) {
      const error = refusal(() =>
        reachSettings({ audience, vendorId: GARAGE, radiusKm: 5, vehicleTypes: ['sedan'] }, false)
      )
      expect(error?.statusCode).toBe(409)
      expect(error?.code).toBe('TARGETING_DISABLED')
    }
  })

  test('with targeting off, Everyone is counted', () => {
    expect(reachSettings({ audience: 'everyone' }, false).homeAudience).toBe('everyone')
    expect(reachSettings({ audience: 'everyone', vendorId: GARAGE }, false).vendorId).toBe(GARAGE)
  })

  test('settings that do not fit together are a 400 DISCOUNT_HOME_INVALID, as a save is', () => {
    const noGarage = refusal(() => reachSettings({ audience: 'near_this_garage' }, true))
    expect(noGarage?.statusCode).toBe(400)
    expect(noGarage?.code).toBe('DISCOUNT_HOME_INVALID')
    expect(refusal(() => reachSettings({ audience: 'car_type' }, true))?.code).toBe('DISCOUNT_HOME_INVALID')
  })

  test('with targeting on: near takes the default distance, and only the setting its audience uses', () => {
    expect(reachSettings({ audience: 'near_this_garage', vendorId: GARAGE }, true).homeAudienceRadiusKm).toBe(10)
    const carType = reachSettings({ audience: 'car_type', vehicleTypes: ['sedan', 'suv'] }, true)
    expect(carType.homeAudienceVehicleTypes).toEqual(['sedan', 'suv'])
    expect(carType.homeAudienceRadiusKm).toBeNull()
  })
})
