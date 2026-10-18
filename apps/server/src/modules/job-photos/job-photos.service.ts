import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  GARAGE_AFTER_GRACE_MINUTES,
  MAX_CUSTOMER_PHOTOS_PER_STAGE,
  MIN_GARAGE_PHOTOS,
  customerPhotoRefusal,
  customerPhotoRefusalMessage,
  garageSeesCustomerPhotos,
  photoRemovalBlocked,
  photosRequiredFor,
  type PhotoRole,
} from '../../lib/job-photo-standards.js'
import {
  MAX_PHOTOS_PER_STAGE,
  isJobPhotoKey,
  jobPhotoFolder,
  photoChangeRefusal,
  toJobPhotoView,
  type JobPhotoStage,
  type PhotoRefusal,
} from '../../lib/job-records.js'
import {
  createJobPhotoUpload,
  jobPhotoLink,
  removeJobPhotoObjects,
  storedJobPhotoUrl,
} from '../../lib/job-photo-storage.js'
import { logger } from '../../lib/logger.js'
import { jobPhotosRepository } from './job-photos.repository.js'
import type {
  JobPhotoUploadUrlInput,
  RecordJobPhotoInput,
} from './job-photos.validation.js'

const log = logger.child({ module: 'job-photos' })

type Job = NonNullable<Awaited<ReturnType<typeof jobPhotosRepository.findJob>>>

/**
 * Whether a garage's jobs need their photos to move on (0045):
 * JOB_PHOTOS_REQUIRED (on unless `off`), or the garage listed in
 * JOB_PHOTOS_REQUIRED_GARAGES. The bookings service reads the same answer.
 */
export function jobPhotosRequiredFor(vendorId: string): boolean {
  return photosRequiredFor(vendorId, {
    required: env.jobPhotosRequired,
    garages: env.jobPhotosRequiredGarages,
  })
}

function jobNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

function photoNotFound() {
  return new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
}

/** The garage's words for each refusal, naming the stage it was about. */
function refusalError(refusal: PhotoRefusal, stage: JobPhotoStage) {
  switch (refusal) {
    case 'stage_not_open':
      return new AppError(
        400,
        'After photos can be added once the job has started.',
        'JOB_PHOTO_STAGE_NOT_OPEN'
      )
    case 'booking_closed':
      return new AppError(
        400,
        `${stage === 'before' ? 'Before' : 'After'} photos can be added once you've accepted the job, and not to a cancelled one.`,
        'JOB_NOT_OPEN_FOR_PHOTOS'
      )
    case 'before_closed':
      return new AppError(
        400,
        "Before photos can't be changed once the job is completed.",
        'JOB_PHOTO_WINDOW_CLOSED'
      )
    case 'window_closed':
      return new AppError(
        400,
        `After photos can be added or removed up to ${GARAGE_AFTER_GRACE_MINUTES} minutes after the job is completed.`,
        'JOB_PHOTO_WINDOW_CLOSED'
      )
  }
}

function limitReached(stage: JobPhotoStage, max: number) {
  return new AppError(
    409,
    `A job can have at most ${max} ${stage} photos from you. Remove one to add another.`,
    'JOB_PHOTO_LIMIT_REACHED'
  )
}

/**
 * The job, if it belongs to the active garage. `vendorId` comes from
 * resolveTenant; a job of any other garage is a 404, exactly like one that
 * does not exist.
 */
async function getJobForGarage(vendorId: string, bookingId: string) {
  const job = await jobPhotosRepository.findJob(bookingId)
  if (!job || job.vendorId !== vendorId) throw jobNotFound()
  return job
}

/**
 * The job, if it is this customer's own booking. `userId` is the session's;
 * anyone else's booking is a 404, exactly like one that does not exist.
 */
async function getJobForCustomer(userId: string, bookingId: string) {
  const job = await jobPhotosRepository.findJob(bookingId)
  if (!job || job.userId !== userId) throw jobNotFound()
  return job
}

