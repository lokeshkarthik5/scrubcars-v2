/**
 * The private bucket for garage documents (R2_DOCS_BUCKET).
 *
 * Unlike photos (lib/storage.ts), nothing here has a public URL: the bucket
 * has public access switched off, and a file is reached only through a
 * presigned link that this API makes for one viewer and that stops working
 * after DOCUMENT_LINK_TTL_SECONDS. Links are returned to the caller and never
 * stored, logged or put in an alert; logs name documents by id. Uploads go
 * browser → bucket on a presigned PUT, like photos, and are checked here
 * (HeadObject) before a row is written: the object must exist, be one of the
 * four types and fit the size cap.
 */
import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from './env.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'
import { makeR2Client } from './storage.js'
import {
  DOCUMENT_CONTENT_TYPES,
  DOCUMENT_LINK_TTL_SECONDS,
  DOCUMENT_UPLOAD_TTL_SECONDS,
  documentFolder,
  type DocumentContentType,
  type DocumentType,
} from './vendor-documents.js'

const log = logger.child({ module: 'document-storage' })

/**
 * Whether garage documents are on: the private bucket is named and the R2
 * account and keys are there. Read on every request, so a test can flip it.
 */
export function isDocumentStorageConfigured(): boolean {
  return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2DocsBucket)
}

function bucket(): string {
  if (!isDocumentStorageConfigured() || !env.r2DocsBucket) {
    // Routes are 404 before this while off; this is the belt to that brace.
    throw new AppError(404, 'Not found', 'NOT_FOUND')
  }
  return env.r2DocsBucket
}

/**
 * A one-file upload link into the garage's folder for this type. The size is
 * part of the signature, so the browser can only send a file of exactly the
 * size it declared (and that was checked against the cap).
 */
export async function createDocumentUpload(
  vendorId: string,
  type: DocumentType,
  contentType: DocumentContentType,
  sizeBytes: number
): Promise<{ uploadUrl: string; key: string; expiresInSeconds: number }> {
  const Bucket = bucket()
  const key = `${documentFolder(vendorId, type)}${randomUUID()}.${DOCUMENT_CONTENT_TYPES[contentType]}`
  const uploadUrl = await getSignedUrl(
    makeR2Client(),
    new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: DOCUMENT_UPLOAD_TTL_SECONDS }
  )
  return { uploadUrl, key, expiresInSeconds: DOCUMENT_UPLOAD_TTL_SECONDS }
}

/** What the bucket holds at a key, or null when nothing was uploaded there. */
export async function headDocument(
  key: string
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const Bucket = bucket()
  try {
    const head = await makeR2Client().send(new HeadObjectCommand({ Bucket, Key: key }))
    return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? null }
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404 || (error as { name?: string }).name === 'NotFound') return null
    // Said in our words and logged by kind only: the SDK's error carries the
    // bucket and key, which have no business in a log or a crash report.
    log.warn({ status, name: (error as { name?: string }).name }, 'documents:head_failed')
    throw new AppError(503, 'Document storage is not answering. Please try again.', 'DOCUMENT_STORAGE_UNAVAILABLE')
  }
}

/**
 * A link to view one file, for DOCUMENT_LINK_TTL_SECONDS. Served inline as
 * the type recorded for it (never the type the uploader claimed at PUT time,
 * which the signature does not cover), and marked not to be cached.
 */
export async function createDocumentViewUrl(
  key: string,
  contentType: DocumentContentType
): Promise<{ url: string; expiresInSeconds: number }> {
  const Bucket = bucket()
  const url = await getSignedUrl(
    makeR2Client(),
    new GetObjectCommand({
      Bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: 'inline',
      ResponseCacheControl: 'private, no-store',
    }),
    { expiresIn: DOCUMENT_LINK_TTL_SECONDS }
  )
  return { url, expiresInSeconds: DOCUMENT_LINK_TTL_SECONDS }
}

/**
 * Removes files, best effort: after a replace, a refused upload or Delete
 * forever, once the rows have committed. A failure leaves a file nobody can
 * reach (no row names it and the bucket is private) and is logged by count,
 * never by key. Does nothing while documents are off, saying so.
 */
export async function deleteDocumentObjects(keys: readonly string[], why: string): Promise<void> {
  if (keys.length === 0) return
  if (!isDocumentStorageConfigured() || !env.r2DocsBucket) {
    log.warn({ files: keys.length, why }, 'documents:delete_skipped_storage_off')
    return
  }
  const client = makeR2Client()
  let failed = 0
  for (const key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: env.r2DocsBucket, Key: key }))
    } catch {
      failed += 1
    }
  }
  if (failed > 0) log.warn({ files: keys.length, failed, why }, 'documents:delete_failed')
  else log.info({ files: keys.length, why }, 'documents:deleted')
}
