/**
 * Job photo standards (0045), as the three apps show them: the guided
 * angles, the numbers, the garage's gate words and the before/after pairs.
 * Twin of apps/server/src/lib/job-photo-standards.ts, which decides; the
 * server's job-photo-standards.parity.test.ts keeps the two the same. Pure.
 */

import type { JobPhoto } from '@repo/core/types'

export const PHOTO_ANGLES = ['front', 'back', 'left', 'right', 'interior'] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]

export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left side',
  right: 'Right side',
  interior: 'Interior',
}

/** The garage's photos a stage needs before the job moves past it. */
export const MIN_GARAGE_PHOTOS = 2

/** The customer's own photos per stage. */
export const MAX_CUSTOMER_PHOTOS_PER_STAGE = 4

/** How long after completion the customer can add their after photos. */
export const CUSTOMER_AFTER_WINDOW_HOURS = 24

/** How long after completion the garage can still add after photos. */
export const GARAGE_AFTER_GRACE_MINUTES = 60

export type PhotoStage = JobPhoto['stage']

export interface PhotoGateRefusal {
  stage: PhotoStage
  missing: number
}

/** "Add 2 before photos to start." / "Add 1 more after photo to complete." */
export function photoGateMessage(refusal: PhotoGateRefusal): string {
  const more = refusal.missing < MIN_GARAGE_PHOTOS ? ' more' : ''
  const noun = refusal.missing === 1 ? 'photo' : 'photos'
  const verb = refusal.stage === 'before' ? 'start' : 'complete'
  return `Add ${refusal.missing}${more} ${refusal.stage} ${noun} to ${verb}.`
}

/** "Front", or "Extra" for a photo with no angle. */
export function angleLabel(angle: PhotoAngle | null | undefined): string {
  return angle ? PHOTO_ANGLE_LABELS[angle] : 'Extra'
}

/** One side's photos of one stage, oldest first as they arrive. */
export function photosOf(
  photos: readonly JobPhoto[],
  by: JobPhoto['by'],
  stage: PhotoStage
): JobPhoto[] {
  return photos.filter((photo) => photo.by === by && photo.stage === stage)
}

/**
 * The guided checklist for one side and stage: each angle with the latest
 * photo taken from it (or null), in the order the garage walks round a car.
 */
export function angleSlots(
  photos: readonly JobPhoto[],
  by: JobPhoto['by'],
  stage: PhotoStage
): Array<{ angle: PhotoAngle; photo: JobPhoto | null }> {
  const ofStage = photosOf(photos, by, stage)
  return PHOTO_ANGLES.map((angle) => ({
    angle,
    photo: [...ofStage].reverse().find((photo) => photo.angle === angle) ?? null,
  }))
}

/** One side's photos of a stage that no checklist slot shows (extras, repeats). */
export function extraPhotos(
  photos: readonly JobPhoto[],
  by: JobPhoto['by'],
  stage: PhotoStage
): JobPhoto[] {
  const shown = new Set(
    angleSlots(photos, by, stage)
      .map((slot) => slot.photo?.id)
      .filter(Boolean)
  )
  return photosOf(photos, by, stage).filter((photo) => !shown.has(photo.id))
}

export interface BeforeAfterPair {
  angle: PhotoAngle
  before: JobPhoto
  after: JobPhoto
}

/**
 * Before and after photos of the same angle, for the comparison view: the
 * garage's where it has both, otherwise the customer's own, otherwise one of
 * each side's. Angles with only one stage are left out.
 */
export function beforeAfterPairs(photos: readonly JobPhoto[]): BeforeAfterPair[] {
  const latest = (by: JobPhoto['by'], stage: PhotoStage, angle: PhotoAngle) =>
    [...photos].reverse().find((p) => p.by === by && p.stage === stage && p.angle === angle) ?? null
  const pairs: BeforeAfterPair[] = []
  for (const angle of PHOTO_ANGLES) {
    const garage = { before: latest('garage', 'before', angle), after: latest('garage', 'after', angle) }
    const customer = { before: latest('customer', 'before', angle), after: latest('customer', 'after', angle) }
    const before = garage.before && garage.after ? garage.before : customer.before && customer.after ? customer.before : (garage.before ?? customer.before)
    const after = garage.before && garage.after ? garage.after : customer.before && customer.after ? customer.after : (garage.after ?? customer.after)
    if (before && after) pairs.push({ angle, before, after })
  }
  return pairs
}

/** Who took a photo, in admin's and the portal's words. */
export function photoByLabel(by: JobPhoto['by']): string {
  return by === 'customer' ? 'Customer' : 'Garage'
}
