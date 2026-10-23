/**
 * Photo standards for every job (0045, owner decision 18 Oct 2026: "before/
 * after picture upload during the job from the customer and the vendor —
 * helps us preserve standards"). Pure and clock-free, so each rule is a
 * one-line test. The storage-level rules (folders, the per-stage cap, the
 * week-long freeze) stay in lib/job-records.ts; this file says what a job
 * needs before it may move on, and when the customer may add their own.
 *
 * Words and numbers the apps print are twinned in
 * packages/core/src/job-photo-standards.ts (job-photo-standards.parity.test.ts).
 *
 *  - **The garage's standard (enforced).** Start needs at least
 *    MIN_GARAGE_PHOTOS before photos from the garage; Complete (and, for
 *    pickup & drop, Out for delivery and Delivered) at least that many after
 *    photos. On unless JOB_PHOTOS_REQUIRED=off; a garage listed in
 *    JOB_PHOTOS_REQUIRED_GARAGES has it on whatever the switch says. Admin
 *    can waive it on one booking, with a reason and a name.
 *  - **The customer's photos (optional).** Up to
 *    MAX_CUSTOMER_PHOTOS_PER_STAGE before photos from booking until the work
 *    starts (pickup & drop: until the car is collected), and as many after
 *    photos within CUSTOMER_AFTER_WINDOW_HOURS of completion.
 */

import { photoChangeRefusal, type JobPhotoStage } from './job-records.js'

// The garage's after-photo grace (no late fabrication) lives with the
// storage rules it tightens; re-exported here with the rest of the standard.
export { GARAGE_AFTER_GRACE_MINUTES, garageAfterPhotoTooLate } from './job-records.js'

/** Who added a photo. Text + CHECK in 0045; every row before it is the garage's. */
export const PHOTO_ROLES = ['garage', 'customer'] as const
export type PhotoRole = (typeof PHOTO_ROLES)[number]

/**
 * The guided angles, in the order the checklist shows them. Text + CHECK in
 * 0045; null is a photo with no angle (an extra, or one from before 0045).
 */
export const PHOTO_ANGLES = ['front', 'back', 'left', 'right', 'interior'] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]

export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left side',
  right: 'Right side',
  interior: 'Interior',
}

export function isPhotoAngle(value: unknown): value is PhotoAngle {
  return typeof value === 'string' && (PHOTO_ANGLES as readonly string[]).includes(value)
}

/** The garage's photos a stage needs before the job moves past it. */
export const MIN_GARAGE_PHOTOS = 2

/** The customer's own photos per stage: enough for four corners. */
export const MAX_CUSTOMER_PHOTOS_PER_STAGE = 4

/** How long after completion the customer can add their after photos. */
export const CUSTOMER_AFTER_WINDOW_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

// ─── Whether the standard applies ────────────────────────────────────────────

export interface PhotoRequirementSetting {
  /** JOB_PHOTOS_REQUIRED: on unless set to exactly `off`. */
  required: boolean
  /** JOB_PHOTOS_REQUIRED_GARAGES: garages it is on for whatever the switch says. */
  garages: ReadonlySet<string>
}

/**
 * JOB_PHOTOS_REQUIRED: off unless it says `on` (any case, spaces trimmed).
 * Off by default for the pilot (owner decision, 18 Oct 2026): garages are
 * nudged, not blocked, while they learn the habit; JOB_PHOTOS_REQUIRED_GARAGES
 * turns it on garage by garage, and `on` for everyone once most are there.
 */
export function parsePhotosRequired(raw: string | undefined): boolean {
  return (raw ?? '').trim().toLowerCase() === 'on'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * JOB_PHOTOS_REQUIRED_GARAGES: garage ids, comma separated, that keep the
 * standard while JOB_PHOTOS_REQUIRED is off (a garage-by-garage roll-out, and
 * how the E2E suite turns it on for its own garage only). Anything that is
 * not an id is ignored.
 */
export function parseRequiredGarages(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => UUID.test(part))
  )
}

/** Whether a garage's jobs need their photos to move on. */
export function photosRequiredFor(vendorId: string, setting: PhotoRequirementSetting): boolean {
  return setting.required || setting.garages.has(vendorId.toLowerCase())
}

// ─── The gates ───────────────────────────────────────────────────────────────

