import { randomUUID } from 'node:crypto'
import { generatePictures, isAiPicturesEnabled, PICTURES_PER_REQUEST } from '../../lib/ai-images.js'
import { runInBackground } from '../../lib/background.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  aiTempPrefix,
  buildAiPicturePrompt,
  consentGiven,
  hasRealMedia,
  isAiTempKeyFor,
  isServicePhotoKey,
  isStreamUid,
  MAX_VIDEO_SECONDS,
  MAX_VIDEOS_PER_SERVICE,
  photosCountingAgainstLimit,
  removedOnVideoStart,
  removedWhenVideoReady,
  toManagedMedia,
  uploadAbandoned,
  VIDEO_ABANDONED_MESSAGE,
  VIDEO_TOO_LONG_MESSAGE,
  videoCountsOnStart,
  videoUpdateFrom,
  verifyStreamSignature,
  type ManagedServiceMedia,
  type StreamVideo,
  type VideoUpdate,
} from '../../lib/service-media.js'
import {
  copyObject,
  createPresignedUpload,
  deleteObject,
  keyFromPublicUrl,
  putObject,
} from '../../lib/storage.js'
import { createVideoUpload, deleteVideo, getVideo, isStreamEnabled, videoUrls } from '../../lib/stream.js'
import { createKeyedLimit } from '../../lib/throttle.js'
import { serviceMediaRepository, type ServiceMediaRecord } from './service-media.repository.js'
import type {
  AddPhotoInput,
  PhotoUploadUrlInput,
  StartVideoInput,
  UseAiPictureInput,
} from './service-media.validation.js'

const log = logger.child({ module: 'service-media' })

/**
 * Who is changing a service's media. A garage acts only on its own company's
 * services (the vendorId resolveTenant produced, never a request param);
 * admin on any. `sub` is the admin's token subject.
 */
export type MediaActor = { kind: 'garage'; vendorId: string } | { kind: 'admin'; sub: string }

/** The shared break-glass admin login (see auth.middleware). */
const BREAK_GLASS_SUBJECT = 'admin'

const aiLimit = createKeyedLimit(env.aiPicturesPerHour, 60 * 60 * 1000)

function serviceNotFound() {
  return new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
}

function mediaNotFound() {
  return new AppError(404, 'Photo or video not found', 'SERVICE_MEDIA_NOT_FOUND')
}

/** Every route of a switched-off feature is the same 404 as an unknown path. */
function notFound() {
  return new AppError(404, 'Not found', 'NOT_FOUND')
}

function requireConsent(consent: unknown) {
  if (!consentGiven(consent)) {
    throw new AppError(
      400,
      'Tick the box first: no number plates or faces can be read, or the owner agreed.',
      'MEDIA_CONSENT_REQUIRED'
    )
  }
}

function photoLimitReached() {
  return new AppError(
    409,
    `A service can have at most ${env.r2MaxImagesPerService} photos`,
    'SERVICE_IMAGE_LIMIT_REACHED'
  )
}

/**
 * The service the actor may change. A garage asking about another company's
 * service gets the same 404 as a service that does not exist.
 */
async function resolveService(actor: MediaActor, serviceId: string) {
  const service = await serviceMediaRepository.findService(serviceId)
  if (!service) throw serviceNotFound()
  if (actor.kind === 'garage' && service.vendorId !== actor.vendorId) throw serviceNotFound()
  return service
}

/** `uploaded_by`: the admin's name, or 'garage' for the garage's own app. */
async function uploaderName(actor: MediaActor): Promise<string> {
  if (actor.kind === 'garage') return 'garage'
  if (actor.sub === BREAK_GLASS_SUBJECT) return 'admin'
  const user = await serviceMediaRepository.findUserName(actor.sub)
  return (user?.name.trim() || 'admin').slice(0, 100)
}

/**
 * Remove the files behind rows that are gone: an R2 object for a photo, a
 * Stream video for a video. After the commit and best effort, so a storage
 * hiccup never undoes a change the garage already sees.
 */
export function removeMediaFiles(rows: readonly ServiceMediaRecord[]) {
  if (rows.length === 0) return
  runInBackground('service-media:remove-files', async () => {
    for (const row of rows) {
      if (row.kind === 'video') {
        if (row.videoUid) await deleteVideo(row.videoUid)
        continue
      }
      const key = row.storageKey ?? keyFromPublicUrl(row.url)
      if (key) await deleteObject(key)
    }
  })
}

async function listManaged(serviceId: string): Promise<ManagedServiceMedia[]> {
  return toManagedMedia(await serviceMediaRepository.listMedia(serviceId))
}

