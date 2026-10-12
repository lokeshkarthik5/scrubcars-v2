import type { VehicleType } from '@repo/core/types'

/**
 * The car picture on Home's hero, by the car's pricing tier.
 *
 * Three matching pictures, a hatchback, a sedan and an SUV, made from free
 * Pexels photos with every badge, wheel logo and number plate removed (where
 * each came from and what was changed: apps/users/public/cars/SOURCES.md).
 * They are real cars with the brand taken off, so a brand or model name must
 * never be shown with them. `suv` also covers "SUV / MUV", which is one
 * pricing tier, so an MUV owner sees the SUV. An unknown or missing type gets
 * the owner's own sports-car picture, the one Home launched with.
 *
 * The owner is still reviewing the three pictures. To go back to the single
 * picture for every car, set CAR_PICTURES_BY_TYPE to false: nothing else
 * changes, and the hero draws it exactly as before. The Home e2e spec reads
 * this line from the file and checks whichever setting it finds, so keep it
 * as one `export const … = true|false` line.
 */
export const CAR_PICTURES_BY_TYPE = true

export interface CarPicture {
  /** The file a browser that ignores `srcSet` loads. */
  src: string
  /** The picture's widths, for the browser to choose from; null when there is one file. */
  srcSet: string | null
  /** How wide the hero draws it, so the browser picks the smallest file that is sharp. */
  sizes: string
  /** The file's own size, which the browser uses to hold its space before it loads. */
  width: number
  height: number
  /**
   * How the hero places it. 'body-type' pictures share one canvas with the
   * tyres on one line, so they are placed by that line; the default is
   * cropped tight to the car and placed by its top.
   */
  kind: 'body-type' | 'default'
}

export const CAR_DEFAULT_IMAGE = '/cars/car-default.webp'

/**
 * The owner's own photo. One file, served through next/image, which makes the
 * phone-sized copies itself; the hint is the hero's width, 92% of a phone
 * column and 400px at most.
 */
export const CAR_DEFAULT_PICTURE: CarPicture = {
  src: CAR_DEFAULT_IMAGE,
  srcSet: null,
  sizes: '(max-width: 428px) 92vw, 400px',
  width: 898,
  height: 262,
  kind: 'default',
}

/**
 * The hero draws a body-type picture 94% of the card's width, and never wider
 * than 352px (apps/users/app/globals.css, .car-hero__car--body-type). The
 * card is the screen less 16px each side, so 94% of it is 94vw - 30px, which
 * reaches 352px on a 406px-wide screen. Change the two together.
 */
const BODY_TYPE_SIZES = '(max-width: 406px) calc(94vw - 30px), 352px'

/**
 * Pre-encoded at two widths rather than sent through next/image: 1200px is
 * sharp on any phone (352px at 3x is 1056px), and 2400px is there for
 * screens denser than that. Both are 1200 × 432 in shape.
 */
function bodyTypePicture(name: 'hatchback' | 'sedan' | 'suv'): CarPicture {
  return {
    src: `/cars/car-${name}-1200.webp`,
    srcSet: `/cars/car-${name}-1200.webp 1200w, /cars/car-${name}-2400.webp 2400w`,
    sizes: BODY_TYPE_SIZES,
    width: 1200,
    height: 432,
    kind: 'body-type',
  }
}

const CAR_PICTURES: Record<VehicleType, CarPicture> = {
  hatchback: bodyTypePicture('hatchback'),
  sedan: bodyTypePicture('sedan'),
  suv: bodyTypePicture('suv'),
}

/** `byType` is the switch above; a parameter only so both settings can be tested. */
export function carImageFor(
  vehicleType: VehicleType | string | null | undefined,
  byType: boolean = CAR_PICTURES_BY_TYPE
): CarPicture {
  if (!byType) return CAR_DEFAULT_PICTURE
  // Own keys only: "constructor" is not a car type, whatever the prototype says.
  return vehicleType && Object.prototype.hasOwnProperty.call(CAR_PICTURES, vehicleType)
    ? CAR_PICTURES[vehicleType as VehicleType]
    : CAR_DEFAULT_PICTURE
}
