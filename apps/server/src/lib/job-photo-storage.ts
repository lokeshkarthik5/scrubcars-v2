/**
 * Where job photos live, and the links that show them.
 *
 * Job photos — the garage's before/after and the customer's own car photos
 * (0045), extra-work photos (0041) and free-redo claim photos (0051) — show a
 * customer's car, often its number plate and where it is parked. So they go
 * to the PRIVATE bucket the garage documents use, `R2_DOCS_BUCKET`
 * (lib/document-storage.ts: same account and keys, no public access), under
 * the keys they always had (`vendors/<vendorId>/job-photos/<bookingId>/…`,
 * apart from the documents' `vendors/<vendorId>/documents/…`), and are seen
 * only through presigned links made for whoever the payload is for.
 *
 * - **Stored**: a private photo's `url` column holds its object KEY (no
 *   scheme), never an address. A row from before this change, or made while
 *   the private bucket is unset, holds a full public URL: it is passed
 *   through as it is (`isPublicPhotoUrl`), so old photos keep working until
 *   they are moved (the PR's backfill note).
 * - **Off**: with `R2_DOCS_BUCKET` unset (local dev without it), uploads go
 *   to the public photo bucket and rows hold its public URL — exactly the
 *   behaviour before.
 * - **Links**: signed for JOB_PHOTO_LINK_TTL_SECONDS from a time rounded down
 *   to JOB_PHOTO_LINK_WINDOW_SECONDS, so every read in a window gets the same
 *   link (the browser's cache holds across refetches) and each link has 10–15
 *   minutes left. Made per payload, by lib/r2-presign.ts (synchronous, so the
 *   view mappers stay synchronous); never stored, logged, or put in an
 *   alert or a push.
 */
import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { isDocumentStorageConfigured } from './document-storage.js'
import { env } from './env.js'
import { logger } from './logger.js'
import { presignGetUrl } from './r2-presign.js'
import {
  createPresignedUpload,
  deleteObject,
  imageExtension,
  isStorageConfigured,
  makeR2Client,
  publicUrlForKey,
  readObject,
} from './storage.js'

const log = logger.child({ module: 'job-photo-storage' })

/** How long a photo link works from its signing time. */
export const JOB_PHOTO_LINK_TTL_SECONDS = 15 * 60
/** Links are signed at the start of a window this long, so they repeat within it. */
export const JOB_PHOTO_LINK_WINDOW_SECONDS = 5 * 60

/**
 * Only job-photo keys are ever signed or deleted here: the bucket also holds
 * garage documents (`…/documents/…`), which this path must never reach.
 */
const JOB_PHOTO_KEY = /^vendors\/[^/]+\/job-photos\/[^/]/

/** Whether new job photos go to the private bucket (R2_DOCS_BUCKET set, with the account and keys). */
export function privateJobPhotosOn(): boolean {
  return isDocumentStorageConfigured()
}

/** A row from the public bucket: a full address rather than a key. */
export function isPublicPhotoUrl(stored: string): boolean {
  return /^https?:\/\//i.test(stored)
}

/**
 * A presigned upload for one job photo into `folder` (the job's, the
 * customer's or the claim's), in the private bucket while it is on, else
 * the public one. Only the key goes back: the client records the photo by it,
 * and there is no address to show before the API signs one.
 */
export async function createJobPhotoUpload(
  vendorId: string,
  contentType: string,
  folder: string
): Promise<{ uploadUrl: string; key: string }> {
  if (!privateJobPhotosOn() || !env.r2DocsBucket) {
    const { uploadUrl, key } = await createPresignedUpload(vendorId, contentType, folder)
    return { uploadUrl, key }
  }
  const key = `vendors/${vendorId}/${folder}/${randomUUID()}.${imageExtension(contentType)}`
  const uploadUrl = await getSignedUrl(
    makeR2Client(),
    new PutObjectCommand({ Bucket: env.r2DocsBucket, Key: key, ContentType: contentType }),
    { expiresIn: env.r2UploadUrlTtlSeconds }
  )
  return { uploadUrl, key }
}

