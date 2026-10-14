import type { VehicleType } from '@repo/core/types'

/**
 * The car picture on Home's hero, by the car's pricing tier.
 *
 * One approved cut-out stands in for every type until the three commissioned
 * renders arrive (a hatchback, a sedan and an SUV, one scene and camera so
 * they match; see the Home build plan, "Car pictures"). Then this map gains a
 * file per type, and nothing else changes: `suv` also covers "SUV / MUV",
 * which is one pricing tier, and an unknown or missing type falls back to the
 * sedan's picture.
 *
 * Served from apps/users/public/cars through next/image, which makes the
 * phone-sized copies itself, so there is one master per picture.
 */
export const CAR_DEFAULT_IMAGE = '/cars/car-default.webp'

const CAR_IMAGES: Record<VehicleType, string> = {
  hatchback: CAR_DEFAULT_IMAGE,
  sedan: CAR_DEFAULT_IMAGE,
  suv: CAR_DEFAULT_IMAGE,
}

export function carImageFor(vehicleType: VehicleType | string | null | undefined): string {
  // Own keys only: "constructor" is not a car type, whatever the prototype says.
  return vehicleType && Object.prototype.hasOwnProperty.call(CAR_IMAGES, vehicleType)
    ? CAR_IMAGES[vehicleType as VehicleType]
    : CAR_IMAGES.sedan
}
