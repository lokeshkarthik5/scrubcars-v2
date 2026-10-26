import { describe, expect, test } from 'bun:test'
import { garageAreaName, nearestLocality } from './localities'

describe('coverage gaps in words', () => {
  test('a cell is named by the area it is in, or how far it is from the nearest', () => {
    expect(nearestLocality(12.98, 80.22)).toBe('Near Velachery')
    expect(nearestLocality(13.007, 80.255)).toBe('Near Adyar')
    // Out past Tambaram, towards Vandalur.
    expect(nearestLocality(12.88, 80.08)).toBe('5 km from Tambaram')
  })
})

describe("a garage's area", () => {
  test('the neighbourhood its pin is in, else its city', () => {
    expect(garageAreaName({ city: 'Chennai', lat: 13.007, lng: 80.255 })).toBe(
      'Adyar'
    )
    expect(garageAreaName({ city: 'Chennai', lat: null, lng: null })).toBe(
      'Chennai'
    )
    expect(
      garageAreaName({
        city: 'Vellore',
        lat: 13.007,
        lng: 80.255,
        outsideServiceCity: true,
      })
    ).toBe('Vellore')
  })
})
