import { isClipTooLong, MAX_VIDEO_BYTES, VIDEO_TOO_LONG_MESSAGE } from '@repo/core/service-media';
import type { ServiceMedia } from '@repo/core/types';

import { MAX_SOURCE_BYTES } from './photo-limits';
import { msg, t } from '@repo/core/i18n/translate';

/**
 * packages/ui/src/features/service-media-editor.tsx, minus the drawing: which photo or
 * video may be added (and what is said when not), which row is "the video" on screen,
 * and what the list becomes after an upload settles. Pure, so each rule is a test. The
 * messages are English constants (msg); the checks hand them back in the language in use.
 */

/** How often a processing video is checked while the block is open. */
export const POLL_MS = 4000;

/** The shortest the photo grid is ever drawn. */
export const DEFAULT_MAX_PHOTOS = 3;

export const NOT_A_PHOTO = msg('Use a JPEG, PNG or WebP photo.');
export const PHOTO_TOO_BIG = msg('That photo is over 5 MB. Pick a smaller one.');
export const NOT_A_VIDEO = msg('That file is not a video.');
export const VIDEO_TOO_BIG = msg('That file is over 2 GB.');

/**
 * What the library may give for a photo. The web accepts JPEG, PNG and WebP; a phone's
 * own HEIC is added because it is converted to JPEG before it leaves the phone (the web
 * gets the same from Safari, which converts it as the file is chosen).
 */
const PHOTO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export interface PickedPhoto {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

const extensionOf = (uri: string) => {
  const clean = uri.split(/[?#]/)[0] ?? '';
  const dot = clean.lastIndexOf('.');
  return dot === -1 || clean.slice(dot).includes('/') ? '' : clean.slice(dot + 1).toLowerCase();
};

/** The message for a photo that may not be added, or null when it may. */
export function checkPhotoPick(photo: PickedPhoto): string | null {
  const mime = photo.mimeType?.toLowerCase();
  if (mime) {
    if (!PHOTO_MIME.has(mime)) return t(NOT_A_PHOTO);
  } else {
    const ext = extensionOf(photo.uri);
    // No type and no extension: the phone could not say; preparing it will.
    if (ext && !PHOTO_EXT.has(ext)) return t(NOT_A_PHOTO);
  }
  if (typeof photo.fileSize === 'number' && photo.fileSize > MAX_SOURCE_BYTES) return t(PHOTO_TOO_BIG);
  return null;
}

export interface PickedVideo {
  type?: string | null;
  mimeType?: string | null;
  /** The picker's own figure, in bytes (undefined when the phone does not say). */
  fileSize?: number | null;
  /** The picker's figure, in milliseconds. */
  duration?: number | null;
}

export type VideoCheck =
  | { ok: true; sizeBytes: number; durationSecs: number | null }
  | { ok: false; message: string; durationSecs: number | null };

/**
 * The checks the web runs before anything is uploaded: a video, at most 2 GB, at most
 * 60 seconds (60.4 counts as 60). `sizeBytes` is the file's real size, read by the
 * caller when the picker does not give it.
 */
export function checkVideoPick(video: PickedVideo, sizeBytes: number | null): VideoCheck {
  const durationSecs =
    typeof video.duration === 'number' && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration / 1000
      : null;
  const isVideo = video.type ? video.type === 'video' : Boolean(video.mimeType?.startsWith('video/'));
  if (!isVideo) return { ok: false, message: t(NOT_A_VIDEO), durationSecs: null };
  const size = typeof video.fileSize === 'number' && video.fileSize > 0 ? video.fileSize : sizeBytes;
  if (size === null || size <= 0) return { ok: false, message: t(NOT_A_VIDEO), durationSecs: null };
  if (size > MAX_VIDEO_BYTES) return { ok: false, message: t(VIDEO_TOO_BIG), durationSecs: null };
  if (durationSecs !== null && isClipTooLong(durationSecs)) {
    return { ok: false, message: t(VIDEO_TOO_LONG_MESSAGE), durationSecs };
  }
  return { ok: true, sizeBytes: size, durationSecs };
}

/** A video's moment-to-moment state on this screen, beyond what the row says. */
export type VideoWork =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'uploading'; fraction: number }
  /** Refused before uploading (too long, too big, not a video). */
  | { step: 'refused'; message: string; durationSecs: number | null };

export interface MediaSlots {
  photos: ServiceMedia[];
  /** The ready video customers see. */
  liveVideo: ServiceMedia | undefined;
  /** A video still on its way (or failed), awaiting its turn in the slot. */
  pendingVideo: ServiceMedia | undefined;
  /**
   * While a replacement uploads and processes, the earlier video stays ready on the
   * garage page; the slot shows the replacement's progress.
   */
  currentVideo: ServiceMedia | null;
}

export function mediaSlots(media: readonly ServiceMedia[]): MediaSlots {
  const liveVideo = media.find((item) => item.kind === 'video' && item.videoStatus === 'ready');
  const pendingVideo = media.find((item) => item.kind === 'video' && item.videoStatus !== 'ready');
  return {
    photos: media.filter((item) => item.kind === 'image'),
    liveVideo,
    pendingVideo,
    currentVideo: pendingVideo ?? liveVideo ?? null,
  };
}

/** The row the poll watches: a processing video, unless this phone is still uploading it. */
export function processingIdOf(currentVideo: ServiceMedia | null, uploading: boolean): string | null {
  return currentVideo?.videoStatus === 'processing' && !uploading ? currentVideo.id : null;
}

/**
 * The list after a polled video settles, as the server left it: a video that is now
 * ready has taken the place of the earlier one it replaced and of any AI samples
 * (removedWhenVideoReady on the server); a failed one changes nothing else.
 */
export function settledList(media: readonly ServiceMedia[], fresh: ServiceMedia): ServiceMedia[] {
  const next = media.map((item) => (item.id === fresh.id ? fresh : item));
  if (fresh.videoStatus !== 'ready') return next;
  return next.filter((item) => item.id === fresh.id || (item.kind !== 'video' && item.source !== 'ai'));
}

/**
 * The video a new upload replaces: a failed or unfinished one is replaced itself;
 * otherwise the ready video, which the server keeps until the new one is ready.
 */
export function replacingVideo(media: readonly ServiceMedia[]): ServiceMedia | undefined {
  return (
    media.find((item) => item.kind === 'video' && item.videoStatus !== 'ready') ??
    media.find((item) => item.kind === 'video')
  );
}

/** The list once the server has started a video: only a replaced video that was not ready went. */
export function startedList(
  media: readonly ServiceMedia[],
  row: ServiceMedia,
  replacing: ServiceMedia | undefined
): ServiceMedia[] {
  const goneId = replacing && replacing.videoStatus !== 'ready' ? replacing.id : null;
  return [row, ...media.filter((item) => item.id !== goneId)];
}

export const emptyPhotoSlots = (maxPhotos: number, photoCount: number) => Math.max(0, maxPhotos - photoCount);

/** "0%" to "100%" for the ring and the status line. */
export const percent = (fraction: number) => Math.round(Math.min(1, Math.max(0, fraction)) * 100);