/**
 * What a new row's `url` column holds for an uploaded key: the key itself
 * while photos are private, else the public address (as before).
 */
export function storedJobPhotoUrl(key: string): string {
  return privateJobPhotosOn() ? key : publicUrlForKey(key)
}

function imageTypeOf(key: string): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

let warnedUnsignable = false

/**
 * The address a viewer's app shows for a stored photo: a public row's own
 * URL, or a fresh presigned link to a private one. Empty (the tile shows
 * nothing) only when a private photo can't be signed because the private
 * bucket has since been unset; that is logged once, without the key.
 *
 * Call it only while building a payload for someone already allowed to see
 * the photo: the booking's customer, its garage (vendorId from
 * resolveTenant) or a super-admin.
 */
export function jobPhotoLink(stored: string, now = Date.now()): string {
  if (isPublicPhotoUrl(stored)) return stored
  if (!JOB_PHOTO_KEY.test(stored)) return ''
  if (!privateJobPhotosOn() || !env.r2DocsBucket) {
    if (!warnedUnsignable) {
      warnedUnsignable = true
      log.warn('job_photos:private_bucket_unset')
    }
    return ''
  }
  const window = JOB_PHOTO_LINK_WINDOW_SECONDS * 1000
  return presignGetUrl({
    endpoint: env.r2Endpoint ?? `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    pathStyle: Boolean(env.r2Endpoint),
    bucket: env.r2DocsBucket,
    key: stored,
    accessKeyId: env.r2AccessKeyId ?? '',
    secretAccessKey: env.r2SecretAccessKey ?? '',
    signedAt: new Date(Math.floor(now / window) * window),
    expiresInSeconds: JOB_PHOTO_LINK_TTL_SECONDS,
    response: {
      contentType: imageTypeOf(stored),
      cacheControl: `private, max-age=${JOB_PHOTO_LINK_TTL_SECONDS - JOB_PHOTO_LINK_WINDOW_SECONDS}`,
    },
  })
}

/**
 * A photo's bytes, for the API to pass on itself (the shared certificate's
 * photo route): from the public bucket for a public row, else the private
 * one. Null when nothing is there or storage can't be read; logged by kind
 * only, never by key.
 */
export async function readJobPhoto(photo: {
  storageKey: string
  url: string
}): Promise<{ body: Uint8Array; contentType: string | null } | null> {
  if (isPublicPhotoUrl(photo.url)) return readObject(photo.storageKey)
  if (!privateJobPhotosOn() || !env.r2DocsBucket || !JOB_PHOTO_KEY.test(photo.storageKey)) return null
  try {
    const object = await makeR2Client().send(
      new GetObjectCommand({ Bucket: env.r2DocsBucket, Key: photo.storageKey })
    )
    if (!object.Body) return null
    return { body: await object.Body.transformToByteArray(), contentType: object.ContentType ?? null }
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    log.warn({ status, name: (error as { name?: string }).name }, 'job_photos:read_failed')
    return null
  }
}

/**
 * Removes job photos' objects, best effort, once their rows are gone: from
 * the private bucket while it is on, and from the public one (rows from
 * before, or made while the private bucket was unset). Deleting a key a
 * bucket does not hold is harmless, so both are asked. Logged by count.
 */
export async function removeJobPhotoObjects(keys: readonly string[], why: string): Promise<void> {
  const photoKeys = keys.filter((key) => JOB_PHOTO_KEY.test(key))
  if (photoKeys.length === 0) return
  if (privateJobPhotosOn() && env.r2DocsBucket) {
    const client = makeR2Client()
    let failed = 0
    for (const key of photoKeys) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: env.r2DocsBucket, Key: key }))
      } catch {
        failed += 1
      }
    }
    if (failed > 0) log.warn({ photos: photoKeys.length, failed, why }, 'job_photos:private_delete_failed')
  }
  if (isStorageConfigured()) {
    for (const key of photoKeys) await deleteObject(key)
  }
}
