import { AiUnavailableError, documentClientFor, type DocumentClient, type DocumentFile } from '../../lib/ai.js'
import {
  COMPARE_INSTRUCTIONS,
  COMPARE_PROMPT,
  FAKE_CONDITION_COMPARE,
  FAKE_CONDITION_READING,
  MARKS_JSON_SCHEMA,
  READ_INSTRUCTIONS,
  READ_PROMPT,
  parseMarks,
} from '../../lib/condition-check-ai.js'
import {
  answerRefusal,
  carCheckPhotos,
  carCheckRequired,
  cleanNote,
  cleanPart,
  conditionCheckOnFor,
  customerConditionView,
  garageConditionView,
  isCarCheckAngle,
  markEditRefusal,
  photoToRead,
  sendRefusal,
  sendRefusalMessage,
  type ConditionJob,
} from '../../lib/condition-check.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { jobPhotoLink, readJobPhoto } from '../../lib/job-photo-storage.js'
import { logger } from '../../lib/logger.js'
import { conditionCheckRepository } from './condition-check.repository.js'
import type { AddMarkInput, ConditionAnswerInput } from './condition-check.validation.js'

const log = logger.child({ module: 'condition-check' })

/**
 * Whether a garage's jobs have the car condition check (0075):
 * CONDITION_CHECK_ENABLED=on, or the garage listed in CONDITION_CHECK_GARAGES.
 * The bookings service reads the same answer for the payloads and the gate.
 */
export function conditionCheckOn(vendorId: string | null | undefined): boolean {
  if (!vendorId) return false
  return conditionCheckOnFor(vendorId, {
    enabled: env.conditionCheckEnabled,
    garages: env.conditionCheckGarages,
  })
}

/** Whether Detlio's AI marks the photos: a key, or the test fake. */
export function conditionAiOn(): boolean {
  return env.aiFake || Boolean(env.openaiApiKey)
}

// Built once per instance, like the garage import's reader: the SDK client
// holds its own connection pool. One for each question, so each fake
// answers its own.
let reader: DocumentClient | null | undefined
let comparer: DocumentClient | null | undefined

function readClient(): DocumentClient | null {
  if (reader === undefined) {
    reader = documentClientFor({
      apiKey: env.openaiApiKey,
      model: env.aiVisionModel,
      fake: env.aiFake,
      fakeAnswer: JSON.stringify(FAKE_CONDITION_READING),
    })
  }
  return reader
}

function compareClient(): DocumentClient | null {
  if (comparer === undefined) {
    comparer = documentClientFor({
      apiKey: env.openaiApiKey,
      model: env.aiVisionModel,
      fake: env.aiFake,
      fakeAnswer: JSON.stringify(FAKE_CONDITION_COMPARE),
    })
  }
  return comparer
}

/** Tests only: put in a reader of their own (null = AI off), or undefined to rebuild from env. */
export function setConditionClientsForTests(read: DocumentClient | null | undefined, compare: DocumentClient | null | undefined) {
  reader = read
  comparer = compare
}

/** The largest photo sent to the model; the portal sends 1600 px JPEGs, far below it. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024
/** Tokens for the answer (and the model's thinking): a few marks need little. */
const MAX_OUTPUT_TOKENS = 4000

function notFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

function markNotFound() {
  return new AppError(404, 'Mark not found', 'MARK_NOT_FOUND')
}

function photoNotFound() {
  return new AppError(404, 'Photo not found', 'PHOTO_NOT_FOUND')
}

function checkSent() {
  return new AppError(409, 'The car check was already sent to the customer, so its marks stay as they are.', 'CONDITION_CHECK_SENT')
}

type Job = NonNullable<Awaited<ReturnType<typeof conditionCheckRepository.findJob>>>
type Photo = Awaited<ReturnType<typeof conditionCheckRepository.listPhotos>>[number]

/**
 * The job, if it is the active garage's and the check is on for it.
 * Anything else is the same 404 as a job that does not exist.
 */
async function getGarageJob(vendorId: string, bookingId: string): Promise<Job> {
  const job = await conditionCheckRepository.findJob(bookingId)
  if (!job || job.vendorId !== vendorId || !conditionCheckOn(job.vendorId)) throw notFound()
  return job
}

