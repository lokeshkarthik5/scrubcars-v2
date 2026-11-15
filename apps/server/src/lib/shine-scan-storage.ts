/**
 * Where Shine Score scan photos live (0075): the PRIVATE bucket the garage
 * documents and job photos use (`R2_DOCS_BUCKET`, lib/document-storage.ts),
 * under `shine-scans/<scanId>/<area>.jpg`. No customer id in the key, no
 * public address, and no link is ever made to them: they are kept for
 * Detlio's own record of a score, then deleted with the scan after
 * SHINE_RULES.keepDays (the pending-digest cron, shineScoreService.sweep).
 *
 * Unlike job photos, the API writes these itself: the phone sends the four
 * re-encoded photos with the scan request, because the AI needs their bytes
 * anyway. With the private bucket unset (local dev), nothing is stored.
 */
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { isDocumentStorageConfigured } from './document-storage.js'
import { env } from './env.js'
import { logger } from './logger.js'
import { makeR2Client } from './storage.js'

const log = logger.child({ module: 'shine-scan-storage' })

/** Only keys under this folder are ever written or deleted here. */
const SHINE_SCAN_KEY = /^shine-scans\/[0-9a-f-]{36}\/[a-z]+\.(jpg|png|webp)$/

export function shineScanKey(scanId: string, area: string, mimeType: string): string {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  return `shine-scans/${scanId}/${area}.${ext}`
}

/** Whether scan photos are kept (the private bucket is set). */
export function shineScanStorageOn(): boolean {
  return isDocumentStorageConfigured() && Boolean(env.r2DocsBucket)
}

/**
 * Stores a scan's photos; returns the keys written. Best effort: a photo
 * that fails is left out (logged by count), and the score still stands.
 */
export async function putShineScanPhotos(
  photos: ReadonlyArray<{ key: string; body: Uint8Array; mimeType: string }>
): Promise<string[]> {
  if (!shineScanStorageOn()) return []
  const client = makeR2Client()
  const written: string[] = []
  for (const photo of photos) {
    if (!SHINE_SCAN_KEY.test(photo.key)) continue
    try {
      await client.send(
        new PutObjectCommand({ Bucket: env.r2DocsBucket, Key: photo.key, Body: photo.body, ContentType: photo.mimeType })
      )
      written.push(photo.key)
    } catch {
      // Counted below; the key is not logged.
    }
  }
  if (written.length < photos.length) {
    log.warn({ photos: photos.length, failed: photos.length - written.length }, 'shine_scans:put_failed')
  }
  return written
}

/**
 * Deletes scan photos, logged by count. Returns the keys that could not be
 * deleted (all of them while the private bucket is unset), so the caller
 * keeps those scans' rows and the next run tries again: a row is the only
 * record of where its photos are.
 */
export async function removeShineScanPhotos(keys: readonly string[]): Promise<string[]> {
  const scanKeys = keys.filter((key) => SHINE_SCAN_KEY.test(key))
  if (scanKeys.length === 0) return []
  if (!shineScanStorageOn()) {
    log.warn({ photos: scanKeys.length }, 'shine_scans:delete_skipped_no_bucket')
    return scanKeys
  }
  const client = makeR2Client()
  const failed: string[] = []
  for (const key of scanKeys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: env.r2DocsBucket, Key: key }))
    } catch {
      failed.push(key)
    }
  }
  if (failed.length > 0) log.warn({ photos: scanKeys.length, failed: failed.length }, 'shine_scans:delete_failed')
  return failed
}
