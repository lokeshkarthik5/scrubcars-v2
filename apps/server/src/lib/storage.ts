import { randomUUID } from 'node:crypto'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from './env.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'

const log = logger.child({ module: 'storage' })

// Allowed upload content types → file extension used in the object key.
const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const ALLOWED_IMAGE_TYPES = Object.keys(CONTENT_TYPE_EXT)

/** The key's extension for an allowed image type; 400 for anything else. */
export function imageExtension(contentType: string): string {
  const ext = CONTENT_TYPE_EXT[contentType]
  if (!ext) {
    throw new AppError(
      400,
      'Unsupported image type. Use JPEG, PNG or WebP.',
      'UNSUPPORTED_IMAGE_TYPE'
    )
  }
  return ext
}

function getClient(): S3Client {
  if (
    !env.r2AccountId ||
    !env.r2AccessKeyId ||
    !env.r2SecretAccessKey ||
    !env.r2Bucket ||
    !env.r2PublicBaseUrl
  ) {
    throw new AppError(
      503,
      'Photo storage is not configured',
      'STORAGE_NOT_CONFIGURED'
    )
  }

  return makeR2Client()
}

/**
 * The S3 client for Cloudflare R2, with the account's keys. Shared by the
 * public photo bucket here and the private documents bucket
 * (lib/document-storage.ts): one account, one set of keys, two buckets.
 * Callers check their own bucket is configured first.
 */
