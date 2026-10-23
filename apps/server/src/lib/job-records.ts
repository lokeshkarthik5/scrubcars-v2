/**
 * The rules for a job's photos: which stage can be added when, how many, and
 * for how long afterwards. Pure and clock-free (the caller passes `now`), so
 * every rule is a one-line test.
 *
 * Photos are the garage's evidence if a customer later disputes the work — a
 * scratch that was already there, a panel that was polished. That is why they
 * are tied to the job's progress (an "after" photo before the work started
 * would be evidence of nothing) and why they freeze a week after the job is
 * done: a record either side can still rewrite months later proves little.
 */

import type { PhotoAngle, PhotoRole } from './job-photo-standards.js'

export type JobPhotoStage = 'before' | 'after'

/**
 * Enough to show a car from every side; more is a gallery, not a record.
 * Mirrored in packages/core/src/job-records.ts MAX_JOB_PHOTOS_PER_STAGE.
 */
export const MAX_PHOTOS_PER_STAGE = 6

/**
 * The outer bound of the record: nothing about a job's photos changes more
 * than this long after completion. Mirrored in packages/core/src/job-records.ts
 * (the legal pages print it). Since 0045 the garage's own windows are tighter
 * (before photos close at completion, after photos an hour after it;
 * lib/job-photo-standards.ts) and the customer's after photos close after 24
 * hours, all well inside it.
 */
export const PHOTO_EDIT_WINDOW_DAYS = 7

/**
 * How long after completion the garage can still add (or remove) after
 * photos: the car may be photographed in the bay a few minutes after Mark
 * completed, but an "after" photo added a day later could be of anything.
 */
export const GARAGE_AFTER_GRACE_MINUTES = 60

const MINUTE_MS = 60 * 1000

/**
 * The garage's late-fabrication rule: after photos can be added (or
 * removed) while the work is under way and up to GARAGE_AFTER_GRACE_MINUTES
 * after completion, never later. `completedAt` null (a job from before
 * completion times were kept) falls back to the slot, which closes sooner.
 */
export function garageAfterPhotoTooLate(input: {
  status: string
  completedAt: Date | null
  scheduledAt: Date
  now: number
}): boolean {
  if (input.status !== 'completed') return false
  const finished = (input.completedAt ?? input.scheduledAt).getTime()
  return input.now - finished > GARAGE_AFTER_GRACE_MINUTES * MINUTE_MS
}

/** The statuses from which each stage can be photographed by the garage. */
const STAGE_OPENS: Record<JobPhotoStage, ReadonlySet<string>> = {
  // From the moment the garage accepts: the car is often checked in before
  // anyone presses Start.
  before: new Set(['confirmed', 'in_progress']),
  // Only once the work has started.
  after: new Set(['in_progress', 'completed']),
}

const OPEN_STATUSES = new Set(['confirmed', 'in_progress', 'completed'])

/** Why the garage cannot add or remove a photo right now. */
export type PhotoRefusal =
  /** The job has not reached this stage yet (an "after" on a confirmed job). */
  | 'stage_not_open'
  /** The booking was cancelled, moved, or never accepted. */
  | 'booking_closed'
  /** A before photo of a completed job: the car is no longer as it came in. */
  | 'before_closed'
  /**
   * An after photo more than GARAGE_AFTER_GRACE_MINUTES after completion
   * (0045): an "after" taken a day later could be of anything.
   */
  | 'window_closed'

/**
 * Whether the garage may add (or remove) a photo of `stage` now.
 *
 * Before photos while the job is accepted or under way; after photos while
 * it is under way and for an hour after completion (0045, no late
 * fabrication). `completedAt` is null on jobs finished before completion
 * times were recorded; the scheduled time stands in for it, which is earlier
 * than the real finish and so closes the window sooner rather than later.
 */
export function photoChangeRefusal(input: {
  stage: JobPhotoStage
  status: string
  completedAt: Date | null
  scheduledAt: Date
  now: number
}): PhotoRefusal | null {
  if (!OPEN_STATUSES.has(input.status)) return 'booking_closed'
  if (input.stage === 'before' && input.status === 'completed') return 'before_closed'
  if (!STAGE_OPENS[input.stage].has(input.status)) return 'stage_not_open'
  if (garageAfterPhotoTooLate(input)) return 'window_closed'
  return null
}

/**
 * Whether the customer is shown the photos yet. Before photos can be taken
 * from acceptance, but the customer's page shows them once the work has
 * started, alongside the step that says so.
 */
export function customerSeesPhotos(status: string): boolean {
  return status === 'in_progress' || status === 'completed'
}

/**
 * The folder (under the garage's prefix in R2) a job's photos are uploaded
 * to. The customer's own (0045) go in a `customer/` folder inside it, so a
 * key says whose upload it was and neither side can record the other's.
 */
export function jobPhotoFolder(bookingId: string, role: PhotoRole = 'garage'): string {
  return role === 'customer' ? `job-photos/${bookingId}/customer` : `job-photos/${bookingId}`
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UPLOADED_NAME = new RegExp(`^${UUID}\\.(jpg|png|webp)$`)

/**
 * Whether a storage key is one createPresignedUpload could have minted for
 * this garage, this job and this side: exactly vendors/<vendorId>/job-photos/
 * <bookingId>/<uuid>.<ext> for the garage (and its extra-work photos), or
 * …/<bookingId>/customer/<uuid>.<ext> for the customer. A key from another
 * job, another garage, the other side or anywhere else in the bucket is
 * refused, so a photo can never be "recorded" from someone else's upload.
 */
export function isJobPhotoKey(
  key: string,
  vendorId: string,
  bookingId: string,
  role: PhotoRole = 'garage'
): boolean {
  const prefix = `vendors/${vendorId}/${jobPhotoFolder(bookingId, role)}/`
  if (!key.startsWith(prefix)) return false
  return UPLOADED_NAME.test(key.slice(prefix.length))
}

/**
 * A job photo as every app receives it: whose it is (`by`) and the angle it
 * was taken from, if one was chosen. The storage key and who exactly took it
 * stay server-side (admin reads the name separately).
 */
export function toJobPhotoView(photo: {
  id: string
  stage: JobPhotoStage
  url: string
  createdAt: Date
  angle?: string | null
  uploadedByRole?: string | null
}) {
  return {
    id: photo.id,
    stage: photo.stage,
    url: photo.url,
    createdAt: photo.createdAt.toISOString(),
    angle: (photo.angle ?? null) as PhotoAngle | null,
    by: (photo.uploadedByRole === 'customer' ? 'customer' : 'garage') as PhotoRole,
  }
}
