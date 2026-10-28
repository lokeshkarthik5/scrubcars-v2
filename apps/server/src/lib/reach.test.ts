import { describe, expect, test } from 'bun:test'
import {
  isJustOutside,
  JUST_OUTSIDE_KM,
  listCarriesJustOutside,
  listCarriesReach,
  outsideByKm,
} from './reach.js'

describe('outside-radius maths', () => {
  test('how far past its reach the customer is, to one decimal', () => {
    // A garage covering 5 km, 8.9 km away: 3.9 km outside (the mockup's card).
    expect(outsideByKm(8.9, 5)).toBe(3.9)
    expect(outsideByKm(12, 10)).toBe(2)
    expect(outsideByKm(25.04, 10)).toBe(15)
  })

  test('never reads 0 km outside: a garage in this group does not cover the customer', () => {
    expect(outsideByKm(10.01, 10)).toBe(0.1)
    expect(outsideByKm(10, 10)).toBe(0.1)
  })

  test('just outside is more than 0 and at most 15 km past its reach', () => {
    expect(JUST_OUTSIDE_KM).toBe(15)
    expect(isJustOutside(0)).toBe(false)
    expect(isJustOutside(0.1)).toBe(true)
    expect(isJustOutside(15)).toBe(true)
    expect(isJustOutside(15.1)).toBe(false)
    expect(isJustOutside(Number.NaN)).toBe(false)
  })
})

describe('which lists carry the reach figures', () => {
  test('a list’s first page only, never a search or the map', () => {
    expect(listCarriesReach({})).toBe(true)
    expect(listCarriesReach({ cursor: 'abc' })).toBe(false)
    expect(listCarriesReach({ q: 'wash' })).toBe(false)
    expect(listCarriesReach({ bbox: { minLng: 1 } })).toBe(false)
  })

  test('the just-outside group: Doorstep or Pickup & drop, with a location, first page', () => {
    expect(listCarriesJustOutside({ bookingType: 'doorstep', hasOrigin: true })).toBe(true)
    expect(listCarriesJustOutside({ bookingType: 'pickup', hasOrigin: true })).toBe(true)
    expect(listCarriesJustOutside({ bookingType: 'dropin', hasOrigin: true })).toBe(false)
    expect(listCarriesJustOutside({ bookingType: 'doorstep', hasOrigin: false })).toBe(false)
    expect(listCarriesJustOutside({ bookingType: 'doorstep', hasOrigin: true, cursor: 'x' })).toBe(false)
    expect(listCarriesJustOutside({ hasOrigin: true })).toBe(false)
  })
})