function assertGarageCanChange(job: Job, stage: JobPhotoStage, now: number) {
  const refusal = photoChangeRefusal({
    stage,
    status: job.status,
    completedAt: job.completedAt,
    scheduledAt: job.scheduledAt,
    now,
  })
  if (refusal) throw refusalError(refusal, stage)
}

function assertCustomerCanChange(job: Job, stage: JobPhotoStage, now: number) {
  const refusal = customerPhotoRefusal({
    stage,
    status: job.status,
    bookingType: job.bookingType,
    pickedUpAt: job.pickedUpAt,
    completedAt: job.completedAt,
    now,
  })
  if (refusal) {
    throw new AppError(400, customerPhotoRefusalMessage(refusal), 'JOB_PHOTO_WINDOW_CLOSED')
  }
}

/** Each side's cap per stage. */
const MAX_FOR: Record<PhotoRole, number> = {
  garage: MAX_PHOTOS_PER_STAGE,
  customer: MAX_CUSTOMER_PHOTOS_PER_STAGE,
}

/**
 * The presign both sides share, into that side's folder of the job: the
 * private bucket while it is on (lib/job-photo-storage.ts). Only the key
 * comes back; the photo is seen through a signed link once recorded.
 */
async function uploadUrlFor(job: Job, role: PhotoRole, input: JobPhotoUploadUrlInput) {
  if ((await jobPhotosRepository.countPhotos(job.id, input.stage, role)) >= MAX_FOR[role]) {
    throw limitReached(input.stage, MAX_FOR[role])
  }
  return createJobPhotoUpload(job.vendorId, input.contentType, jobPhotoFolder(job.id, role))
}

/** A photo as its viewer gets it, with a short-lived link (never the key). */
function view(photo: Parameters<typeof toJobPhotoView>[0]) {
  return toJobPhotoView(photo, jobPhotoLink)
}

/** The record both sides share, by the key their upload went to. */
async function record(job: Job, role: PhotoRole, actorId: string, input: RecordJobPhotoInput) {
  if (!isJobPhotoKey(input.key, job.vendorId, job.id, role)) {
    throw new AppError(400, 'That upload is not for this job', 'INVALID_JOB_PHOTO_KEY')
  }

  // A retried request after a dropped answer: the photo is already there.
  // The key sits in this side's own folder, so it can only be this side's.
  const existing = await jobPhotosRepository.findPhotoByKey(job.id, input.key)
  if (existing) return view(existing)

  const created = await jobPhotosRepository.insertPhotoUnderCap(
    {
      bookingId: job.id,
      stage: input.stage,
      storageKey: input.key,
      // The key itself while photos are private; the public address if not.
      url: storedJobPhotoUrl(input.key),
      uploadedBy: actorId,
      uploadedByRole: role,
      angle: input.angle ?? null,
    },
    MAX_FOR[role]
  )
  if (!created) throw limitReached(input.stage, MAX_FOR[role])

  log.info(
    { bookingId: job.id, vendorId: job.vendorId, role, stage: input.stage, angle: created.angle, photoId: created.id },
    'job_photo:added'
  )
  return view(created)
}

