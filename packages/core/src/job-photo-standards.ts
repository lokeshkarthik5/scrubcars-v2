/**
 * Job photo standards (0045), as the three apps show them: the guided
 * angles, the numbers, the garage's gate words and the before/after pairs.
 * Twin of apps/server/src/lib/job-photo-standards.ts, which decides; the
 * server's job-photo-standards.parity.test.ts keeps the two the same. Pure.
 */

import type { JobPhoto, JobPhotoAngle } from '@repo/core/types'
import { msg, t } from './i18n/translate'

export type { JobPhotoAngle } from '@repo/core/types'

export const PHOTO_ANGLES = ['front', 'back', 'left', 'right', 'interior'] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]

export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: msg('Front'),
  back: msg('Back'),
  left: msg('Left side'),
  right: msg('Right side'),
  interior: msg('Interior'),
}

/** The car condition check's corners (0075), garage photos only. */
export const CORNER_ANGLES = ['front_left', 'front_right', 'back_left', 'back_right'] as const
export type CornerAngle = (typeof CORNER_ANGLES)[number]

export const CORNER_ANGLE_LABELS: Record<CornerAngle, string> = {
  front_left: msg('Front left'),
  front_right: msg('Front right'),
  back_left: msg('Back left'),
  back_right: msg('Back right'),
}

/** Every angle's words, the corners included. */
export const JOB_PHOTO_ANGLE_LABELS: Record<JobPhotoAngle, string> = {
  ...PHOTO_ANGLE_LABELS,
  ...CORNER_ANGLE_LABELS,
}

/** Every angle a photo can carry, in walk-round order. */
export const JOB_PHOTO_ANGLES = [...PHOTO_ANGLES, ...CORNER_ANGLES] as const

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
  const more = refusal.missing < MIN_GARAGE_PHOTOS
  const one = refusal.missing === 1
  // Every shape spelled out, so each is one key to translate.
  const sentence =
    refusal.stage === 'before'
      ? more
        ? one
          ? msg('Add {count} more before photo to start.')
          : msg('Add {count} more before photos to start.')
        : one
          ? msg('Add {count} before photo to start.')
          : msg('Add {count} before photos to start.')
      : more
        ? one
          ? msg('Add {count} more after photo to complete.')
          : msg('Add {count} more after photos to complete.')
        : one
          ? msg('Add {count} after photo to complete.')
          : msg('Add {count} after photos to complete.')
  return t(sentence, { count: refusal.missing })
}

/** "Front" (or "Front left"), or "Extra" for a photo with no angle. */
export function angleLabel(angle: JobPhotoAngle | null | undefined): string {
  return angle ? t(JOB_PHOTO_ANGLE_LABELS[angle]) : t('Extra')
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
export function angleSlots<A extends JobPhotoAngle = PhotoAngle>(
  photos: readonly JobPhoto[],
  by: JobPhoto['by'],
  stage: PhotoStage,
  // The car condition check's eight (0075) where it is on; the five otherwise.
  angles: readonly A[] = PHOTO_ANGLES as unknown as readonly A[]
): Array<{ angle: A; photo: JobPhoto | null }> {
  const ofStage = photosOf(photos, by, stage)
  return angles.map((angle) => ({
    angle,
    photo: [...ofStage].reverse().find((photo) => photo.angle === angle) ?? null,
  }))
}

/** One side's photos of a stage that no checklist slot shows (extras, repeats). */
export function extraPhotos(
  photos: readonly JobPhoto[],
  by: JobPhoto['by'],
  stage: PhotoStage,
  angles: readonly JobPhotoAngle[] = PHOTO_ANGLES
): JobPhoto[] {
  const shown = new Set(
    angleSlots(photos, by, stage, angles)
      .map((slot) => slot.photo?.id)
      .filter(Boolean)
  )
  return photosOf(photos, by, stage).filter((photo) => !shown.has(photo.id))
}

export interface BeforeAfterPair {
  angle: JobPhotoAngle
  before: JobPhoto
  after: JobPhoto
}

/**
 * Before and after photos of the same angle, for the comparison view: the
 * garage's where it has both, otherwise the customer's own, otherwise one of
 * each side's. Angles with only one stage are left out.
 */
export function beforeAfterPairs(photos: readonly JobPhoto[]): BeforeAfterPair[] {
  const latest = (by: JobPhoto['by'], stage: PhotoStage, angle: JobPhotoAngle) =>
    [...photos].reverse().find((p) => p.by === by && p.stage === stage && p.angle === angle) ?? null
  const pairs: BeforeAfterPair[] = []
  for (const angle of JOB_PHOTO_ANGLES) {
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