/** The job, if it is this customer's own booking and the check is on for its garage. */
async function getCustomerJob(userId: string, bookingId: string): Promise<Job> {
  const job = await conditionCheckRepository.findJob(bookingId)
  if (!job || job.userId !== userId || !conditionCheckOn(job.vendorId)) throw notFound()
  return job
}

/** Everything the views read, one read after another (one database connection). */
async function conditionJob(job: { id: string; status: string; bookingType: string; photosWaivedAt: Date | null }): Promise<ConditionJob & { photos: Photo[] }> {
  const photos = await conditionCheckRepository.listPhotos(job.id)
  const check = await conditionCheckRepository.findCheck(job.id)
  const marks = await conditionCheckRepository.listMarks(job.id)
  return {
    status: job.status,
    bookingType: job.bookingType,
    photosWaivedAt: job.photosWaivedAt,
    photos,
    check,
    marks,
  }
}

async function garageView(job: Job) {
  return garageConditionView(await conditionJob(job), conditionAiOn())
}

async function customerView(job: Job) {
  return customerConditionView(await conditionJob(job), conditionAiOn(), jobPhotoLink)
}

/** A photo's bytes as the model takes them, or null when it cannot be read. */
async function photoFile(photo: Photo, name: string): Promise<DocumentFile | null> {
  const read = await readJobPhoto(photo)
  if (!read || read.body.byteLength === 0 || read.body.byteLength > MAX_PHOTO_BYTES) return null
  const type = read.contentType ?? ''
  const mimeType: DocumentFile['mimeType'] =
    type === 'image/png' || photo.storageKey.endsWith('.png')
      ? 'image/png'
      : type === 'image/webp' || photo.storageKey.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg'
  return { name, mimeType, dataBase64: Buffer.from(read.body).toString('base64') }
}

/**
 * Asks the model about `files` and returns its marks, or null when there is
 * no usable answer (it failed, refused or answered something else). The
 * fake (AI_FAKE) needs no files, so none are fetched for it.
 */
