/**
 * The rules for a service's photos and video: how many, who may see what,
 * what a Cloudflare Stream answer means for the row, and how a Stream webhook
 * is proven to be Stream's. Pure and clock-free (the caller passes `now`), so
 * every rule is a one-line test; lib/stream.ts does the fetching and
 * modules/service-media the writing.
 *
 * Owner decisions (16 Oct 2026): up to 3 photos and one video of at most 60
 * seconds per service, added by the garage from its own app or by admin;
 * every upload carries the privacy tick; anything AI-made is shown to
 * customers as a sample, never as the garage's own work.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type MediaKind = 'image' | 'video'
export type MediaSource = 'upload' | 'ai'
export type VideoStatus = 'processing' | 'ready' | 'error'

/** One video per service: the details sheet has one 16:9 player. */
export const MAX_VIDEOS_PER_SERVICE = 1

/**
 * The longest video a garage may add. Stream enforces it on the real file
 * (maxDurationSeconds on the upload); the apps check it first so nobody waits
 * for an upload that will be refused. Mirrored in packages/core/src/service-media.ts.
 */
export const MAX_VIDEO_SECONDS = 60

/**
 * Stream's basic (one POST) upload takes files up to 200 MB; anything larger
 * goes through a resumable tus upload instead.
 */
export const BASIC_UPLOAD_MAX_BYTES = 200 * 1024 * 1024

/**
 * The largest video file accepted at all. A minute of 4K from a recent phone
 * is around 400 MB, so this leaves room without letting a mistaken pick (a
 * whole film) start a multi-gigabyte upload.
 */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

/**
 * How long a video may sit in 'processing' while Stream still says the upload
 * never arrived. Stream's own upload links expire after 30 minutes; past this
 * the garage's phone went away mid-upload and the slot should be theirs again.
 */
export const ABANDONED_UPLOAD_MS = 2 * 60 * 60 * 1000

/** The privacy tick's sentence, as the apps show it. */
export const CONSENT_SENTENCE =
  'no number plates or faces can be read, or the owner agreed'

/** The fields of a service_images row these rules read. */
export type MediaRow = {
  id: string
  kind: MediaKind
  source: MediaSource
  url: string
  sortOrder: number
  createdAt: Date
  consentConfirmedAt: Date | null
  uploadedBy: string | null
  videoUid: string | null
  videoStatus: VideoStatus | null
  videoError: string | null
  durationSecs: number | null
  posterUrl: string | null
}

/**
 * What a customer may see of one photo or video. Nothing about who added it
 * or the privacy tick: those are the garage's and Detlio's business, not the
 * customer's. `source` stays because an AI picture must be labelled a sample.
 */
export type PublicServiceMedia = {
  id: string
  kind: MediaKind
  /** A photo's URL, or a video's HLS manifest. */
  url: string
  /** A video's poster frame; null for a photo. */
  posterUrl: string | null
  /** A video's length in whole seconds; null for a photo. */
  durationSecs: number | null
  source: MediaSource
}

/** What the garage's app and admin see: the public fields plus the state. */
export type ManagedServiceMedia = PublicServiceMedia & {
  /** Null for a photo. */
  videoStatus: VideoStatus | null
  /** Why a video failed, in plain words. */
  videoError: string | null
  uploadedBy: string | null
  createdAt: string
}

/** Videos first (the sheet's 16:9 area), then photos in their order. */
function mediaOrder(a: MediaRow, b: MediaRow): number {
  if (a.kind !== b.kind) return a.kind === 'video' ? -1 : 1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * The customer's view of a service's media: photos, and a video only once
 * Stream says it is ready to play. A processing or failed video does not
 * exist as far as a customer is concerned.
 */
export function toPublicMedia(rows: readonly MediaRow[]): PublicServiceMedia[] {
  return rows
    .filter((row) => row.kind === 'image' || row.videoStatus === 'ready')
    .sort(mediaOrder)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      url: row.url,
      posterUrl: row.kind === 'video' ? row.posterUrl : null,
      durationSecs: row.kind === 'video' ? row.durationSecs : null,
      source: row.source,
    }))
}

