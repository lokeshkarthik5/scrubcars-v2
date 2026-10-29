import { describe, expect, test } from 'bun:test'
import {
  atGarageReach,
  canCollectFrom,
  distanceBand,
  nextTabOffer,
  outsideLine,
  skipTheDriveTitle,
  type ReachFigures,
} from './reach'

const figures = (over: {
  nearestKm?: number | null
  doorstep?: number
  doorstepFrom?: number | null
  pickup?: number
  pickupFrom?: number | null
}): ReachFigures => ({
  dropin: { count: 3, nearestKm: over.nearestKm === undefined ? 2 : over.nearestKm },
  doorstep: { count: over.doorstep ?? 0, fromPrice: over.doorstepFrom ?? null },
  pickup: { count: over.pickup ?? 0, fromPrice: over.pickupFrom ?? null },
})

describe('distance bands', () => {
  test('under 5 km close, 5 to under 10 worth it, 10 and more far', () => {
    expect(distanceBand(0.4)).toBe('close')
    expect(distanceBand(4.99)).toBe('close')
    expect(distanceBand(5)).toBe('worth_it')
    expect(distanceBand(9.9)).toBe('worth_it')
    expect(distanceBand(10)).toBe('far')
    expect(distanceBand(42)).toBe('far')
  })

  test('nowhere to drive to counts as far', () => {
    expect(distanceBand(null)).toBe('far')
  })
})

describe('the At garage tab’s pieces', () => {
  test('far: Skip the drive with real counts, a row per way that has garages', () => {
    const reach = atGarageReach(figures({ nearestKm: 14, doorstep: 2, doorstepFrom: 349, pickup: 1 }), true)
    expect(reach.skipTheDrive).toEqual([
      { mode: 'doorstep', title: 'At your door', detail: '2 garages can come to your door · from ₹349' },
      { mode: 'pickup', title: 'We collect your car', detail: '1 garage picks up and drops back' },
    ])
    expect(reach.atHomeLine).toBe(false)
    expect(reach.nearestKm).toBe(14)
  })

  test('far, plural pickups, a price in the thousands', () => {
    const reach = atGarageReach(figures({ nearestKm: 12, doorstep: 1, doorstepFrom: 1499, pickup: 3 }), true)
    expect(reach.skipTheDrive?.map((row) => row.detail)).toEqual([
      '1 garage can come to your door · from ₹1,499',
      '3 garages pick up and drop back',
    ])
  })

  test('a row with no garages is left out; with none at all, no card', () => {
    expect(atGarageReach(figures({ nearestKm: 14, pickup: 2 }), true).skipTheDrive?.map((r) => r.mode)).toEqual([
      'pickup',
    ])
    expect(atGarageReach(figures({ nearestKm: 14 }), true).skipTheDrive).toBeNull()
  })

  test('5–10 km and a doorstep garage comes to them: the small line only', () => {
    const reach = atGarageReach(figures({ nearestKm: 6, doorstep: 1, pickup: 4 }), true)
    expect(reach.skipTheDrive).toBeNull()
    expect(reach.atHomeLine).toBe(true)
    expect(atGarageReach(figures({ nearestKm: 6, doorstep: 0, pickup: 4 }), true).atHomeLine).toBe(false)
  })

  test('close: nothing extra', () => {
    const reach = atGarageReach(figures({ nearestKm: 3, doorstep: 5, pickup: 5 }), true)
    expect(reach.skipTheDrive).toBeNull()
    expect(reach.atHomeLine).toBe(false)
  })

  test('without a location, or without the figures, nothing', () => {
    expect(atGarageReach(figures({ nearestKm: 14, doorstep: 2 }), false).skipTheDrive).toBeNull()
    expect(atGarageReach(null, true)).toEqual({ skipTheDrive: null, atHomeLine: false, nearestKm: null })
  })

  test('the title says how far, or that there is none to drive to', () => {
    expect(skipTheDriveTitle(14.4)).toBe('The nearest garage is 14 km away')
    expect(skipTheDriveTitle(null)).toBe('No garage to drive to near you yet')
  })
})

describe('the bottom of every tab', () => {
  test('At garage offers Doorstep, Doorstep offers Pickup & drop', () => {
    expect(nextTabOffer('dropin', figures({ doorstep: 1 }))).toEqual({
      mode: 'doorstep',
      label: 'Have it done at home',
    })
    expect(nextTabOffer('doorstep', figures({ pickup: 2 }))).toEqual({
      mode: 'pickup',
      label: 'We collect your car',
    })
  })

  test('a tab with no garages is never offered, nor anything without figures', () => {
    expect(nextTabOffer('dropin', figures({ doorstep: 0 }))).toBeNull()
    expect(nextTabOffer('doorstep', figures({ pickup: 0 }))).toBeNull()
    expect(nextTabOffer('pickup', figures({ doorstep: 3, pickup: 3 }))).toBeNull()
    expect(nextTabOffer('dropin', null)).toBeNull()
  })
})

describe('Can collect your car', () => {
  const garage = { pickupEnabled: true, lat: 13.0, lng: 80.25, pickupRadiusKm: 5 }
  test('inside its pickup radius from the customer’s location', () => {
    expect(canCollectFrom(garage, { lat: 13.02, lng: 80.25 })).toBe(true) // ~2.2 km
    expect(canCollectFrom(garage, { lat: 13.06, lng: 80.25 })).toBe(false) // ~6.7 km
  })

  test('the default 10 km when the garage left it empty', () => {
    expect(canCollectFrom({ ...garage, pickupRadiusKm: null }, { lat: 13.06, lng: 80.25 })).toBe(true)
  })

  test('never for a garage that does not collect, nor without a location or a pin', () => {
    expect(canCollectFrom({ ...garage, pickupEnabled: false }, { lat: 13.0, lng: 80.25 })).toBe(false)
    expect(canCollectFrom(garage, null)).toBe(false)
    expect(canCollectFrom({ ...garage, lat: null, lng: null }, { lat: 13.0, lng: 80.25 })).toBe(false)
  })
})

describe('a just-outside card’s line', () => {
  test('its radius and how far out', () => {
    expect(outsideLine(5, 3.9)).toBe('covers 5 km · 3.9 km outside')
    expect(outsideLine(10, 2)).toBe('covers 10 km · 2 km outside')
    expect(outsideLine(7.5, 0.1)).toBe('covers 7.5 km · 0.1 km outside')
  })

  test('a drawn area has no single radius', () => {
    expect(outsideLine(null, 3.9)).toBe('3.9 km outside its area')
  })
})
