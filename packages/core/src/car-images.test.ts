import { describe, expect, test } from 'bun:test'
import { CAR_DEFAULT_IMAGE, carImageFor } from './car-images'

describe('carImageFor', () => {
  test('every pricing tier has a picture: the approved stand-in until the renders land', () => {
    for (const type of ['hatchback', 'sedan', 'suv'] as const) {
      expect(carImageFor(type)).toBe(CAR_DEFAULT_IMAGE)
    }
    expect(CAR_DEFAULT_IMAGE).toBe('/cars/car-default.webp')
  })

  test("an unknown or missing type gets the sedan's picture, never a broken one", () => {
    expect(carImageFor(undefined)).toBe(carImageFor('sedan'))
    expect(carImageFor(null)).toBe(carImageFor('sedan'))
    expect(carImageFor('muv')).toBe(carImageFor('sedan'))
    expect(carImageFor('')).toBe(carImageFor('sedan'))
    expect(carImageFor('constructor')).toBe(carImageFor('sedan'))
  })
})