/** The garage's and admin's view: every row, with its state. */
export function toManagedMedia(rows: readonly MediaRow[]): ManagedServiceMedia[] {
  return [...rows].sort(mediaOrder).map((row) => ({
    id: row.id,
    kind: row.kind,
    url: row.url,
    posterUrl: row.kind === 'video' ? row.posterUrl : null,
    durationSecs: row.kind === 'video' ? row.durationSecs : null,
    source: row.source,
    videoStatus: row.kind === 'video' ? row.videoStatus : null,
    videoError: row.kind === 'video' ? row.videoError : null,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * The photos that count against the photo limit when a real photo is being
 * added. AI pictures do not: they are samples that stand in until a real
 * photo arrives, and adding one removes them (the admin sheet promises it).
 */
export function photosCountingAgainstLimit(
  rows: readonly Pick<MediaRow, 'kind' | 'source'>[],
  adding: MediaSource
): number {
  return rows.filter(
    (row) => row.kind === 'image' && (adding === 'ai' || row.source === 'upload')
  ).length
}

/**
 * Replacing a video never takes the old one away before the new one can
 * play. The garage's phone may lose signal mid-upload, the app may be
 * closed, or Stream may refuse the clip; until the new video is ready the
 * old one stays on the garage page, and if the new one fails or is removed
 * the old one simply carries on.
 *
 * So for a moment a service can hold two video rows: the ready one customers
 * see, and the one replacing it, not yet ready. Never more: these three rules,
 * applied under the service's media lock, keep it to that.
 */

/**
 * Whether a video row leaves no room for a new upload. Without `replaces`
 * every video counts. With it, the row being replaced does not, and neither
 * does a ready video (the one a pending replacement is standing in for), so a
 * failed replacement can itself be replaced; a second upload in flight still
 * counts, so two replacements cannot run at once.
 */
export function videoCountsOnStart(
  row: Pick<MediaRow, 'id' | 'kind' | 'videoStatus'>,
  replaces: string | undefined
): boolean {
  if (row.kind !== 'video') return false
  if (!replaces) return true
  return row.id !== replaces && row.videoStatus !== 'ready'
}

/**
 * The rows a new upload removes as it starts: only the video it replaces, and
 * only when that one is not ready (still processing, or failed), since
 * customers cannot see it anyway. A ready video waits for its replacement to
 * be ready (removedWhenVideoReady). AI samples wait too.
 */
export function removedOnVideoStart(
  row: Pick<MediaRow, 'id' | 'kind' | 'videoStatus'>,
  replaces: string | undefined
): boolean {
  return row.kind === 'video' && row.id === replaces && row.videoStatus !== 'ready'
}

/**
 * The rows a video removes the moment it becomes ready: the earlier video it
 * replaces (the only other video a service can hold then) and any AI samples,
 * which stand in only until there is real media.
 */
export function removedWhenVideoReady(
  row: Pick<MediaRow, 'id' | 'kind' | 'source'>,
  readyId: string
): boolean {
  if (row.id === readyId) return false
  return row.kind === 'video' || row.source === 'ai'
}

/**
 * Whether the service already has a real photo or video, which is when an AI
 * sample is no longer wanted ("Only when there's no real photo").
 */
export function hasRealMedia(rows: readonly Pick<MediaRow, 'source'>[]): boolean {
  return rows.some((row) => row.source === 'upload')
}

/** The privacy tick, as the API receives it: only a literal true counts. */
export function consentGiven(consent: unknown): boolean {
  return consent === true
}

/** "0:45", "1:12": a video length as the apps print it. */
export function formatClipLength(totalSecs: number): string {
  const secs = Math.max(0, Math.round(totalSecs))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

// ─── Cloudflare Stream ───────────────────────────────────────────────────────

/** A Stream video uid: 32 hex characters. */
export function isStreamUid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
}

/** The parts of Stream's video object (API reads and webhooks) used here. */
export type StreamVideo = {
  uid?: string
  readyToStream?: boolean
  duration?: number
  status?: {
    state?: string
    errorReasonCode?: string
    errorReasonText?: string
  }
}

/** What a Stream answer means for the row. Null: nothing has changed yet. */
export type VideoUpdate =
  | { videoStatus: 'ready'; durationSecs: number }
  | { videoStatus: 'error'; videoError: string }

export const VIDEO_TOO_LONG_MESSAGE =
  'Longer than 60 seconds — trim it on the phone and upload again'
const VIDEO_UNREADABLE_MESSAGE =
  'This file could not be read as a video — try another file'
const VIDEO_FAILED_MESSAGE =
  'This video could not be processed — try uploading it again'
export const VIDEO_ABANDONED_MESSAGE =
  'The upload did not finish — try uploading it again'

/**
 * A failed video's reason, in words for the garage. Stream's own text is
 * written for developers and never shown.
 */
export function streamErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'ERR_DURATION_EXCEED_CONSTRAINT':
      return VIDEO_TOO_LONG_MESSAGE
    case 'ERR_MALFORMED_VIDEO':
    case 'ERR_UNKNOWN_INPUT_FORMAT':
    case 'ERR_NON_VIDEO':
    case 'ERR_INVALID_SOURCE':
      return VIDEO_UNREADABLE_MESSAGE
    default:
      return VIDEO_FAILED_MESSAGE
  }
}

/**
 * Reads a Stream video object. Ready means Stream can play it everywhere
 * (`readyToStream`), not merely that encoding started. A ready video longer
 * than the limit is refused here too: Stream enforces maxDurationSeconds, so
 * this only matters if that ever stops being true.
 */
export function videoUpdateFrom(video: StreamVideo): VideoUpdate | null {
  if (video.status?.state === 'error') {
    return { videoStatus: 'error', videoError: streamErrorMessage(video.status.errorReasonCode) }
  }

  if (video.readyToStream === true) {
    const duration = typeof video.duration === 'number' && video.duration > 0 ? video.duration : 0
    // Stream reports fractional seconds; a 60.4 s clip is a 60 s clip.
    if (duration > MAX_VIDEO_SECONDS + 0.5) {
      return { videoStatus: 'error', videoError: VIDEO_TOO_LONG_MESSAGE }
    }
    return { videoStatus: 'ready', durationSecs: Math.round(duration) }
  }

  return null
}

/**
 * Whether a video still waiting for its upload has been waiting too long:
 * Stream says nothing arrived (`pendingupload`) and the row is older than
 * ABANDONED_UPLOAD_MS.
 */
export function uploadAbandoned(
  state: string | undefined,
  createdAt: Date,
  now: number
): boolean {
  return state === 'pendingupload' && now - createdAt.getTime() > ABANDONED_UPLOAD_MS
}

/** Where Stream serves a video's poster frame and its adaptive (HLS) stream. */
export function streamUrls(customerCode: string, uid: string) {
  const base = `https://customer-${customerCode}.cloudflarestream.com/${uid}`
  return {
    posterUrl: `${base}/thumbnails/thumbnail.jpg?time=1s`,
    hlsUrl: `${base}/manifest/video.m3u8`,
  }
}

/** How far a webhook's signing time may be from our clock. */
export const WEBHOOK_TOLERANCE_SECS = 5 * 60

/**
 * Whether a Stream webhook really came from Stream.
 *
 * Stream signs each request with the account's webhook secret: the
 * Webhook-Signature header is `time=<unix seconds>,sig1=<hex>`, where sig1 is
 * HMAC-SHA256 of `<time>.<raw body>`. A signature on a body we did not
 * receive, or one signed too long ago to be anything but a replay, is refused.
 */
export function verifyStreamSignature(input: {
  header: string | undefined | null
  rawBody: string
  secret: string
  nowSecs: number
  toleranceSecs?: number
}): boolean {
  if (!input.header || !input.secret) return false

  const parts = new Map<string, string>()
  for (const part of input.header.split(',')) {
    const at = part.indexOf('=')
    if (at > 0) parts.set(part.slice(0, at).trim(), part.slice(at + 1).trim())
  }

  const time = parts.get('time')
  const sig = parts.get('sig1')
  if (!time || !sig || !/^\d+$/.test(time) || !/^[0-9a-f]{64}$/i.test(sig)) return false

  const tolerance = input.toleranceSecs ?? WEBHOOK_TOLERANCE_SECS
  if (Math.abs(input.nowSecs - Number(time)) > tolerance) return false

  const expected = createHmac('sha256', input.secret)
    .update(`${time}.${input.rawBody}`)
    .digest('hex')

  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig.toLowerCase(), 'hex'))
}

