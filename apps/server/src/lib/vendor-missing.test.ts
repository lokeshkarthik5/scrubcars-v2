import { describe, expect, test } from 'bun:test'
import {
  MISSING_KEYS,
  isMissingKey,
  payoutUsable,
  serviceUnpriced,
  vendorMissing,
  type MissingInput,
  type MissingService,
} from './vendor-missing.js'

const flat = (price: string | number | null = '500.00'): MissingService => ({
  pricingType: 'flat',
  price,
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
})

const sized = (
  hatchback: string | null,
  sedan: string | null,
  suv: string | null
): MissingService => ({
  pricingType: 'per_vehicle',
  price: '400.00',
  priceHatchback: hatchback,
  priceSedan: sedan,
  priceSuv: suv,
})

/** A garage with nothing missing. */
const complete: MissingInput = {
  photoCount: 3,
  logoUrl: 'https://cdn.example.com/logo.png',
  lat: 13.08,
  lng: 80.27,
  doorstepEnabled: true,
  doorstepRadiusKm: 8,
  hasDoorstepArea: false,
  bays: 2,
  workingHours: [{ isClosed: true }, { isClosed: false }],
  services: [flat(), sized('400.00', '500.00', '600.00')],
  documents: { missingRequired: 0, rejected: 0 },
  hasPayout: true,
}

const missing = (patch: Partial<MissingInput>) =>
  vendorMissing({ ...complete, ...patch })

describe('vendorMissing', () => {
  test('a complete garage misses nothing', () => {
    expect(vendorMissing(complete)).toEqual([])
  })

  test('a bare garage misses everything it can, in MISSING_KEYS order', () => {
    expect(
      vendorMissing({
        photoCount: 0,
        logoUrl: null,
        lat: null,
        lng: null,
        doorstepEnabled: true,
        doorstepRadiusKm: null,
        hasDoorstepArea: false,
        bays: null,
        workingHours: [],
        services: [],
        documents: { missingRequired: 4, rejected: 0 },
        hasPayout: false,
      })
    ).toEqual([
      'photos',
      'logo',
      'map_pin',
      'radius_default',
      'bays',
      'hours',
      'services',
      'documents',
      'payout',
    ])
  })

  test('photos, logo and bays (0 bays is not set)', () => {
    expect(missing({ photoCount: 0 })).toEqual(['photos'])
    expect(missing({ logoUrl: null })).toEqual(['logo'])
    expect(missing({ logoUrl: '' })).toEqual(['logo'])
    expect(missing({ bays: 0 })).toEqual(['bays'])
    expect(missing({ bays: null })).toEqual(['bays'])
  })

  test('a map pin needs both halves', () => {
    expect(missing({ lat: null })).toEqual(['map_pin'])
    expect(missing({ lng: null })).toEqual(['map_pin'])
  })

  test('the doorstep radius only when doorstep is on and no area is drawn', () => {
    expect(missing({ doorstepRadiusKm: null })).toEqual(['radius_default'])
    expect(missing({ doorstepRadiusKm: null, hasDoorstepArea: true })).toEqual(
      []
    )
    expect(missing({ doorstepRadiusKm: null, doorstepEnabled: false })).toEqual(
      []
    )
  })

  test('hours: no rows, or every day closed', () => {
    expect(missing({ workingHours: [] })).toEqual(['hours'])
    expect(
      missing({ workingHours: [{ isClosed: true }, { isClosed: true }] })
    ).toEqual(['hours'])
  })

  test('services, then prices only when there are services', () => {
    expect(missing({ services: [] })).toEqual(['services'])
    expect(missing({ services: [flat('0.00')] })).toEqual(['prices'])
    expect(
      missing({ services: [flat(), sized('400.00', null, '600.00')] })
    ).toEqual(['prices'])
    expect(missing({ services: [sized('400.00', '500.00', '0')] })).toEqual([
      'prices',
    ])
  })

  test('documents: none required missing or rejected; ignored while off', () => {
    expect(missing({ documents: { missingRequired: 1, rejected: 0 } })).toEqual(
      ['documents']
    )
    expect(missing({ documents: { missingRequired: 0, rejected: 2 } })).toEqual(
      ['documents']
    )
    expect(missing({ documents: null })).toEqual([])
  })

  test('payout', () => {
    expect(missing({ hasPayout: false })).toEqual(['payout'])
  })
})

describe('serviceUnpriced', () => {
  test('flat and inspection: the one price', () => {
    expect(serviceUnpriced(flat('1.00'))).toBe(false)
    expect(serviceUnpriced(flat(0))).toBe(true)
    expect(serviceUnpriced(flat('-5'))).toBe(true)
    expect(serviceUnpriced(flat(null))).toBe(true)
    expect(
      serviceUnpriced({ ...flat('0.00'), pricingType: 'on_inspection' })
    ).toBe(true)
    expect(
      serviceUnpriced({ ...flat('300'), pricingType: 'on_inspection' })
    ).toBe(false)
  })

  test('per vehicle: every size, and the base', () => {
    expect(serviceUnpriced(sized('1', '2', '3'))).toBe(false)
    expect(serviceUnpriced(sized(null, '2', '3'))).toBe(true)
    expect(serviceUnpriced(sized('1', '0.00', '3'))).toBe(true)
    expect(serviceUnpriced({ ...sized('1', '2', '3'), price: '0.00' })).toBe(
      true
    )
  })
})

describe('payoutUsable', () => {
  test('bank needs both the number and the IFSC; UPI alone will do', () => {
    expect(payoutUsable(null)).toBe(false)
    expect(payoutUsable(undefined)).toBe(false)
    expect(
      payoutUsable({
        accountNumber: '123456789',
        ifsc: 'HDFC0001234',
        upiId: null,
      })
    ).toBe(true)
    expect(
      payoutUsable({ accountNumber: '123456789', ifsc: null, upiId: null })
    ).toBe(false)
    expect(
      payoutUsable({ accountNumber: null, ifsc: 'HDFC0001234', upiId: '  ' })
    ).toBe(false)
    expect(
      payoutUsable({ accountNumber: null, ifsc: null, upiId: 'garage@upi' })
    ).toBe(true)
  })
})

test('isMissingKey', () => {
  for (const key of MISSING_KEYS) expect(isMissingKey(key)).toBe(true)
  expect(isMissingKey('custom')).toBe(false)
  expect(isMissingKey(3)).toBe(false)
})
