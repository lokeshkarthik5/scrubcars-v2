import { describe, expect, test } from 'bun:test'
import { CITY_REACH_KM, listScope } from './discovery.js'

describe('listScope', () => {
  test('a located customer gets every garage, nearest first, with no cut-off, then the unpinned (0062)', () => {
    expect(CITY_REACH_KM).toBe(50)
    expect(listScope({ hasOrigin: true })).toEqual({ radiusKm: null, includeUnlocated: true })
    expect(listScope({ hasOrigin: true, bookingType: 'dropin' })).toEqual({
      radiusKm: null,
      includeUnlocated: true,
    })
  })

  test('one radius, never a ladder: an explicit radius is kept as asked', () => {
    expect(listScope({ hasOrigin: true, radiusKm: 10 }).radiusKm).toBe(10)
    expect(listScope({ hasOrigin: true, radiusKm: 50 }).radiusKm).toBe(50)
  })

  test('without a location there is nothing to measure from', () => {
    expect(listScope({ hasOrigin: false })).toEqual({ radiusKm: null, includeUnlocated: true })
    expect(listScope({ hasOrigin: false, radiusKm: 10 }).radiusKm).toBeNull()
  })

  test('a typed search has no radius, so a garage is found by its name wherever it is', () => {
    expect(listScope({ hasOrigin: true, q: 'Sivakasi' })).toEqual({
      radiusKm: null,
      includeUnlocated: true,
    })
  })

  test('the map is bounded by its viewport and never lists unpinned garages', () => {
    expect(listScope({ hasOrigin: true, bbox: { minLng: 80 } })).toEqual({
      radiusKm: null,
      includeUnlocated: false,
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
    })
    // Without a location too: an unpinned garage cannot take a doorstep
    // booking from anyone.
    expect(listScope({ hasOrigin: false, bookingType: 'doorstep' }).includeUnlocated).toBe(false)
  })

  test('pickup & drop is bounded like doorstep: by each garage, pinned ones only', () => {
    expect(listScope({ hasOrigin: true, bookingType: 'pickup' })).toEqual({
      radiusKm: null,
      includeUnlocated: false,
    })
    expect(listScope({ hasOrigin: false, bookingType: 'pickup' }).includeUnlocated).toBe(false)
  })

  test('the map view can ask for nearby mode: the radius it sends, no unpinned garages', () => {
    expect(listScope({ hasOrigin: true, includeUnlocated: false, radiusKm: CITY_REACH_KM })).toEqual({
      radiusKm: 50,
      includeUnlocated: false,
    })
  })
})
