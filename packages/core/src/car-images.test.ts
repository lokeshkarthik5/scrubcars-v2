import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CAR_DEFAULT_IMAGE, CAR_DEFAULT_PICTURE, carImageFor } from './car-images'

const PUBLIC = join(import.meta.dir, '../../../apps/users/public')

describe('carImageFor', () => {
  test('each pricing tier has its own picture, at 1200 and 2400 wide', () => {
    expect(carImageFor('hatchback', true).srcSet).toBe(
      '/cars/car-hatchback-1200.webp 1200w, /cars/car-hatchback-2400.webp 2400w'
    )
    expect(carImageFor('sedan', true).srcSet).toBe('/cars/car-sedan-1200.webp 1200w, /cars/car-sedan-2400.webp 2400w')
    expect(carImageFor('suv', true).srcSet).toBe('/cars/car-suv-1200.webp 1200w, /cars/car-suv-2400.webp 2400w')
    for (const type of ['hatchback', 'sedan', 'suv'] as const) {
      const picture = carImageFor(type, true)
      expect(picture.src).toBe(`/cars/car-${type}-1200.webp`)
      expect(picture.kind).toBe('body-type')
      // The files' own shape, so the space held before load is the car's.
      expect([picture.width, picture.height]).toEqual([1200, 432])
      // The hero's width, never the whole screen: a phone fetches the 1200.
      expect(picture.sizes).toBe('(max-width: 406px) calc(94vw - 30px), 352px')
    }
  })

  test('"SUV / MUV" is one tier, so an MUV owner sees the SUV', () => {
    expect(carImageFor('suv', true).src).toBe('/cars/car-suv-1200.webp')
  })

  test("an unknown or missing type gets the owner's picture, never a broken one", () => {
    for (const type of [undefined, null, '', 'muv', 'SUV', 'constructor', '__proto__', 'toString']) {
      expect(carImageFor(type, true)).toBe(CAR_DEFAULT_PICTURE)
    }
    expect(CAR_DEFAULT_PICTURE).toEqual({
      src: CAR_DEFAULT_IMAGE,
      srcSet: null,
      sizes: '(max-width: 428px) 92vw, 400px',
      width: 898,
      height: 262,
      kind: 'default',
    })
    expect(CAR_DEFAULT_IMAGE).toBe('/cars/car-default.webp')
  })

  test('with the switch off, every car gets the one picture Home launched with', () => {
    for (const type of ['hatchback', 'sedan', 'suv', null] as const) {
      expect(carImageFor(type, false)).toBe(CAR_DEFAULT_PICTURE)
    }
  })

  // Whichever way the switch is set: flipping it must not need a test change.
  test('every file either setting can name is in the app', () => {
    const files = [CAR_DEFAULT_PICTURE.src]
    for (const type of ['hatchback', 'sedan', 'suv'] as const) {
      files.push(...carImageFor(type, true).srcSet!.split(', ').map((entry) => entry.split(' ')[0]))
    }
    for (const file of files) {
      expect(existsSync(join(PUBLIC, file)), file).toBe(true)
    }
  })
})
