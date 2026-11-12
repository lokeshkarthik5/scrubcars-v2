/**
 * Where a garage's payment QR lives (Garage Book payment details, 0073).
 *
 * The garage uploads its GPay/PhonePe/Paytm QR the way job photos go up
 * (lib/job-photo-storage.ts): browser → bucket on a presigned PUT, the image
 * re-encoded in the browser first (stripImageMetadata) so no EXIF or GPS
 * rides along. It goes to the private bucket (R2_DOCS_BUCKET) while that is
 * on, under `vendors/<vendorId>/pay-qr/…`, else to the public photo bucket,
 * exactly as job photos fall back. The row keeps the KEY only, and every
 * reader gets a short-lived link made for them: the owner's settings, and
 * the public bill page while the bill is unpaid.
 *
 * Only PNG and JPEG: the server reads the QR when the owner saves
 * (lib/upi-qr.ts), and those are the two it decodes.
 */
import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { isDocumentStorageConfigured } from './document-storage.js'
import { env } from './env.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'
import { presignGetUrl } from './r2-presign.js'
import { createPresignedUpload, deleteObject, isStorageConfigured, makeR2Client, publicUrlForKey, readObject } from './storage.js'

const log = logger.child({ module: 'garage-pay-qr-storage' })

export const PAY_QR_TYPES = ['image/png', 'image/jpeg'] as const
export type PayQrType = (typeof PAY_QR_TYPES)[number]

/** A QR picture bigger than this is not read (a phone photo is 2–5 MB). */
export const PAY_QR_MAX_BYTES = 8 * 1024 * 1024

const LINK_TTL_SECONDS = 15 * 60
const LINK_WINDOW_SECONDS = 5 * 60

/** Whether `key` is one of this garage's payment QR keys, and nothing else in either bucket. */
export function isPayQrKey(vendorId: string, key: string): boolean {
  const escaped = vendorId.replace(/[^0-9a-f-]/gi, '')
  return new RegExp(`^vendors/${escaped}/pay-qr/[0-9a-f-]{36}\\.(png|jpg)$`, 'i').test(key)
}

function privateOn(): boolean {
  return isDocumentStorageConfigured() && Boolean(env.r2DocsBucket)
}

/** A presigned upload for the garage's QR picture. Only the key goes back: it is saved by key. */
export async function createPayQrUpload(vendorId: string, contentType: PayQrType): Promise<{ uploadUrl: string; key: string }> {
  const ext = contentType === 'image/png' ? 'png' : 'jpg'
  if (privateOn()) {
    const key = `vendors/${vendorId}/pay-qr/${randomUUID()}.${ext}`
    const uploadUrl = await getSignedUrl(
      makeR2Client(),
      new PutObjectCommand({ Bucket: env.r2DocsBucket!, Key: key, ContentType: contentType }),
      { expiresIn: env.r2UploadUrlTtlSeconds }
    )
    return { uploadUrl, key }
  }
  if (!isStorageConfigured()) {
    throw new AppError(503, 'Photo storage is not configured', 'STORAGE_NOT_CONFIGURED')
  }
  const { uploadUrl, key } = await createPresignedUpload(vendorId, contentType, 'pay-qr')
  return { uploadUrl, key }
}

/**
 * The QR picture's bytes, for reading it when the owner saves. Null when
 * nothing is stored there, it is too big, or storage can't be read: the
 * details are saved anyway and the owner asked to check the picture.
 */
export async function readPayQr(key: string): Promise<Uint8Array | null> {
  if (privateOn()) {
    try {
      const object = await makeR2Client().send(new GetObjectCommand({ Bucket: env.r2DocsBucket!, Key: key }))
      if (object.Body && (object.ContentLength ?? 0) <= PAY_QR_MAX_BYTES) return await object.Body.transformToByteArray()
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      log.warn({ status, name: (error as { name?: string }).name }, 'pay_qr:read_failed')
    }
  }
  if (!isStorageConfigured()) return null
  const object = await readObject(key)
  if (!object || object.body.byteLength > PAY_QR_MAX_BYTES) return null
  return object.body
}

/**
 * A link that shows the QR picture, for LINK_TTL_SECONDS, signed at the start
 * of a window so repeat reads get the same link. Call it only while building
 * an answer for someone who may see it: the garage's owner, or the public
 * page of the garage's own unpaid bill.
 */
export function payQrLink(key: string, now = Date.now()): string | null {
  if (privateOn()) {
    const window = LINK_WINDOW_SECONDS * 1000
    return presignGetUrl({
      endpoint: env.r2Endpoint ?? `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      pathStyle: Boolean(env.r2Endpoint),
      bucket: env.r2DocsBucket!,
      key,
      accessKeyId: env.r2AccessKeyId ?? '',
      secretAccessKey: env.r2SecretAccessKey ?? '',
      signedAt: new Date(Math.floor(now / window) * window),
      expiresInSeconds: LINK_TTL_SECONDS,
      response: {
        contentType: key.endsWith('.png') ? 'image/png' : 'image/jpeg',
        cacheControl: `private, max-age=${LINK_TTL_SECONDS - LINK_WINDOW_SECONDS}`,
      },
    })
  }
  return isStorageConfigured() ? publicUrlForKey(key) : null
}

/** Removes an old QR picture after it was replaced, best effort, from both buckets. Logged by kind only. */
export async function removePayQr(key: string): Promise<void> {
  if (privateOn()) {
    try {
      await makeR2Client().send(new DeleteObjectCommand({ Bucket: env.r2DocsBucket!, Key: key }))
    } catch (error) {
      log.warn({ name: (error as { name?: string }).name }, 'pay_qr:delete_failed')
    }
  }
  if (isStorageConfigured()) await deleteObject(key)
}

/** The four together, called through this object so a test can stand in for the bucket. */
export const payQrStorage = { createPayQrUpload, readPayQr, payQrLink, removePayQr }
