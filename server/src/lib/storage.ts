import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
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

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
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
