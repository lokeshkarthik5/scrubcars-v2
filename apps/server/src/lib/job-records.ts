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

export type JobPhotoStage = 'before' | 'after'

/**
 * Enough to show a car from every side; more is a gallery, not a record.
 * Mirrored in packages/core/src/job-records.ts MAX_JOB_PHOTOS_PER_STAGE.
 */
export const MAX_PHOTOS_PER_STAGE = 6

/**
 * How long after completion photos can still be added or removed. Mirrored
 * in packages/core/src/job-records.ts (the legal pages print it).
 */
export const PHOTO_EDIT_WINDOW_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** The statuses from which each stage can be photographed. */
const STAGE_OPENS: Record<JobPhotoStage, ReadonlySet<string>> = {
  // From the moment the garage accepts: the car is often checked in before
  // anyone presses Start.
  before: new Set(['confirmed', 'in_progress', 'completed']),
  // Only once the work has started.
  after: new Set(['in_progress', 'completed']),
}

/** Why a photo cannot be added or removed right now. */
export type PhotoRefusal =
  /** The job has not reached this stage yet (an "after" on a confirmed job). */
  | 'stage_not_open'
  /** The booking was cancelled, moved, or never accepted. */
  | 'booking_closed'
  /** Finished more than a week ago: the record is closed. */
  | 'window_closed'

/**
 * Whether a photo of `stage` can be added to (or removed from) a job now.
 *
 * `completedAt` is null on jobs finished before completion times were
 * recorded; the scheduled time stands in for it, which is earlier than the
 * real finish and so closes the window sooner rather than later.
 */
export function photoChangeRefusal(input: {
  stage: JobPhotoStage
  status: string
  completedAt: Date | null
  scheduledAt: Date
  now: number
}): PhotoRefusal | null {
  if (!STAGE_OPENS.before.has(input.status)) return 'booking_closed'
  if (!STAGE_OPENS[input.stage].has(input.status)) return 'stage_not_open'

  if (input.status === 'completed') {
    const finished = (input.completedAt ?? input.scheduledAt).getTime()
    if (input.now - finished > PHOTO_EDIT_WINDOW_DAYS * DAY_MS) return 'window_closed'
  }

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

/** The folder (under the garage's prefix in R2) a job's photos are uploaded to. */
export function jobPhotoFolder(bookingId: string): string {
  return `job-photos/${bookingId}`
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UPLOADED_NAME = new RegExp(`^${UUID}\\.(jpg|png|webp)$`)

/**
 * Whether a storage key is one createPresignedUpload could have minted for
 * this garage and this job: exactly vendors/<vendorId>/job-photos/<bookingId>/
 * <uuid>.<ext>. A key from another job, another garage or anywhere else in
 * the bucket is refused, so a photo can never be "recorded" from someone
 * else's upload.
 */
export function isJobPhotoKey(key: string, vendorId: string, bookingId: string): boolean {
  const prefix = `vendors/${vendorId}/${jobPhotoFolder(bookingId)}/`
  if (!key.startsWith(prefix)) return false
  return UPLOADED_NAME.test(key.slice(prefix.length))
}

/** A job photo as every app receives it. The storage key stays server-side. */
export function toJobPhotoView(photo: {
  id: string
  stage: JobPhotoStage
  url: string
  createdAt: Date
}) {
  return {
    id: photo.id,
    stage: photo.stage,
    url: photo.url,
    createdAt: photo.createdAt.toISOString(),
  }
}
