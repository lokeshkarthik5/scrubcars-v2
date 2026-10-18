import { randomBytes } from 'node:crypto'
import { env } from './env.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'
import {
  BASIC_UPLOAD_MAX_BYTES,
  MAX_VIDEO_SECONDS,
  streamUrls,
  type StreamVideo,
} from './service-media.js'

/**
 * Cloudflare Stream, over plain fetch — four calls do not need an SDK.
 *
 * The garage's phone uploads the file straight to Stream with a one-time
 * link this server asks for (a "direct creator upload"), so a 200 MB video
 * never passes through a Vercel function. Stream encodes it for adaptive
 * playback up to Full HD and calls POST /api/v1/webhooks/cloudflare-stream
 * when it is ready or has failed; the rules for reading its answers live in
 * lib/service-media.ts.
 *
 * Under STREAM_FAKE (E2E only, refused in production) nothing here reaches
 * Cloudflare: uploads go to this API's own fake endpoint and a spec fires the
 * webhook itself.
 */

const log = logger.child({ module: 'stream' })

const API = 'https://api.cloudflare.com/client/v4'
const TIMEOUT_MS = 10_000

/** Video is on only when every piece it needs is set (docs/service-media.md). */
export function isStreamEnabled(): boolean {
  return Boolean(
    env.cloudflareAccountId &&
      env.cloudflareStreamApiToken &&
      env.cloudflareStreamCustomerCode &&
      env.cloudflareStreamWebhookSecret
  )
}

function unavailable(): AppError {
  return new AppError(
    503,
    'Video upload is not available right now. Try again in a few minutes.',
    'VIDEO_UNAVAILABLE'
  )
}

function accountUrl(path: string): string {
  return `${API}/accounts/${env.cloudflareAccountId}/stream${path}`
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.cloudflareStreamApiToken}` }
}

/** The poster and HLS addresses of a video; the fake serves its own. */
export function videoUrls(uid: string): { posterUrl: string; hlsUrl: string } {
  if (env.streamFake) {
    const base = `${env.streamFakeBaseUrl}/api/v1/fake-stream/${uid}`
    return { posterUrl: `${base}/thumbnail.png`, hlsUrl: `${base}/manifest.m3u8` }
  }
  return streamUrls(env.cloudflareStreamCustomerCode ?? '', uid)
}

export type VideoUpload = {
  uid: string
  /**
   * 'basic': POST the file as multipart form field `file` to uploadUrl.
   * 'tus': hand uploadUrl to a tus client as an existing upload to resume.
   */
  mode: 'basic' | 'tus'
  uploadUrl: string
}

/**
 * A one-time upload link for one video of at most MAX_VIDEO_SECONDS. Files up
 * to 200 MB take the basic upload; larger ones a resumable tus upload, which
 * Stream creates here with the file's declared length so the phone never
 * needs our API token. `creator` names who uploaded it in Stream's dashboard.
 */
export async function createVideoUpload(input: {
  serviceId: string
  creator: string
  sizeBytes: number
}): Promise<VideoUpload> {
  if (env.streamFake) {
    const uid = randomBytes(16).toString('hex')
    return {
      uid,
      mode: 'basic',
      uploadUrl: `${env.streamFakeBaseUrl}/api/v1/fake-stream/upload/${uid}`,
    }
  }

  if (input.sizeBytes <= BASIC_UPLOAD_MAX_BYTES) {
    const res = await fetch(accountUrl('/direct_upload'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxDurationSeconds: MAX_VIDEO_SECONDS,
        creator: input.creator,
        meta: { serviceId: input.serviceId },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => null)) as {
      success?: boolean
      result?: { uid?: string; uploadURL?: string }
    } | null

    if (!res.ok || !body?.success || !body.result?.uid || !body.result.uploadURL) {
      log.error({ status: res.status, serviceId: input.serviceId }, 'stream:direct-upload-failed')
      throw unavailable()
    }
    return { uid: body.result.uid, mode: 'basic', uploadUrl: body.result.uploadURL }
  }

  // tus metadata is `key base64(value)` pairs. `name` becomes the video's
  // meta.name, which is all the dashboard shows of the service.
  const b64 = (value: string) => Buffer.from(value).toString('base64')
  const res = await fetch(accountUrl('?direct_user=true'), {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(input.sizeBytes),
      'Upload-Creator': input.creator,
      'Upload-Metadata': `maxdurationseconds ${b64(String(MAX_VIDEO_SECONDS))},name ${b64(`service ${input.serviceId}`)}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const uploadUrl = res.headers.get('location')
  const uid = res.headers.get('stream-media-id')
  if (res.status !== 201 || !uploadUrl || !uid) {
    log.error({ status: res.status, serviceId: input.serviceId }, 'stream:tus-create-failed')
    throw unavailable()
  }
  return { uid, mode: 'tus', uploadUrl }
}

/**
 * Stream's current view of a video, for the status poll that backs up the
 * webhook. Null when Stream has no such video (deleted, or an upload link
 * that was never used and has expired) or, under the fake, always: the fake's
 * videos change only by webhook.
 */
export async function getVideo(uid: string): Promise<StreamVideo | null> {
  if (env.streamFake) return null

  const res = await fetch(accountUrl(`/${uid}`), {
    headers: authHeaders(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 404) return null

  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    result?: StreamVideo
  } | null
  if (!res.ok || !body?.success || !body.result) {
    log.warn({ status: res.status, uid }, 'stream:get-failed')
    throw unavailable()
  }
  return body.result
}

/**
 * Remove a video from Stream. Best effort: called after the row is gone, so
 * a failure only leaves Stream holding a video nobody can reach, and is
 * logged for whoever tidies the dashboard.
 */
export async function deleteVideo(uid: string): Promise<void> {
  if (env.streamFake || !isStreamEnabled()) return
  try {
    const res = await fetch(accountUrl(`/${uid}`), {
      method: 'DELETE',
      headers: authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok && res.status !== 404) {
      log.warn({ status: res.status, uid }, 'stream:delete-failed')
    }
  } catch (error) {
    log.warn({ uid, error }, 'stream:delete-failed')
  }
}