/** The header Stream would send for this body at this time. Tests and the fake use it. */
export function signStreamWebhook(rawBody: string, secret: string, timeSecs: number): string {
  const sig = createHmac('sha256', secret).update(`${timeSecs}.${rawBody}`).digest('hex')
  return `time=${timeSecs},sig1=${sig}`
}

// ─── AI sample pictures ──────────────────────────────────────────────────────

/**
 * Added to every AI picture prompt, whatever the admin types: the look of
 * Detlio's dark screens, and nothing that could pass for a real customer's
 * car or a real person.
 */
export const AI_PICTURE_STYLE =
  'photorealistic, dark graphite studio, soft light, no people, no text, no logos, no number plates'

/** The longest description the admin can type. */
export const AI_PROMPT_MAX = 400

/**
 * The prompt sent to the image model. The admin's description is cleaned of
 * anything that could be personal data before it leaves Detlio: email
 * addresses, phone-length digit runs and Indian number plates (TN 09 AB 1234)
 * are removed, so a pasted note cannot carry a customer's details to OpenAI.
 */
export function buildAiPicturePrompt(subject: string): string {
  const cleaned = subject
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ')
    .replace(/\b[A-Za-z]{2}[\s-]?\d{1,2}[\s-]?[A-Za-z]{0,3}[\s-]?\d{3,4}\b/g, ' ')
    .replace(/\+?\d[\d\s-]{5,}\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AI_PROMPT_MAX)
    .replace(/[\s.,;:]+$/, '')

  return `${cleaned}. Style: ${AI_PICTURE_STYLE}.`
}

/**
 * Where generated pictures wait for the admin to pick one. Top-level and
 * per service, so one R2 lifecycle rule on `ai-temp/` clears the ones nobody
 * picked (docs/service-media.md), and a pick can be checked to belong to the
 * service it is being added to.
 */
export function aiTempPrefix(serviceId: string): string {
  return `ai-temp/${serviceId}/`
}

/** Whether a key is one of this service's waiting AI pictures. */
export function isAiTempKeyFor(key: string, serviceId: string): boolean {
  const prefix = aiTempPrefix(serviceId)
  if (!key.startsWith(prefix)) return false
  return /^[0-9a-f-]{36}\.(webp|png|jpeg)$/.test(key.slice(prefix.length))
}

/**
 * Whether an uploaded photo's key sits under this service's own folder
 * (`vendors/<vendorId>/services/<serviceId>/`), which is where its upload URL
 * put it. Stops one garage registering another garage's object as its own.
 */
export function isServicePhotoKey(key: string, vendorId: string, serviceId: string): boolean {
  const prefix = `vendors/${vendorId}/services/${serviceId}/`
  return key.startsWith(prefix) && /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key.slice(prefix.length))
}