async function askModel(
  client: DocumentClient,
  kind: 'read' | 'compare',
  photos: Array<{ photo: Photo; name: string }>
) {
  const files: DocumentFile[] = []
  if (!env.aiFake) {
    for (const { photo, name } of photos) {
      const file = await photoFile(photo, name)
      if (!file) return null
      files.push(file)
    }
  }
  try {
    const text = await client.read({
      instructions: kind === 'read' ? READ_INSTRUCTIONS : COMPARE_INSTRUCTIONS,
      prompt: kind === 'read' ? READ_PROMPT : COMPARE_PROMPT,
      files,
      schemaName: 'condition_marks',
      schema: MARKS_JSON_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
    return parseMarks(text)
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      log.warn({ kind, reason: error.message.slice(0, 120) }, 'condition_check:ai_unavailable')
      return null
    }
    throw error
  }
}

export const conditionCheckService = {
  // ─── The garage (/vendors/me/bookings/:id/condition) ───────────────────────

  /** The garage's view of the check, as its booking payload carries it. */
  async garageView(vendorId: string, bookingId: string) {
    return garageView(await getGarageJob(vendorId, bookingId))
  },

  /**
   * Detlio looks at one car-check photo: a before photo for the damage
   * already there, an after photo against the before photo of the same
   * angle. Once per photo (a second ask returns the view as it is); a failed
   * look leaves the photo without marks, never a held job. Nothing happens
   * while AI is off, or for a before photo once the check is sent.
   */
  async readPhoto(vendorId: string, bookingId: string, photoId: string, now = Date.now()) {
    const job = await getGarageJob(vendorId, bookingId)
    const photos = await conditionCheckRepository.listPhotos(job.id)
    const photo = photos.find((p) => p.id === photoId && p.uploadedByRole === 'garage')
    if (!photo) throw photoNotFound()

    const check = await conditionCheckRepository.findCheck(job.id)
    const standing = isCarCheckAngle(photo.angle) && carCheckPhotos(photos, photo.stage).get(photo.angle)?.id === photo.id
    const readable =
      standing && photoToRead(photo) && !(photo.stage === 'before' && check !== null) && conditionAiOn()

    if (readable && isCarCheckAngle(photo.angle)) {
      const started = Date.now()
      const at = new Date(now)
      const before = photo.stage === 'after' ? carCheckPhotos(photos, 'before').get(photo.angle) : undefined
      const client = photo.stage === 'before' ? readClient() : compareClient()

      if (photo.stage === 'after' && !before) {
        // Nothing to compare it with: read, with no marks.
        await conditionCheckRepository.saveReading({
          bookingId: job.id,
          photoId: photo.id,
          stage: 'after',
          comparedPhotoId: null,
          marks: [],
          at,
        })
      } else if (client) {
        const marks =
          photo.stage === 'before'
            ? await askModel(client, 'read', [{ photo, name: 'photo.jpg' }])
            : await askModel(client, 'compare', [
                { photo: before!, name: 'before.jpg' },
                { photo, name: 'after.jpg' },
              ])
        if (marks) {
          await conditionCheckRepository.saveReading({
            bookingId: job.id,
            photoId: photo.id,
            stage: photo.stage,
            comparedPhotoId: before?.id ?? null,
            marks,
            at,
          })
        } else {
          await conditionCheckRepository.markReadFailed(job.id, photo.id, at)
        }
        // Counts and timing only: never a key, a link or a mark's words.
        log.info(
          {
            bookingId: job.id,
            vendorId,
            stage: photo.stage,
            angle: photo.angle,
            marks: marks?.length ?? null,
            ms: Date.now() - started,
          },
          'condition_check:photo_read'
        )
      }
    }
    return garageView(job)
  },

  /** "Add a mark Detlio missed", on one of the walk-round's before photos. */
  async addMark(vendorId: string, bookingId: string, input: AddMarkInput) {
    const job = await getGarageJob(vendorId, bookingId)
    const check = await conditionCheckRepository.findCheck(job.id)
    const refusal = markEditRefusal({ status: job.status, sentAt: check?.sentAt ?? null })
    if (refusal === 'sent') throw checkSent()
    if (refusal) throw new AppError(400, 'Marks can be changed while the job is accepted or under way.', 'CONDITION_CHECK_CLOSED')

    const photos = await conditionCheckRepository.listPhotos(job.id)
    const photo = photos.find((p) => p.id === input.photoId)
    if (!photo || photo.stage !== 'before' || photo.uploadedByRole !== 'garage' || !isCarCheckAngle(photo.angle)) {
      throw photoNotFound()
    }
    const part = cleanPart(input.part)
    if (!part) {
      throw new AppError(400, 'Say where on the car, in a few words.', 'INVALID_MARK_PART')
    }
    const created = await conditionCheckRepository.insertGarageMark({
      bookingId: job.id,
      photoId: photo.id,
      kind: input.kind,
      part,
    })
    if (!created) throw checkSent()
    log.info({ bookingId: job.id, vendorId, kind: input.kind }, 'condition_check:mark_added')
    return garageView(job)
  },

  /** Removes a wrong before mark (kept for the record), or puts it back. */
  async setMarkRemoved(vendorId: string, bookingId: string, markId: string, removed: boolean, now = Date.now()) {
    const job = await getGarageJob(vendorId, bookingId)
    const mark = await conditionCheckRepository.findMark(job.id, markId)
    if (!mark || mark.stage !== 'before') throw markNotFound()
    const check = await conditionCheckRepository.findCheck(job.id)
    const refusal = markEditRefusal({ status: job.status, sentAt: check?.sentAt ?? null })
    if (refusal === 'sent') throw checkSent()
    if (refusal) throw new AppError(400, 'Marks can be changed while the job is accepted or under way.', 'CONDITION_CHECK_CLOSED')

    const changed = await conditionCheckRepository.setRemoved(job.id, markId, removed ? new Date(now) : null)
    if (!changed) throw checkSent()
    log.info({ bookingId: job.id, vendorId, removed }, 'condition_check:mark_removed')
    return garageView(job)
  },

  /**
   * "Send to customer": the before check's photos and marks become the
   * record. All eight angles where the check is required; at least one
   * otherwise. Counted under the job's photo lock.
   */
  async send(vendorId: string, actorId: string, bookingId: string, now = Date.now()) {
    const job = await getGarageJob(vendorId, bookingId)
    const photos = await conditionCheckRepository.listPhotos(job.id)
    const check = await conditionCheckRepository.findCheck(job.id)
    const required = carCheckRequired(job)
    const refusalOf = (taken: number, sentAt: Date | null) =>
      sendRefusal({ status: job.status, required, anglesTaken: taken, sentAt })
    const refusal = refusalOf(carCheckPhotos(photos, 'before').size, check?.sentAt ?? null)
    if (refusal) {
      throw new AppError(refusal === 'already_sent' ? 409 : 400, sendRefusalMessage(refusal), refusal === 'already_sent' ? 'CONDITION_CHECK_SENT' : 'CONDITION_CHECK_NOT_READY')
    }

    const sent = await conditionCheckRepository.send(job.id, actorId, new Date(now), (fresh) =>
      refusalOf(carCheckPhotos(fresh, 'before').size, null) === null
    )
    if (sent === 'short') {
      throw new AppError(400, sendRefusalMessage(required ? 'missing_angles' : 'no_photos'), 'CONDITION_CHECK_NOT_READY')
    }
    if (!sent) throw checkSent()
    log.info({ bookingId: job.id, vendorId, actorId }, 'condition_check:sent')
    return garageView(job)
  },

  /** The garage's "It was there" on a possible new mark after the job. */
  async garageWasThere(vendorId: string, bookingId: string, markId: string, now = Date.now()) {
    const job = await getGarageJob(vendorId, bookingId)
    const mark = await conditionCheckRepository.findMark(job.id, markId)
    if (!mark || mark.stage !== 'after') throw markNotFound()
    if (!mark.garageAnswer) {
      await conditionCheckRepository.garageWasThere(job.id, markId, new Date(now))
      log.info({ bookingId: job.id, vendorId }, 'condition_check:garage_was_there')
    }
    return garageView(job)
  },

  // ─── The customer (/bookings/:id/condition) ────────────────────────────────

  /**
   * "Looks right", or "Something's wrong" with a note the garage and the
   * team read. Once; the person is always the session's.
   */
  async answer(userId: string, bookingId: string, input: ConditionAnswerInput, now = Date.now()) {
    const job = await getCustomerJob(userId, bookingId)
    const check = await conditionCheckRepository.findCheck(job.id)
    const refusal = answerRefusal({
      status: job.status,
      sentAt: check?.sentAt ?? null,
      answeredAt: check?.customerAnsweredAt ?? null,
    })
    if (refusal === 'not_sent') throw new AppError(400, 'The garage has not sent the car check yet.', 'CONDITION_CHECK_NOT_SENT')
    if (refusal === 'already_answered') throw new AppError(409, 'You have already answered this car check.', 'CONDITION_CHECK_ANSWERED')
    if (refusal) throw new AppError(400, "This booking isn't going ahead.", 'BOOKING_NOT_ACTIVE')

    const note = input.answer === 'something_wrong' ? cleanNote(input.note) : null
    if (input.answer === 'something_wrong' && !note) {
      throw new AppError(400, "Say what's wrong, in a few words.", 'INVALID_CONDITION_NOTE')
    }
    const answered = await conditionCheckRepository.answer({
      bookingId: job.id,
      userId,
      answer: input.answer,
      note,
      at: new Date(now),
    })
    if (!answered) throw new AppError(409, 'You have already answered this car check.', 'CONDITION_CHECK_ANSWERED')
    // Never the note's words in the log.
    log.info({ bookingId: job.id, answer: input.answer }, 'condition_check:answered')
    return customerView(job)
  },

  /** The customer's "It was already there" on a possible new mark. */
  async customerAlreadyThere(userId: string, bookingId: string, markId: string, now = Date.now()) {
    const job = await getCustomerJob(userId, bookingId)
    const mark = await conditionCheckRepository.findMark(job.id, markId)
    if (!mark || mark.stage !== 'after' || mark.removedAt !== null || job.status !== 'completed') throw markNotFound()
    if (!mark.customerAnswer) {
      await conditionCheckRepository.customerAlreadyThere(job.id, markId, new Date(now))
      log.info({ bookingId: job.id }, 'condition_check:customer_already_there')
    }
    return customerView(job)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /**
   * The check as the team sees it on a booking (the garage's view, with the
   * customer's note), or null where the check is off for the garage and
   * there is none.
   */
  async adminView(booking: { id: string; vendorId: string; status: string; bookingType: string; photosWaivedAt: Date | null }) {
    const data = await conditionJob(booking)
    if (!conditionCheckOn(booking.vendorId) && !data.check && data.marks.length === 0) return null
    return garageConditionView(data, conditionAiOn())
  },
}
