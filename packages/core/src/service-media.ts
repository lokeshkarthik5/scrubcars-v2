import type { ServiceCategory, ServiceImage, ServiceMedia } from '@repo/core/types'

/**
 * What the apps need to know about a service's photos and video, kept pure
 * so each rule is a one-line test. The server holds the real limits
 * (apps/server/src/lib/service-media.ts); these mirror them so nobody waits
 * for an upload the server will refuse.
 */

/** Mirrors R2_MAX_IMAGES_PER_SERVICE on the server, which is the real cap. */
export const MAX_SERVICE_PHOTOS = 3

/** Mirrors MAX_VIDEO_SECONDS on the server; Stream enforces it on the file. */
export const MAX_VIDEO_SECONDS = 60

/** Photos are the same 5 MB JPEG/PNG/WebP as every other upload. */
export const PHOTO_TYPES = 'image/jpeg,image/png,image/webp'
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/** The largest video file the server takes (2 GB). */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

export const VIDEO_TOO_LONG_MESSAGE =
  'Longer than 60 seconds — trim it on the phone and upload again'

/** The privacy tick, as both upload blocks print it after "Before adding:". */
export const CONSENT_TEXT = 'no number plates or faces can be read, or the owner agreed'

/** "0:45", "1:12": a video length as the apps print it. */
export function formatClipLength(totalSecs: number): string {
  const secs = Math.max(0, Math.round(totalSecs))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

/** Whether a clip the phone measured is over the limit (60.4 s is 60 s). */
export function isClipTooLong(durationSecs: number): boolean {
  return durationSecs > MAX_VIDEO_SECONDS + 0.5
}

/**
 * The service card's 64px thumbnail: the video's poster (with its length),
 * else the first photo, else nothing — and the card draws the category icon
 * (serviceIconFor). Customer screens pass customerMedia(), so `sample` is
 * only ever true in the garage's and admin's own views.
 */
export type CardThumbnail =
  | { kind: 'video'; url: string; durationSecs: number | null; sample: false }
  | { kind: 'photo'; url: string; sample: boolean }

export function cardThumbnail(media: readonly ServiceMedia[]): CardThumbnail | null {
  const video = media.find((item) => item.kind === 'video' && item.posterUrl)
  if (video?.posterUrl) {
    return { kind: 'video', url: video.posterUrl, durationSecs: video.durationSecs, sample: false }
  }
  // A garage's own photo before an AI sample, though in practice a service
  // never has both: a real photo removes the samples.
  const photo =
    media.find((item) => item.kind === 'image' && item.source === 'upload') ??
    media.find((item) => item.kind === 'image')
  return photo ? { kind: 'photo', url: photo.url, sample: photo.source === 'ai' } : null
}

/**
 * What kind of work a service is, for its icon (serviceIconFor) and the
 * admin's AI picture prompt.
 */
export type SampleArt = 'wash' | 'bike' | 'detailing' | 'coating' | 'scratch' | 'others'

/**
 * A bike wash is filed under car wash or others (there is no bike category),
 * so the name decides it; otherwise the category does.
 */
export function sampleArtFor(category: ServiceCategory, name: string): SampleArt {
  if (/\b(bike|bikes|two[- ]?wheeler|scooter|motorcycle)\b/i.test(name)) return 'bike'
  switch (category) {
    case 'car_wash':
      return 'wash'
    case 'detailing':
      return 'detailing'
    case 'coating':
      return 'coating'
    case 'scratch_removal':
      return 'scratch'
    default:
      return /\bwash\b/i.test(name) ? 'wash' : 'others'
  }
}

/**
 * The category icon a service without photos shows, on the card and at the
 * top of its sheet (the "no-photo look"): its kind of work, with a bike told
 * apart by its name as sampleArtFor does, and a package as a package.
 */
export type ServiceIcon = SampleArt | 'package'

export function serviceIconFor(category: ServiceCategory, name: string): ServiceIcon {
  const art = sampleArtFor(category, name)
  // A bike package is still a bike's; any other package is a bundle.
  return category === 'package' && art !== 'bike' ? 'package' : art
}

/**
 * The media a customer may see: never an AI picture. The server already
 * leaves them out of customer responses; this keeps an older server, or a
 * cached response, from ever drawing one.
 */
export function customerMedia<T extends Pick<ServiceMedia, 'source'>>(
  media: readonly T[]
): T[] {
  return media.filter((item) => item.source !== 'ai')
}

/**
 * What the admin's AI sheet pre-fills, from the service alone: never
 * anything about a customer or the garage's people. The style ("dark
 * graphite studio, no people, no number plates…") is added by the server.
 */
export function defaultAiSubject(
  name: string,
  category: ServiceCategory,
  categoryLabel: string
): string {
  const vehicle = sampleArtFor(category, name) === 'bike' ? 'motorbike' : 'car'
  const what = (name.trim() || categoryLabel).toLowerCase()
  return `${categoryLabel}: a clean dark-grey ${vehicle} after a ${what}`
}

/**
 * The length of a video file, read from its metadata in the browser without
 * uploading anything. Null when the browser cannot tell (an unusual codec);
 * the server and Stream still enforce the limit then.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      resolve(value)
    }
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null)
    video.onerror = () => done(null)
    video.src = url
  })
}

/**
 * A service (or package) with its media replaced after an upload or a
 * removal, `images` (photos only) kept in step for anything still reading it.
 */
export function withMedia<T extends { media: ServiceMedia[]; images: ServiceImage[] }>(
  item: T,
  media: ServiceMedia[]
): T {
  return {
    ...item,
    media,
    images: media
      .filter((m) => m.kind === 'image')
      .map((m, sortOrder) => ({ id: m.id, url: m.url, sortOrder })),
  }
}
