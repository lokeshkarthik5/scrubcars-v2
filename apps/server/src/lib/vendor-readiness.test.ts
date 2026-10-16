import { describe, expect, test } from 'bun:test'
import {
  retiredVehicleTypes,
  vendorReadiness,
  type ReadinessInput,
} from './vendor-readiness.js'

const OPEN_WEEK = Array.from({ length: 7 }, () => ({ isClosed: false }))

/** A garage with everything done: no items at all. */
const ready = (overrides: Partial<ReadinessInput> = {}): ReadinessInput => ({
  dropinEnabled: true,
  doorstepEnabled: true,
  doorstepRadiusKm: 8,
  hasDoorstepArea: false,
  lat: 13.0827,
  lng: 80.2707,
  geoConfirmedAt: new Date('2026-10-01T04:30:00Z'),
  logoUrl: 'https://cdn.example/logo.webp',
  bays: 2,
  vehicleTypes: ['Hatchback', 'Sedan', 'SUV / MUV'],
  photoCount: 3,
  services: [{ description: 'Foam wash, rinse and dry.' }],
  workingHours: OPEN_WEEK,
  ...overrides,
})

const keys = (input: ReadinessInput) => vendorReadiness(input).map((item) => item.key)
const item = (input: ReadinessInput, key: string) =>
  vendorReadiness(input).find((i) => i.key === key)