/**
 * Write what Stream said onto a processing video. A video that is now ready
 * takes the place of the one it replaced, and of any AI samples, in the same
 * transaction; a failed one changes nothing else, so the earlier video (if
 * any) stays on the garage page.
 */
async function applyVideoUpdate(row: ServiceMediaRecord, update: VideoUpdate) {
  const patch =
    update.videoStatus === 'ready'
      ? {
          videoStatus: 'ready' as const,
          durationSecs: update.durationSecs,
          posterUrl: videoUrls(row.videoUid ?? '').posterUrl,
          videoError: null,
        }
      : { videoStatus: 'error' as const, videoError: update.videoError }

  const { settled, removed } = await serviceMediaRepository.settleVideo({
    serviceId: row.serviceId,
    id: row.id,
    patch,
    remove: (other) => update.videoStatus === 'ready' && removedWhenVideoReady(other, row.id),
  })
  if (settled) {
    removeMediaFiles(removed)
    log.info(
      { serviceId: row.serviceId, mediaId: row.id, status: settled.videoStatus, removed: removed.length },
      'service-media:video-settled'
    )
  }
  return settled
}

export const serviceMediaService = {
  /** What the upload block may offer. Video is off unless Stream is set up. */
  config() {
    return {
      video: isStreamEnabled(),
      maxPhotos: env.r2MaxImagesPerService,
      maxVideoSecs: MAX_VIDEO_SECONDS,
    }
  },

  listManaged,

  // ─── Photos ────────────────────────────────────────────────────────────────

  async createPhotoUploadUrl(actor: MediaActor, serviceId: string, input: PhotoUploadUrlInput) {
    const service = await resolveService(actor, serviceId)
    const rows = await serviceMediaRepository.listMedia(service.id)
    if (photosCountingAgainstLimit(rows, 'upload') >= env.r2MaxImagesPerService) {
      throw photoLimitReached()
    }

    // Keyed under the owning garage, so a service's photos sit beside the
    // rest of its objects whoever uploaded them.
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      service.vendorId,
      input.contentType,
      `services/${service.id}`
    )
    return { uploadUrl, publicUrl }
  },

  /**
   * Register a photo the app has uploaded. Needs the privacy tick, and a URL
   * inside this service's own folder. A real photo replaces any AI samples:
   * they are removed in the same transaction ("removed by itself when a real
   * photo is added").
   */
  async addPhoto(actor: MediaActor, serviceId: string, input: AddPhotoInput) {
    requireConsent(input.consent)
    const service = await resolveService(actor, serviceId)

    const key = keyFromPublicUrl(input.url)
    if (!key || !isServicePhotoKey(key, service.vendorId, service.id)) {
      throw new AppError(400, 'Invalid image URL', 'INVALID_SERVICE_IMAGE_URL')
    }

    const result = await serviceMediaRepository.insertMediaUnderLimit({
      serviceId: service.id,
      values: {
        kind: 'image',
        source: 'upload',
        url: input.url,
        storageKey: key,
        consentConfirmedAt: new Date(),
        uploadedBy: await uploaderName(actor),
      },
      counts: (row) => row.kind === 'image' && row.source === 'upload',
      max: env.r2MaxImagesPerService,
      remove: (row) => row.kind === 'image' && row.source === 'ai',
    })
    if (!result.created) throw photoLimitReached()

    removeMediaFiles(result.removed)
    log.info(
      { vendorId: service.vendorId, serviceId: service.id, mediaId: result.created.id, by: actor.kind },
      'service-media:photo-added'
    )
    return service
  },

  // ─── Video ─────────────────────────────────────────────────────────────────

  /**
   * Start a video upload: a one-time Stream link for the phone, and a row in
   * 'processing' that the webhook (or the status poll) settles. A new video
   * replaces the old one only when `replaces` names it, and a ready old one
   * stays until the new one is ready (see videoCountsOnStart): an upload that
   * never arrives must not cost the garage the video it had.
   */
  async startVideo(actor: MediaActor, serviceId: string, input: StartVideoInput) {
    if (!isStreamEnabled()) throw notFound()
    requireConsent(input.consent)
    const service = await resolveService(actor, serviceId)

    if (input.durationSecs !== undefined && input.durationSecs > MAX_VIDEO_SECONDS + 0.5) {
      throw new AppError(400, VIDEO_TOO_LONG_MESSAGE, 'VIDEO_TOO_LONG')
    }

    const rows = await serviceMediaRepository.listMedia(service.id)
    const counts = (row: ServiceMediaRecord) => videoCountsOnStart(row, input.replaces)
    if (input.replaces && !rows.some((row) => row.id === input.replaces && row.kind === 'video')) {
      throw mediaNotFound()
    }
    // Checked before asking Stream for a link, so a full service costs no
    // Stream call. The insert below checks again under the lock.
    if (rows.filter(counts).length >= MAX_VIDEOS_PER_SERVICE) {
      throw videoLimitReached()
    }

    const uploadedBy = await uploaderName(actor)
    const upload = await createVideoUpload({
      serviceId: service.id,
      creator: actor.kind === 'garage' ? `garage:${service.vendorId}` : `admin:${uploadedBy}`,
      sizeBytes: input.sizeBytes,
    })
    const { hlsUrl } = videoUrls(upload.uid)

    const result = await serviceMediaRepository.insertMediaUnderLimit({
      serviceId: service.id,
      values: {
        kind: 'video',
        source: 'upload',
        url: hlsUrl,
        storageKey: null,
        consentConfirmedAt: new Date(),
        uploadedBy,
        videoUid: upload.uid,
        videoStatus: 'processing',
      },
      counts,
      max: MAX_VIDEOS_PER_SERVICE,
      remove: (row) => removedOnVideoStart(row, input.replaces),
    })

    if (!result.created) {
      // Another upload took the place in the meantime; the link is unused.
      await deleteVideo(upload.uid)
      throw videoLimitReached()
    }

    removeMediaFiles(result.removed)
    log.info(
      { vendorId: service.vendorId, serviceId: service.id, mediaId: result.created.id, mode: upload.mode },
      'service-media:video-started'
    )

    return {
      mode: upload.mode,
      uploadUrl: upload.uploadUrl,
      media: toManagedMedia([result.created])[0],
    }
  },

  /**
   * One photo or video, as the upload block polls it. A video still
   * processing is checked with Stream here, so a missed webhook only delays
   * "Ready" by one poll.
   */
  async getMedia(actor: MediaActor, serviceId: string, mediaId: string) {
    const service = await resolveService(actor, serviceId)
    const row = await serviceMediaRepository.findMedia(service.id, mediaId)
    if (!row) throw mediaNotFound()

    if (row.kind === 'video' && row.videoStatus === 'processing' && row.videoUid && isStreamEnabled()) {
      const settled = await refreshFromStream(row)
      if (settled) return toManagedMedia([settled])[0]
    }
    return toManagedMedia([row])[0]
  },

  /** Remove one photo or video, then its file. */
  async deleteMedia(actor: MediaActor, serviceId: string, mediaId: string) {
    const service = await resolveService(actor, serviceId)
    const [deleted] = await serviceMediaRepository.deleteMedia(service.id, mediaId)
    if (!deleted) throw mediaNotFound()

    removeMediaFiles([deleted])
    log.info(
      { vendorId: service.vendorId, serviceId: service.id, mediaId, kind: deleted.kind },
      'service-media:removed'
    )
    return service
  },

  /**
   * Stream's webhook. Believed only with a valid, fresh signature; an
   * unknown or malformed video is acknowledged and ignored, so Stream does
   * not retry something we will never act on.
   */
  async handleStreamWebhook(rawBody: string, signature: string | undefined) {
    if (!isStreamEnabled()) throw notFound()

    const valid = verifyStreamSignature({
      header: signature,
      rawBody,
      secret: env.cloudflareStreamWebhookSecret ?? '',
      nowSecs: Math.floor(Date.now() / 1000),
    })
    if (!valid) {
      log.warn('service-media:webhook-bad-signature')
      throw new AppError(401, 'Invalid signature', 'INVALID_SIGNATURE')
    }

    let video: StreamVideo
    try {
      video = JSON.parse(rawBody) as StreamVideo
    } catch {
      return { handled: false }
    }
    if (!isStreamUid(video.uid)) return { handled: false }

    const row = await serviceMediaRepository.findMediaByVideoUid(video.uid)
    if (!row) {
      log.info({ uid: video.uid }, 'service-media:webhook-unknown-video')
      return { handled: false }
    }

    const update = videoUpdateFrom(video)
    if (!update) return { handled: false }
    await applyVideoUpdate(row, update)
    return { handled: true }
  },

  // ─── AI sample pictures (admin) ────────────────────────────────────────────

  /**
   * Two picture options for a service with no real photo, saved under the
   * service's temp prefix until the admin picks one. `subject` is the
   * admin's description; the style is always added on the server.
   */
  async generateAiPictures(sub: string, serviceId: string, subject: string) {
    if (!isAiPicturesEnabled()) throw notFound()
    const service = await resolveService({ kind: 'admin', sub }, serviceId)

    const rows = await serviceMediaRepository.listMedia(service.id)
    if (hasRealMedia(rows)) {
      throw new AppError(
        409,
        'This service already has a real photo or video, so it does not need a sample picture.',
        'AI_PICTURE_NOT_NEEDED'
      )
    }

    const allowed = aiLimit(sub)
    if (!allowed.ok) {
      throw new AppError(
        429,
        'That is the most pictures for this hour. Try again later.',
        'AI_PICTURE_LIMIT',
        { retryAfterSeconds: allowed.retryAfterSeconds }
      )
    }

    const prompt = buildAiPicturePrompt(subject)
    const pictures = await generatePictures(prompt)
    const urls = await Promise.all(
      pictures.slice(0, PICTURES_PER_REQUEST).map((picture) =>
        putObject(
          `${aiTempPrefix(service.id)}${randomUUID()}.${picture.ext}`,
          picture.bytes,
          picture.contentType
        )
      )
    )

    log.info({ serviceId: service.id, count: urls.length }, 'service-media:ai-generated')
    return { pictures: urls.map((url) => ({ url })) }
  },

  /**
   * Make the picked option the service's sample picture: copied out of the
   * temp prefix into the service's own folder, then the options removed.
   */
  async useAiPicture(sub: string, serviceId: string, input: UseAiPictureInput) {
    if (!isAiPicturesEnabled()) throw notFound()
    const service = await resolveService({ kind: 'admin', sub }, serviceId)

    const tempKey = keyFromPublicUrl(input.url)
    if (!tempKey || !isAiTempKeyFor(tempKey, service.id)) {
      throw new AppError(400, 'That is not one of this service’s pictures', 'INVALID_AI_PICTURE')
    }
    const otherKeys = (input.otherUrls ?? [])
      .map((url) => keyFromPublicUrl(url))
      .filter((key): key is string => key !== null && isAiTempKeyFor(key, service.id))

    const ext = tempKey.slice(tempKey.lastIndexOf('.') + 1)
    const finalKey = `vendors/${service.vendorId}/services/${service.id}/${randomUUID()}.${ext}`
    const url = await copyObject(tempKey, finalKey)

    const result = await serviceMediaRepository.insertMediaUnderLimit({
      serviceId: service.id,
      values: {
        kind: 'image',
        source: 'ai',
        url,
        storageKey: finalKey,
        uploadedBy: await uploaderName({ kind: 'admin', sub }),
      },
      counts: (row) => row.kind === 'image',
      max: env.r2MaxImagesPerService,
      remove: () => false,
      refuseIf: (row) => row.source === 'upload',
    })

    // The options are done with either way.
    runInBackground('service-media:ai-temp-cleanup', async () => {
      for (const key of [tempKey, ...otherKeys]) await deleteObject(key)
    })

    if (!result.created) {
      await deleteObject(finalKey)
      throw result.refusal === 'has_real_media'
        ? new AppError(
            409,
            'This service already has a real photo or video, so it does not need a sample picture.',
            'AI_PICTURE_NOT_NEEDED'
          )
        : photoLimitReached()
    }

    log.info({ serviceId: service.id, mediaId: result.created.id }, 'service-media:ai-used')
    return listManaged(service.id)
  },
}

function videoLimitReached() {
  return new AppError(
    409,
    'A service can have one video. Replace or remove the one it has.',
    'SERVICE_VIDEO_LIMIT_REACHED'
  )
}

/**
 * Ask Stream about a processing video and settle it if Stream has an
 * answer. A link never used for 2 hours is given up on, so the slot frees.
 */
async function refreshFromStream(row: ServiceMediaRecord) {
  let video: StreamVideo | null
  try {
    video = await getVideo(row.videoUid ?? '')
  } catch {
    // Stream did not answer; the poll will ask again.
    return null
  }

  if (!video) {
    // Under the fake, videos change only by webhook.
    if (env.streamFake) return null
    if (Date.now() - row.createdAt.getTime() > 30 * 60 * 1000) {
      return applyVideoUpdate(row, { videoStatus: 'error', videoError: VIDEO_ABANDONED_MESSAGE })
    }
    return null
  }

  if (uploadAbandoned(video.status?.state, row.createdAt, Date.now())) {
    return applyVideoUpdate(row, { videoStatus: 'error', videoError: VIDEO_ABANDONED_MESSAGE })
  }

  const update = videoUpdateFrom(video)
  return update ? applyVideoUpdate(row, update) : null
}
