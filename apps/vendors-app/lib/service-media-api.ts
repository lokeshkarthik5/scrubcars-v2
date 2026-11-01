import { apiClient } from '@repo/core/api/client';
import type { MediaConfig, VideoStart } from '@repo/core/api/service-media';
import type { ServiceMedia } from '@repo/core/types';
import { File, FileMode, Paths, UploadType } from 'expo-file-system';

import { uniqueCacheName } from './cache-names';
import { TUS_FAILED_MESSAGE, TusHttpError, type TusIO, tusUpload } from './tus-upload';

/**
 * The garage's side of packages/core/src/api/service-media.ts (garageMediaApi and
 * uploadVideoFile), whose module imports image-upload and so can't come to the phone.
 * The same requests; the photo's bytes are what photo-prepare.ts made (a re-encoded
 * JPEG, so the location is gone) in place of a browser File, and the video goes to
 * Stream from its file on the phone.
 *
 * Photo: presign, PUT to R2, register the URL with the privacy tick. Video: ask the API
 * for a one-time Stream link, send the file there (one multipart POST up to 200 MB, a
 * resumable tus upload above), then poll the row until the webhook has marked it ready
 * or failed. A package is a services row, so it shares these routes.
 */

export const getMediaConfig = () => apiClient<MediaConfig>('/vendors/me/media-config');

/** `bytes` is the JPEG photo-prepare.ts returned. Answers the service's whole media list. */
export async function uploadServicePhoto(serviceId: string, bytes: Uint8Array): Promise<ServiceMedia[]> {
  const { uploadUrl, publicUrl } = await apiClient<{ uploadUrl: string; publicUrl: string }>(
    `/vendors/me/services/${serviceId}/images/upload-url`,
    { method: 'POST', body: JSON.stringify({ contentType: 'image/jpeg' }) }
  );
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!put.ok) throw new Error('Upload failed. Please try again.');
  // The answer is the whole service (or package); the block needs its media.
  const service = await apiClient<{ media?: ServiceMedia[] }>(`/vendors/me/services/${serviceId}/images`, {
    method: 'POST',
    body: JSON.stringify({ url: publicUrl, consent: true }),
  });
  return service.media ?? [];
}

export const startServiceVideo = (
  serviceId: string,
  input: { sizeBytes: number; durationSecs?: number; replaces?: string }
) =>
  apiClient<VideoStart>(`/vendors/me/services/${serviceId}/videos`, {
    method: 'POST',
    body: JSON.stringify({ ...input, consent: true }),
  });

export const getServiceMedia = (serviceId: string, mediaId: string) =>
  apiClient<ServiceMedia>(`/vendors/me/services/${serviceId}/media/${mediaId}`);

export async function removeServiceMedia(serviceId: string, mediaId: string): Promise<ServiceMedia[]> {
  const service = await apiClient<{ media?: ServiceMedia[] }>(
    `/vendors/me/services/${serviceId}/images/${mediaId}`,
    { method: 'DELETE' }
  );
  return service.media ?? [];
}

/** The largest video the basic (single POST) upload takes: BASIC_UPLOAD_MAX_BYTES on the server. */
export const BASIC_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

const TUS_HEADERS = { 'Tus-Resumable': '1.0.0' };

function offsetOf(value: string | null | undefined): number {
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset < 0) throw new Error('tus: no offset in the reply');
  return offset;
}

/** Header names arrive in whatever case the server used. */
const header = (headers: Record<string, string>, name: string) =>
  headers[name] ?? headers[name.toLowerCase()] ?? Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

/**
 * The tus calls on the phone: HEAD with fetch, each chunk read from the video with a
 * FileHandle into a small file in the cache and sent by the system's own upload task
 * (so nothing is base64'd through the bridge and the progress is real).
 */
function phoneTusIO(video: File): { io: TusIO; release: () => void } {
  const handle = video.open(FileMode.ReadOnly);
  const chunk = new File(Paths.cache, uniqueCacheName('service-video-chunk', 'bin'));
  const io: TusIO = {
    async head(url) {
      const res = await fetch(url, { method: 'HEAD', headers: TUS_HEADERS });
      if (!res.ok) throw new TusHttpError(res.status);
      return offsetOf(res.headers.get('Upload-Offset'));
    },
    read: async (offset, length) => {
      handle.offset = offset;
      return handle.readBytes(length);
    },
    async patch(url, offset, bytes, onSent) {
      // Made afresh each time: a shorter last chunk must not keep the tail of the one before.
      chunk.create({ overwrite: true });
      await chunk.write(bytes);
      const res = await chunk.upload(url, {
        httpMethod: 'PATCH',
        uploadType: UploadType.BINARY_CONTENT,
        sessionType: 'foreground',
        headers: {
          ...TUS_HEADERS,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        onProgress: ({ bytesSent }) => onSent(bytesSent),
      });
      if (res.status !== 204 && res.status !== 200) throw new TusHttpError(res.status);
      return offsetOf(header(res.headers, 'Upload-Offset'));
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const release = () => {
    try {
      handle.close();
      if (chunk.exists) chunk.delete();
    } catch {
      // Cache files are the system's to clear.
    }
  };
  return { io, release };
}

/**
 * Send a picked video to Stream through the link startServiceVideo returned. Progress
 * is a fraction from 0 to 1. `uri` is the picker's local file.
 */
export async function uploadVideoFile(
  start: Pick<VideoStart, 'mode' | 'uploadUrl'>,
  video: { uri: string; mimeType?: string | null; size: number },
  onProgress: (fraction: number) => void
): Promise<void> {
  const file = new File(video.uri);

  if (start.mode === 'tus') {
    const { io, release } = phoneTusIO(file);
    try {
      await tusUpload({ url: start.uploadUrl, size: video.size, io, onProgress });
    } finally {
      release();
    }
    return;
  }

  // A plain multipart POST (field `file`), streamed from disk by the system.
  let res;
  try {
    res = await file.upload(start.uploadUrl, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: video.mimeType || 'video/mp4',
      sessionType: 'foreground',
      onProgress: ({ bytesSent, totalBytes }) => onProgress(totalBytes > 0 ? bytesSent / totalBytes : 0),
    });
  } catch {
    throw new Error(TUS_FAILED_MESSAGE);
  }
  if (res.status < 200 || res.status >= 300) throw new Error(TUS_FAILED_MESSAGE);
}