export function makeR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: env.r2Endpoint ?? `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    // R2 serves buckets from the account subdomain; a local MinIO puts the
    // bucket in the path. Only the override needs path style.
    forcePathStyle: Boolean(env.r2Endpoint),
    credentials: {
      accessKeyId: env.r2AccessKeyId ?? '',
      secretAccessKey: env.r2SecretAccessKey ?? '',
    },
    // The SDK otherwise injects a CRC32 checksum into presigned PUT URLs, which
    // R2 rejects (the checksum is computed without the body at presign time).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

export function isStorageConfigured(): boolean {
  return Boolean(
    env.r2AccountId &&
      env.r2AccessKeyId &&
      env.r2SecretAccessKey &&
      env.r2Bucket &&
      env.r2PublicBaseUrl
  )
}

export type PresignedUpload = {
  uploadUrl: string
  key: string
  publicUrl: string
}

/**
 * Create a short-lived presigned PUT URL scoped to a single vendor's prefix.
 * The client uploads the bytes directly to R2, then registers `publicUrl`.
 */
export async function createPresignedUpload(
  vendorId: string,
  contentType: string,
  folder?: string
): Promise<PresignedUpload> {
  const ext = CONTENT_TYPE_EXT[contentType]
  if (!ext) {
    throw new AppError(
      400,
      'Unsupported image type. Use JPEG, PNG or WebP.',
      'UNSUPPORTED_IMAGE_TYPE'
    )
  }

  const client = getClient()
  const prefix = folder ? `${folder}/` : ''
  const key = `vendors/${vendorId}/${prefix}${randomUUID()}.${ext}`

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: env.r2UploadUrlTtlSeconds }
  )

  return {
    uploadUrl,
    key,
    publicUrl: `${env.r2PublicBaseUrl}/${key}`,
  }
}

/**
 * Create a short-lived presigned PUT URL scoped to a single user's prefix,
 * used for the optional customer profile picture (avatar).
 */
export async function createUserUpload(
  userId: string,
  contentType: string,
  folder = 'avatar'
): Promise<PresignedUpload> {
  const ext = CONTENT_TYPE_EXT[contentType]
  if (!ext) {
    throw new AppError(
      400,
      'Unsupported image type. Use JPEG, PNG or WebP.',
      'UNSUPPORTED_IMAGE_TYPE'
    )
  }

  const client = getClient()
  const key = `users/${userId}/${folder}/${randomUUID()}.${ext}`

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: env.r2UploadUrlTtlSeconds }
  )

  return {
    uploadUrl,
    key,
    publicUrl: `${env.r2PublicBaseUrl}/${key}`,
  }
}

/**
 * A short-lived presigned PUT for one exact key, type and size, for uploads
 * whose folder the caller decides (the Garage's card pictures, 0057, wait
 * under ai-temp/ until the admin uses them). The signed Content-Length makes
 * R2 refuse any other size.
 */
export async function createPresignedPutForKey(key: string, contentType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string }> {
  const client = getClient()
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: env.r2UploadUrlTtlSeconds }
  )
  return { uploadUrl, key }
}

/**
 * Write an object from the server itself, for files this API makes rather
 * than receives (the admin's AI pictures). Throws on failure: the caller is
 * about to hand out the URL.
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string
): Promise<string> {
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
  return publicUrlForKey(key)
}

/**
 * Copy an object to a new key in the same bucket, without the bytes passing
 * through this server. Throws on failure.
 */
export async function copyObject(fromKey: string, toKey: string): Promise<string> {
  const client = getClient()
  await client.send(
    new CopyObjectCommand({
      Bucket: env.r2Bucket,
      CopySource: `${env.r2Bucket}/${fromKey}`,
      Key: toKey,
    })
  )
  return publicUrlForKey(toKey)
}

/**
 * An object's bytes, read by this server to pass on: the Service History
 * certificate's public page (0053) shows job photos through the API rather
 * than at their stored addresses. Null when nothing is stored there or the
 * bucket can't be read; logged by kind only, never by key. A job photo in
 * the private bucket is read by lib/job-photo-storage.ts instead.
 */
export async function readObject(
  key: string
): Promise<{ body: Uint8Array; contentType: string | null } | null> {
  try {
    const client = getClient()
    const object = await client.send(
      new GetObjectCommand({ Bucket: env.r2Bucket, Key: key })
    )
    if (!object.Body) return null
    return {
      body: await object.Body.transformToByteArray(),
      contentType: object.ContentType ?? null,
    }
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    log.warn({ status, name: (error as { name?: string }).name }, 'storage:read_failed')
    return null
  }
}

/**
 * What the bucket holds at `key`: its size and stored type, or null when
 * nothing is there. For uploads registered by key (the garage agreement's
 * PDF, 0063), checked before a row is written. Throws 503 when the bucket
 * can't be read, said in our words and logged by kind only (the SDK's error
 * carries the bucket and key).
 */
export async function headObject(
  key: string
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  try {
    const head = await getClient().send(new HeadObjectCommand({ Bucket: env.r2Bucket, Key: key }))
    return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? null }
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404 || (error as { name?: string }).name === 'NotFound') return null
    log.warn({ status, name: (error as { name?: string }).name }, 'storage:head_failed')
    throw new AppError(503, 'File storage is not answering. Please try again.', 'STORAGE_UNAVAILABLE')
  }
}

/**
 * The first `bytes` bytes of an object (a Range read), to check what a file
 * really is whatever its name says. Null when it can't be read.
 */
export async function readObjectStart(key: string, bytes: number): Promise<Uint8Array | null> {
  try {
    const object = await getClient().send(
      new GetObjectCommand({ Bucket: env.r2Bucket, Key: key, Range: `bytes=0-${bytes - 1}` })
    )
    if (!object.Body) return null
    return await object.Body.transformToByteArray()
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    log.warn({ status, name: (error as { name?: string }).name }, 'storage:read_start_failed')
    return null
  }
}

/** Best-effort delete of an object; logs but does not throw on failure. */
export async function deleteObject(key: string): Promise<void> {
  try {
    const client = getClient()
    await client.send(
      new DeleteObjectCommand({ Bucket: env.r2Bucket, Key: key })
    )
  } catch (error) {
    log.warn({ key, error }, 'storage:delete_failed')
  }
}

/**
 * Validate that a client-supplied URL really points at our bucket and return
 * the object key. Prevents registering arbitrary external URLs as photos.
 */
export function keyFromPublicUrl(url: string): string | null {
  if (!env.r2PublicBaseUrl) return null
  const prefix = `${env.r2PublicBaseUrl}/`
  if (!url.startsWith(prefix)) return null
  const key = url.slice(prefix.length)
  return key.length > 0 ? key : null
}

/**
 * The public URL of an object this server let someone upload. For flows that
 * register an upload by its key (job photos) rather than by the URL the
 * client was handed, so the URL is always built here and never trusted from
 * the request.
 */
export function publicUrlForKey(key: string): string {
  if (!env.r2PublicBaseUrl) {
    throw new AppError(
      503,
      'Photo storage is not configured',
      'STORAGE_NOT_CONFIGURED'
    )
  }
  return `${env.r2PublicBaseUrl}/${key}`
}
