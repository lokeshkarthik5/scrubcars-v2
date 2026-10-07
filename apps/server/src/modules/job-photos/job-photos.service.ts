import { AppError } from '../../lib/errors.js'
import {
  MAX_PHOTOS_PER_STAGE,
  PHOTO_EDIT_WINDOW_DAYS,
  isJobPhotoKey,
  jobPhotoFolder,
  photoChangeRefusal,
  toJobPhotoView,
  type JobPhotoStage,
  type PhotoRefusal,
} from '../../lib/job-records.js'
import { logger } from '../../lib/logger.js'
import {
  createPresignedUpload,
  deleteObject,
  publicUrlForKey,
} from '../../lib/storage.js'
import { jobPhotosRepository } from './job-photos.repository.js'
import type {
  JobPhotoUploadUrlInput,
  RecordJobPhotoInput,
} from './job-photos.validation.js'

const log = logger.child({ module: 'job-photos' })

function jobNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
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
    case 'window_closed':
      return new AppError(
        400,
        `Photos can't be changed more than ${PHOTO_EDIT_WINDOW_DAYS} days after the job was completed.`,
        'JOB_PHOTO_WINDOW_CLOSED'
      )
  }
}

function limitReached(stage: JobPhotoStage) {
  return new AppError(
    409,
    `A job can have at most ${MAX_PHOTOS_PER_STAGE} ${stage} photos. Remove one to add another.`,
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

function assertCanChange(
  job: NonNullable<Awaited<ReturnType<typeof jobPhotosRepository.findJob>>>,
  stage: JobPhotoStage,
  now: number
) {
  const refusal = photoChangeRefusal({
    stage,
    status: job.status,
    completedAt: job.completedAt,
    scheduledAt: job.scheduledAt,
    now,
  })
  if (refusal) throw refusalError(refusal, stage)
}

export const jobPhotosService = {
  async listPhotos(vendorId: string, bookingId: string) {
    const job = await getJobForGarage(vendorId, bookingId)
    const photos = await jobPhotosRepository.listPhotos(job.id)
    return photos.map(toJobPhotoView)
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
    assertCanChange(job, input.stage, now)

    if ((await jobPhotosRepository.countPhotos(job.id, input.stage)) >= MAX_PHOTOS_PER_STAGE) {
      throw limitReached(input.stage)
    }

    const { uploadUrl, key, publicUrl } = await createPresignedUpload(
      vendorId,
      input.contentType,
      jobPhotoFolder(job.id)
    )
    return { uploadUrl, key, publicUrl }
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
    assertCanChange(job, input.stage, now)

    if (!isJobPhotoKey(input.key, vendorId, job.id)) {
      throw new AppError(400, 'That upload is not for this job', 'INVALID_JOB_PHOTO_KEY')
    }

    // A retried request after a dropped answer: the photo is already there.
    const existing = await jobPhotosRepository.findPhotoByKey(job.id, input.key)
    if (existing) return toJobPhotoView(existing)

    const created = await jobPhotosRepository.insertPhotoUnderCap(
      {
        bookingId: job.id,
        stage: input.stage,
        storageKey: input.key,
        url: publicUrlForKey(input.key),
        uploadedBy: actorId,
      },
      MAX_PHOTOS_PER_STAGE
    )
    if (!created) throw limitReached(input.stage)

    log.info({ bookingId: job.id, vendorId, actorId, stage: input.stage, photoId: created.id }, 'job_photo:added')
    return toJobPhotoView(created)
  },

  /**
   * Removes a photo, under the same rules as adding one: a record the garage
   * could still rewrite a month later would prove nothing.
   */
  async deletePhoto(vendorId: string, bookingId: string, photoId: string, now = Date.now()) {
    const job = await getJobForGarage(vendorId, bookingId)
    const photo = await jobPhotosRepository.findPhoto(job.id, photoId)
    if (!photo) throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')

    assertCanChange(job, photo.stage, now)

    const [deleted] = await jobPhotosRepository.deletePhoto(job.id, photoId)
    if (!deleted) throw new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')

    // Best-effort: a stray object costs storage, not correctness.
    await deleteObject(deleted.storageKey)

    log.info({ bookingId: job.id, vendorId, photoId, stage: deleted.stage }, 'job_photo:removed')
    return toJobPhotoView(deleted)
  },
}
