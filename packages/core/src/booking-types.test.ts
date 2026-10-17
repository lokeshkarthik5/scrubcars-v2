import { describe, expect, test } from 'bun:test'
import {
  bookingTypeParam,
  offeredBookingTypes,
  parseBookingType,
  resolveBookingType,
} from './booking-types'

const garage = (dropin: boolean, doorstep: boolean, pickup?: boolean) => ({
  dropinEnabled: dropin,
  doorstepEnabled: doorstep,
  ...(pickup === undefined ? {} : { pickupEnabled: pickup }),
})

describe('parseBookingType', () => {
  test('reads all three modes, pickup & drop included', () => {
    expect(parseBookingType('dropin')).toBe('dropin')
    expect(parseBookingType('doorstep')).toBe('doorstep')
    expect(parseBookingType('pickup')).toBe('pickup')
  })

  test('anything else is no choice made', () => {
    expect(parseBookingType(null)).toBeNull()
    expect(parseBookingType(undefined)).toBeNull()
    expect(parseBookingType('Pickup')).toBeNull()
    expect(parseBookingType(['pickup'])).toBeNull()
  })

  test('round-trips with bookingTypeParam', () => {
    for (const type of ['doorstep', 'pickup'] as const) {
      expect(parseBookingType(bookingTypeParam(type))).toBe(type)
    }
    // At the garage is the default and travels as nothing.
    expect(bookingTypeParam('dropin')).toBeNull()
  })
})

describe('offeredBookingTypes', () => {
  test('in switch order', () => {
    expect(offeredBookingTypes(garage(true, true, true))).toEqual(['dropin', 'doorstep', 'pickup'])
    expect(offeredBookingTypes(garage(true, false, true))).toEqual(['dropin', 'pickup'])
    expect(offeredBookingTypes(garage(false, false, true))).toEqual(['pickup'])
  })

  test('a server older than pickup & drop sends no flag: off', () => {
    expect(offeredBookingTypes(garage(true, true))).toEqual(['dropin', 'doorstep'])
  })
})

describe('resolveBookingType', () => {
  test('pickup & drop is honoured where the garage offers it', () => {
    expect(resolveBookingType('pickup', garage(true, false, true))).toBe('pickup')
  })

  test('and falls back where it does not', () => {
    expect(resolveBookingType('pickup', garage(true, true, false))).toBe('dropin')
    expect(resolveBookingType('pickup', garage(false, true))).toBe('doorstep')
  })

  test('a garage that only collects is pickup & drop whatever was asked', () => {
    expect(resolveBookingType(null, garage(false, false, true))).toBe('pickup')
    expect(resolveBookingType('doorstep', garage(false, false, true))).toBe('pickup')
  })

  test('before the garage loads, the choice stands', () => {
    expect(resolveBookingType('pickup', null)).toBe('pickup')
    expect(resolveBookingType(null, null)).toBe('dropin')
  })

  test('drop-in and doorstep as before', () => {
    expect(resolveBookingType(null, garage(true, true))).toBe('dropin')
    expect(resolveBookingType('doorstep', garage(true, false))).toBe('dropin')
    expect(resolveBookingType('dropin', garage(false, true))).toBe('doorstep')
  })
})