/**
 * A step the standard guards. `start`: Mark in progress (pickup & drop's
 * start work too). `finish`: Mark completed, and pickup & drop's Out for
 * delivery and Delivered (the car must not leave without its after photos).
 */
export type PhotoGateStep = 'start' | 'finish'

/** The stage of photos each step needs. */
export const GATE_STAGE: Record<PhotoGateStep, JobPhotoStage> = {
  start: 'before',
  finish: 'after',
}

export interface PhotoGateRefusal {
  stage: JobPhotoStage
  /** How many more of the garage's photos of that stage are needed. */
  missing: number
}

/**
 * Why a job cannot take `step` yet, or null when it can: the standard is on
 * for its garage, not waived on this booking, and the garage has fewer than
 * MIN_GARAGE_PHOTOS of the stage. Only the garage's photos count: the
 * customer's are their own record, not the garage's work.
 */
export function photoGateRefusal(input: {
  step: PhotoGateStep
  required: boolean
  waived: boolean
  garagePhotoCount: number
}): PhotoGateRefusal | null {
  if (!input.required || input.waived) return null
  const missing = MIN_GARAGE_PHOTOS - input.garagePhotoCount
  return missing > 0 ? { stage: GATE_STAGE[input.step], missing } : null
}

/**
 * The garage's words for a refusal: "Add 2 before photos to start." or "Add
 * 1 more after photo to complete." Mirrored in packages/core
 * (photoGateMessage), which the portal shows beside the button.
 */
export function photoGateMessage(refusal: PhotoGateRefusal): string {
  const more = refusal.missing < MIN_GARAGE_PHOTOS ? ' more' : ''
  const noun = refusal.missing === 1 ? 'photo' : 'photos'
  const verb = refusal.stage === 'before' ? 'start' : 'complete'
  return `Add ${refusal.missing}${more} ${refusal.stage} ${noun} to ${verb}.`
}

/**
 * Whether removing one of the garage's photos of `stage` would break a gate
 * the job has already passed: once started, its before photos may not drop
 * under the minimum; once finished (completed, or out for delivery), nor may
 * its after photos. False when the photo may go.
 */
export function photoRemovalBlocked(input: {
  stage: JobPhotoStage
  status: string
  outForDelivery: boolean
  required: boolean
  waived: boolean
  garagePhotoCount: number
}): boolean {
  if (!input.required || input.waived) return false
  const passed =
    input.stage === 'before'
      ? input.status === 'in_progress' || input.status === 'completed'
      : input.status === 'completed' || input.outForDelivery
  return passed && input.garagePhotoCount - 1 < MIN_GARAGE_PHOTOS
}

// ─── The customer's photos ───────────────────────────────────────────────────

/** Why the customer cannot add (or remove) one of their photos of a stage now. */
export type CustomerPhotoRefusal =
  /** Before photos: the work has started, or the car was collected. */
  | 'before_closed'
  /** After photos: the job is not completed yet. */
  | 'after_not_open'
  /** After photos: more than CUSTOMER_AFTER_WINDOW_HOURS since completion. */
  | 'after_closed'
  /** Cancelled, moved, or otherwise not going ahead. */
  | 'booking_closed'

const BEFORE_OPEN = new Set(['pending', 'confirmed'])

/**
 * Whether the customer may add a photo of `stage` now. Before photos from
 * booking until the work starts — for pickup & drop until the car is
 * collected, since the garage has it from then. After photos only once the
 * job is completed, for CUSTOMER_AFTER_WINDOW_HOURS (a job with no recorded
 * completion time has no window).
 */
export function customerPhotoRefusal(input: {
  stage: JobPhotoStage
  status: string
  bookingType: string
  pickedUpAt: Date | null
  completedAt: Date | null
  now: number
}): CustomerPhotoRefusal | null {
  if (input.status === 'cancelled') return 'booking_closed'

  if (input.stage === 'before') {
    if (!BEFORE_OPEN.has(input.status)) {
      return input.status === 'in_progress' || input.status === 'completed' ? 'before_closed' : 'booking_closed'
    }
    if (input.bookingType === 'pickup' && input.pickedUpAt) return 'before_closed'
    return null
  }

  if (input.status !== 'completed') {
    return BEFORE_OPEN.has(input.status) || input.status === 'in_progress' ? 'after_not_open' : 'booking_closed'
  }
  if (!input.completedAt) return 'after_closed'
  return input.now - input.completedAt.getTime() > CUSTOMER_AFTER_WINDOW_HOURS * HOUR_MS
    ? 'after_closed'
    : null
}

