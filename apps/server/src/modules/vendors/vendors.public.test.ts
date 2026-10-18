import { describe, expect, test } from 'bun:test'
import { PUBLIC_VENDOR_KEYS, toPublicVendor, type PublicVendorSource } from './vendors.public.js'

// The whole row as the repository reads it, private columns filled in, so a
// field that slipped through would show up.
const ROW = {
  id: 'v1',
  ownerId: 'owner-1',
  businessName: 'Next Level Car Spa',
  logoUrl: 'https://cdn.example/logo.png',
  phone: '9000001001',
  whatsapp: '9000001002',
  email: 'owner@nextlevel.example',
  address: '12, Second Street, Adyar',
  city: 'Chennai',
  pincode: '600020',
  lat: 13.0067,
  lng: 80.2573,
  mapsUrl: 'https://maps.app.goo.gl/abc',
  notes: 'Owner asked us not to call before 10',
  yearsInOperation: '5',
  isVerified: true,
  status: 'active',
  dropinEnabled: true,
  doorstepEnabled: true,
  doorstepRadiusKm: 6,
  pickup: 'yes',
  pickupRadiusKm: 8,
  pickupTermsAcceptedAt: new Date('2026-10-17T05:00:00Z'),
  pickupTermsAcceptedBy: 'Lokesh',
  geoSource: 'map_pin',
  geoConfirmedAt: new Date('2026-10-01T05:00:00Z'),
  bays: 3,
  jobsPerDay: 20,
  vehicleTypes: ['hatchback', 'sedan'],
  slotIntervalMins: 30,
  bookingsPausedAt: null,
  bookingsPausedReason: null,
  deletedAt: null,
  deletedByName: null,
  deletedReason: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
} satisfies PublicVendorSource & Record<string, unknown>

const NOT_VERIFIED = { documentsVerified: false, certified: false }

const PRIVATE = [
  'ownerId',
  'phone',
  'whatsapp',
  'email',
  'address',
  'mapsUrl',
  'notes',
  'pickup',
  'pickupTermsAcceptedAt',
  'pickupTermsAcceptedBy',
  'geoSource',
  'geoConfirmedAt',
  'bays',
  'jobsPerDay',
  'vehicleTypes',
  'deletedAt',
  'deletedByName',
  'deletedReason',
]

describe('toPublicVendor', () => {
  test('carries only the allow-list: no contact details, no internal fields', () => {
    const shown = toPublicVendor(ROW, NOT_VERIFIED)
    expect(Object.keys(shown).sort()).toEqual([...PUBLIC_VENDOR_KEYS].sort())
    for (const key of PRIVATE) expect(shown).not.toHaveProperty(key)
    // Nor the values under another name.
    const text = JSON.stringify(shown)
    for (const secret of [ROW.phone, ROW.whatsapp, ROW.email, ROW.address, ROW.mapsUrl, ROW.notes]) {
      expect(text).not.toContain(secret)
    }
  })

  test('keeps what the garage page and checkout read before booking', () => {
    expect(toPublicVendor(ROW, NOT_VERIFIED)).toEqual({
      id: 'v1',
      businessName: 'Next Level Car Spa',
      logoUrl: 'https://cdn.example/logo.png',
      city: 'Chennai',
      pincode: '600020',
      lat: 13.0067,
      lng: 80.2573,
      yearsInOperation: '5',
      isVerified: true,
      status: 'active',
      dropinEnabled: true,
      doorstepEnabled: true,
      doorstepRadiusKm: 6,
      pickupEnabled: true,
      pickupRadiusKm: 8,
      slotIntervalMins: 30,
      bookingsPausedAt: null,
      bookingsPausedReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      documentsVerified: false,
      certified: false,
    })
  })

  test('garage documents are one boolean, never the documents', () => {
    const shown = toPublicVendor(ROW, { documentsVerified: true, certified: false })
    expect(shown.documentsVerified).toBe(true)
    for (const key of Object.keys(shown)) expect(key).not.toMatch(/^document(?!sVerified$)|file|storage/i)
  })

  test('Detlio Certified is one boolean, never the numbers, the checks or who certified it', () => {
    const shown = toPublicVendor(ROW, { documentsVerified: true, certified: true })
    expect(shown.certified).toBe(true)
    for (const key of Object.keys(shown)) {
      expect(key).not.toMatch(/certif(?!ied$)|check|revok|eligib|rating|complaint|noShow/i)
    }
  })

  test('pickup is on only with the terms on file, and a pause says when and why', () => {
    expect(toPublicVendor({ ...ROW, pickupTermsAcceptedAt: null }, NOT_VERIFIED).pickupEnabled).toBe(false)
    expect(
      toPublicVendor(
        { ...ROW, bookingsPausedAt: new Date('2026-10-10T04:30:00Z'), bookingsPausedReason: 'Renovation' },
        NOT_VERIFIED
      )
    ).toMatchObject({ bookingsPausedAt: '2026-10-10T04:30:00.000Z', bookingsPausedReason: 'Renovation' })
  })
})
