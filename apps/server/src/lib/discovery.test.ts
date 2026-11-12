import { describe, expect, test } from 'bun:test'
import { CITY_REACH_KM, FAR_LIMIT_KM, listScope } from './discovery.js'

describe('listScope', () => {
  test('a located customer gets every garage within 150 km, nearest first, then the unpinned (0062, 0070)', () => {
    expect(CITY_REACH_KM).toBe(50)
    expect(FAR_LIMIT_KM).toBe(150)
    expect(listScope({ hasOrigin: true })).toEqual({ radiusKm: null, includeUnlocated: true, farLimitKm: 150 })
    expect(listScope({ hasOrigin: true, bookingType: 'dropin' })).toEqual({
      radiusKm: null,
      includeUnlocated: true,
      farLimitKm: 150,
    })
  })

  test('a whole city picked: the 150 km limit from its centre, and still no radius (0070)', () => {
    expect(listScope({ hasOrigin: false, hasCityCentre: true, bookingType: 'dropin' })).toEqual({
      radiusKm: null,
      includeUnlocated: true,
      farLimitKm: 150,
    })
    // A typed search finds a garage anywhere, from a city as from a location.
    expect(listScope({ hasOrigin: false, hasCityCentre: true, q: 'Kovai' }).farLimitKm).toBeNull()
    expect(listScope({ hasOrigin: true, q: 'Kovai' }).farLimitKm).toBeNull()
    // Doorstep and pickup end at each garage's own reach already.
    expect(listScope({ hasOrigin: true, bookingType: 'doorstep' }).farLimitKm).toBeNull()
    expect(listScope({ hasOrigin: false, hasCityCentre: true, bookingType: 'pickup' }).farLimitKm).toBeNull()
    // The map is bounded by its viewport.
    expect(listScope({ hasOrigin: true, bbox: { minLng: 80 } }).farLimitKm).toBeNull()
  })

  test('one radius, never a ladder: an explicit radius is kept as asked', () => {
    expect(listScope({ hasOrigin: true, radiusKm: 10 }).radiusKm).toBe(10)
    expect(listScope({ hasOrigin: true, radiusKm: 50 }).radiusKm).toBe(50)
  })

  test('without a location there is nothing to measure from', () => {
    expect(listScope({ hasOrigin: false })).toEqual({ radiusKm: null, includeUnlocated: true, farLimitKm: null })
    expect(listScope({ hasOrigin: false, radiusKm: 10 }).radiusKm).toBeNull()
  })

  test('a typed search has no radius, so a garage is found by its name wherever it is', () => {
    expect(listScope({ hasOrigin: true, q: 'Sivakasi' })).toEqual({
      radiusKm: null,
      includeUnlocated: true,
      farLimitKm: null,
    })
  })

  test('the map is bounded by its viewport and never lists unpinned garages', () => {
    expect(listScope({ hasOrigin: true, bbox: { minLng: 80 } })).toEqual({
      radiusKm: null,
      includeUnlocated: false,
      farLimitKm: null,
    })
    // Even when the caller asks for them: the map cannot draw them.
    expect(
      listScope({ hasOrigin: true, bbox: { minLng: 80 }, includeUnlocated: true }).includeUnlocated
    ).toBe(false)
  })

  test('doorstep is bounded by each garage, and leaves out garages with no pin', () => {
    expect(listScope({ hasOrigin: true, bookingType: 'doorstep' })).toEqual({
      radiusKm: null,
      includeUnlocated: false,
      farLimitKm: null,
    })
    // Without a location too: an unpinned garage cannot take a doorstep
    // booking from anyone.
    expect(listScope({ hasOrigin: false, bookingType: 'doorstep' }).includeUnlocated).toBe(false)
  })

  test('pickup & drop is bounded like doorstep: by each garage, pinned ones only', () => {
    expect(listScope({ hasOrigin: true, bookingType: 'pickup' })).toEqual({
      radiusKm: null,
      includeUnlocated: false,
      farLimitKm: null,
    })
    expect(listScope({ hasOrigin: false, bookingType: 'pickup' }).includeUnlocated).toBe(false)
  })

  test('the map view can ask for nearby mode: the radius it sends, no unpinned garages', () => {
    expect(listScope({ hasOrigin: true, includeUnlocated: false, radiusKm: CITY_REACH_KM })).toEqual({
      radiusKm: 50,
      includeUnlocated: false,
      farLimitKm: 150,
    })
  })
})