/** When the customer's after photos close: completion + 24 hours, or null. */
export function customerAfterClosesAt(completedAt: Date | null): Date | null {
  return completedAt ? new Date(completedAt.getTime() + CUSTOMER_AFTER_WINDOW_HOURS * HOUR_MS) : null
}

/** The customer's words for each refusal. */
export function customerPhotoRefusalMessage(refusal: CustomerPhotoRefusal): string {
  switch (refusal) {
    case 'before_closed':
      return 'Before photos can be added until the work on your car starts.'
    case 'after_not_open':
      return 'After photos can be added once the job is completed.'
    case 'after_closed':
      return `After photos can be added for ${CUSTOMER_AFTER_WINDOW_HOURS} hours after the job is completed.`
    case 'booking_closed':
      return "Photos can't be added to a booking that isn't going ahead."
  }
}

/**
 * Whether the garage sees the customer's own photos yet: once it has
 * accepted the job. A garage that is only being asked (or declined) has no
 * business with photos of the customer's car.
 */
export function garageSeesCustomerPhotos(job: { status: string; acceptedAt?: Date | null }): boolean {
  return job.acceptedAt != null || ['confirmed', 'in_progress', 'completed'].includes(job.status)
}

// ─── What each app is told ───────────────────────────────────────────────────

interface StandardPhoto {
  stage: JobPhotoStage
  uploadedByRole?: string | null
}

function countOf(photos: readonly StandardPhoto[], role: PhotoRole, stage: JobPhotoStage): number {
  return photos.filter((photo) => (photo.uploadedByRole ?? 'garage') === role && photo.stage === stage).length
}

/** The facts about a job the views below read. */
export interface PhotoStandardJob {
  status: string
  bookingType: string
  scheduledAt: Date
  completedAt: Date | null
  pickedUpAt?: Date | null
  outForDeliveryAt?: Date | null
  photosWaivedAt?: Date | null
  photos: readonly StandardPhoto[]
}

/**
 * The garage's view of a job's photo standard (`photoStandard` on the
 * garage's booking payload): how many of its photos each stage has, whether
 * it can still change them, and what Start and Complete wait for. The portal
 * shows this and never restates the rules.
 */
export function garagePhotoStandardView(job: PhotoStandardJob, required: boolean, now: number) {
  const waived = job.photosWaivedAt != null
  const before = countOf(job.photos, 'garage', 'before')
  const after = countOf(job.photos, 'garage', 'after')
  const canChange = (stage: JobPhotoStage) =>
    photoChangeRefusal({
      stage,
      status: job.status,
      completedAt: job.completedAt,
      scheduledAt: job.scheduledAt,
      now,
    }) === null
  return {
    required,
    waived,
    minimum: MIN_GARAGE_PHOTOS,
    before: { count: before, canChange: canChange('before') },
    after: { count: after, canChange: canChange('after') },
    startBlocked: photoGateRefusal({ step: 'start', required, waived, garagePhotoCount: before }),
    finishBlocked: photoGateRefusal({ step: 'finish', required, waived, garagePhotoCount: after }),
  }
}

/**
 * The customer's own photos on their booking page (`conditionPhotos`):
 * whether each stage is open to them now, how many they have added, and
 * when the after photos close.
 */
export function customerPhotoWindowsView(job: PhotoStandardJob, now: number) {
  const open = (stage: JobPhotoStage) =>
    customerPhotoRefusal({
      stage,
      status: job.status,
      bookingType: job.bookingType,
      pickedUpAt: job.pickedUpAt ?? null,
      completedAt: job.completedAt,
      now,
    }) === null
  return {
    max: MAX_CUSTOMER_PHOTOS_PER_STAGE,
    before: { open: open('before'), count: countOf(job.photos, 'customer', 'before') },
    after: {
      open: open('after'),
      count: countOf(job.photos, 'customer', 'after'),
      closesAt: customerAfterClosesAt(job.completedAt)?.toISOString() ?? null,
    },
  }
}