export const jobPhotosService = {
  // ─── The garage (/vendors/me/bookings/:id/photos) ─────────────────────────

  /**
   * Every photo of the job: the garage's own and, once it has accepted the
   * job, the customer's too (one shared record).
   */
  async listPhotos(vendorId: string, bookingId: string) {
    const job = await getJobForGarage(vendorId, bookingId)
    const photos = await jobPhotosRepository.listPhotos(job.id)
    const theirs = garageSeesCustomerPhotos(job)
    return photos.filter((photo) => photo.uploadedByRole !== 'customer' || theirs).map(view)
  },

  /**
   * A presigned upload into this job's folder. Refused up front when the
   * photo could not be recorded anyway, so nobody uploads into a dead end.
   */
  async createUploadUrl(
    vendorId: string,
    bookingId: string,
    input: JobPhotoUploadUrlInput,
    now = Date.now()
  ) {
    const job = await getJobForGarage(vendorId, bookingId)
    assertGarageCanChange(job, input.stage, now)
    return uploadUrlFor(job, 'garage', input)
  },

  /** Records an uploaded photo against the job, by the key it was uploaded to. */
  async recordPhoto(
    vendorId: string,
    actorId: string,
    bookingId: string,
    input: RecordJobPhotoInput,
    now = Date.now()
  ) {
    const job = await getJobForGarage(vendorId, bookingId)
    assertGarageCanChange(job, input.stage, now)
    return record(job, 'garage', actorId, input)
  },

  /**
   * Removes one of the garage's own photos (never the customer's), under the
   * same windows as adding one, and never below the standard's minimum once
   * the job has passed that gate (0045): evidence the job moved on with
   * cannot be taken back.
   */
  async deletePhoto(vendorId: string, bookingId: string, photoId: string, now = Date.now()) {
    const job = await getJobForGarage(vendorId, bookingId)
    const photo = await jobPhotosRepository.findPhoto(job.id, photoId, 'garage')
    if (!photo) throw photoNotFound()

    assertGarageCanChange(job, photo.stage, now)

    const required = jobPhotosRequiredFor(job.vendorId)
    const gatePassed = photoRemovalBlocked({
      stage: photo.stage,
      status: job.status,
      outForDelivery: job.outForDeliveryAt !== null,
      required,
      waived: job.photosWaivedAt !== null,
      // As if only this one were left: blocked whenever the floor applies.
      garagePhotoCount: 0,
    })
    const deleted = await jobPhotosRepository.deletePhoto(
      job.id,
      photoId,
      'garage',
      gatePassed ? MIN_GARAGE_PHOTOS : null
    )
    if (deleted === 'floor') {
      throw new AppError(
        409,
        `This job ${photo.stage === 'before' ? 'started' : 'was finished'} with these photos, so at least ${MIN_GARAGE_PHOTOS} ${photo.stage} photos must stay. Add another before removing this one.`,
        'JOB_PHOTO_MINIMUM'
      )
    }
    if (!deleted) throw photoNotFound()

    // Best-effort: a stray object costs storage, not correctness.
    await removeJobPhotoObjects([deleted.storageKey], 'job_photo_removed')

    log.info({ bookingId: job.id, vendorId, photoId, stage: deleted.stage, role: 'garage' }, 'job_photo:removed')
    return view(deleted)
  },

  // ─── The customer (/bookings/:id/photos) ──────────────────────────────────

  /**
   * A presigned upload into the customer's own folder of their booking:
   * before photos until the work starts (pickup & drop: until collected),
   * after photos for 24 hours after completion, at most four of each.
   */
  async createCustomerUploadUrl(
    userId: string,
    bookingId: string,
    input: JobPhotoUploadUrlInput,
    now = Date.now()
  ) {
    const job = await getJobForCustomer(userId, bookingId)
    assertCustomerCanChange(job, input.stage, now)
    return uploadUrlFor(job, 'customer', input)
  },

  async recordCustomerPhoto(
    userId: string,
    bookingId: string,
    input: RecordJobPhotoInput,
    now = Date.now()
  ) {
    const job = await getJobForCustomer(userId, bookingId)
    assertCustomerCanChange(job, input.stage, now)
    return record(job, 'customer', userId, input)
  },

  /** Removes one of the customer's own photos, while that stage is open to them. */
  async deleteCustomerPhoto(userId: string, bookingId: string, photoId: string, now = Date.now()) {
    const job = await getJobForCustomer(userId, bookingId)
    const photo = await jobPhotosRepository.findPhoto(job.id, photoId, 'customer')
    if (!photo) throw photoNotFound()

    assertCustomerCanChange(job, photo.stage, now)

    const deleted = await jobPhotosRepository.deletePhoto(job.id, photoId, 'customer', null)
    if (!deleted || deleted === 'floor') throw photoNotFound()

    await removeJobPhotoObjects([deleted.storageKey], 'job_photo_removed')

    log.info({ bookingId: job.id, photoId, stage: deleted.stage, role: 'customer' }, 'job_photo:removed')
    return view(deleted)
  },
}