describe('vendorReadiness', () => {
  test('a garage with everything done has nothing on its list', () => {
    expect(vendorReadiness(ready())).toEqual([])
  })

  test('no services blocks, and the row opens the Services tab', () => {
    expect(item(ready({ services: [] }), 'no_services')).toEqual({
      key: 'no_services',
      severity: 'blocking',
      label: 'No services',
      detail: 'Nothing for customers to book',
      short: 'services',
      tab: 'services',
    })
  })

  test('neither drop-in nor doorstep switched on blocks', () => {
    const input = ready({ dropinEnabled: false, doorstepEnabled: false })
    expect(item(input, 'no_booking_type')?.severity).toBe('blocking')
    // Either one on is enough.
    expect(keys(ready({ dropinEnabled: false }))).not.toContain('no_booking_type')
    expect(keys(ready({ doorstepEnabled: false }))).not.toContain('no_booking_type')
  })

  test('no opening hours blocks: no rows, or closed every day of the week', () => {
    const none = item(ready({ workingHours: [] }), 'no_hours')
    expect(none?.severity).toBe('blocking')
    expect(none?.detail).toBe('No days set, so there are no times to book')

    const closedAllWeek = item(
      ready({ workingHours: Array.from({ length: 7 }, () => ({ isClosed: true })) }),
      'no_hours'
    )
    expect(closedAllWeek?.severity).toBe('blocking')
    expect(closedAllWeek?.detail).toBe('Closed every day, so there are no times to book')

    // One open day is enough to take a booking.
    const oneDay = [...Array.from({ length: 6 }, () => ({ isClosed: true })), { isClosed: false }]
    expect(keys(ready({ workingHours: oneDay }))).not.toContain('no_hours')
  })

  test('the map pin: missing, or there but not confirmed, is to fix on Location', () => {
    expect(item(ready({ lat: null, lng: null }), 'no_pin')).toMatchObject({
      severity: 'fix',
      label: 'No map pin',
      tab: 'location',
    })
    expect(item(ready({ geoConfirmedAt: null }), 'pin_unconfirmed')).toMatchObject({
      severity: 'fix',
      label: 'Map pin not confirmed',
      tab: 'location',
    })
    // Never both: an unpinned garage has nothing to confirm.
    expect(keys(ready({ lat: null, lng: null, geoConfirmedAt: null }))).toEqual(['no_pin'])
  })

  test('services without a description are counted, blank ones included', () => {
    const one = item(
      ready({ services: [{ description: 'Wash.' }, { description: null }] }),
      'no_descriptions'
    )
    expect(one).toMatchObject({ severity: 'fix', label: '1 service without a description', tab: 'services' })

    const two = item(
      ready({ services: [{ description: '   ' }, { description: null }, { description: 'Wash.' }] }),
      'no_descriptions'
    )
    expect(two?.label).toBe('2 services without a description')
  })

  test('car types: empty is to fix', () => {
    expect(item(ready({ vehicleTypes: [] }), 'no_vehicle_types')).toMatchObject({
      severity: 'fix',
      label: 'No car types',
      tab: 'operations',
    })
  })

  test('car types: the retired ones are named, whatever their case', () => {
    const retired = item(
      ready({ vehicleTypes: ['Hatchback', 'Luxury / Premium', 'electric (ev)'] }),
      'retired_vehicle_types'
    )
    expect(retired).toMatchObject({ severity: 'fix', label: 'Car types no longer offered', tab: 'operations' })
    expect(retired?.detail).toBe('Luxury / Premium, electric (ev)')
  })

  test('car types: lowercase and spacing are the same type, as the seeds store them', () => {
    expect(keys(ready({ vehicleTypes: ['hatchback', 'sedan', 'suv'] }))).toEqual([])
    expect(keys(ready({ vehicleTypes: ['HATCHBACK', ' Sedan ', 'suv/muv'] }))).toEqual([])
    expect(retiredVehicleTypes(['SUV / MUV', 'Commercial / Van'])).toEqual(['Commercial / Van'])
  })

  test('bays empty or 0 is to fix (read as one car at a time)', () => {
    expect(item(ready({ bays: null }), 'no_bays')?.severity).toBe('fix')
    expect(item(ready({ bays: 0 }), 'no_bays')?.severity).toBe('fix')
    expect(keys(ready({ bays: 1 }))).not.toContain('no_bays')
  })

  test('doorstep with no travel radius is only optional: the default is used', () => {
    expect(item(ready({ doorstepRadiusKm: null }), 'no_doorstep_radius')).toEqual({
      key: 'no_doorstep_radius',
      severity: 'optional',
      label: 'Doorstep on, no travel radius',
      detail: 'Default 10 km used',
      short: 'travel radius',
      tab: 'operations',
    })
    // Not when the garage drew its own area, which replaces the radius.
    expect(keys(ready({ doorstepRadiusKm: null, hasDoorstepArea: true }))).toEqual([])
    // Not when it doesn't go to customers at all.
    expect(keys(ready({ doorstepRadiusKm: null, doorstepEnabled: false }))).toEqual([])
  })

  test('no logo and no photos are optional, on Details', () => {
    expect(vendorReadiness(ready({ logoUrl: null, photoCount: 0 }))).toEqual([
      { key: 'no_logo', severity: 'optional', label: 'No logo', short: 'logo', tab: 'details' },
      { key: 'no_photos', severity: 'optional', label: 'No photos', short: 'photos', tab: 'details' },
    ])
  })

  test('items come blocking first, then fix, then optional', () => {
    const all = vendorReadiness({
      dropinEnabled: false,
      doorstepEnabled: false,
      doorstepRadiusKm: null,
      hasDoorstepArea: false,
      lat: null,
      lng: null,
      geoConfirmedAt: null,
      logoUrl: null,
      bays: null,
      vehicleTypes: [],
      photoCount: 0,
      services: [],
      workingHours: [],
    })
    expect(all.map((i) => i.severity)).toEqual([
      'blocking',
      'blocking',
      'blocking',
      'fix',
      'fix',
      'fix',
      'optional',
      'optional',
    ])
  })

  test('distance from Chennai is never flagged: a garage in another town is fine', () => {
    // Vellore, about 125 km out, as the Home hub's seeded garage is.
    expect(vendorReadiness(ready({ lat: 12.9165, lng: 79.1325 }))).toEqual([])
  })
})
