import { apiClient } from '@repo/core/api/client'
import { stripImageMetadata } from '@repo/core/image-upload'
import type { ServiceMedia } from '@repo/core/types'

/**
 * A service's photos and video, from the garage's app and from admin.
 *
 * Photos: strip location metadata (image-upload.ts) → presign → PUT straight
 * to R2 → register the URL with the privacy tick. Video: ask the API for a
 * one-time Cloudflare Stream link → upload the file straight to Stream (a
 * POST up to 200 MB, a resumable tus upload above) → poll the row until
 * Stream's webhook has marked it ready or failed. Videos are sent as they are.
 *
 * The garage's app and admin reach the same rules through different routes
 * (and admin answers with the media list, the garage with the whole service),
 * so the upload block takes a MediaApi and never knows which it has.
 */

export interface MediaConfig {
  /** False until Stream is set up on the server: the video slot is hidden. */
  video: boolean
  maxPhotos: number
  maxVideoSecs: number
}

export interface VideoStart {
  mode: 'basic' | 'tus'
  uploadUrl: string
  media: ServiceMedia
}

export interface MediaApi {
  config(): Promise<MediaConfig>
  /** Upload and register one photo, with the privacy tick. */
  uploadPhoto(serviceId: string, file: File): Promise<ServiceMedia[]>
  /** Start a video: the row (processing) and where to send the file. */
  startVideo(
    serviceId: string,
    input: { sizeBytes: number; durationSecs?: number; replaces?: string }
  ): Promise<VideoStart>
  /** One row, as the status poll reads it. */
  getMedia(serviceId: string, mediaId: string): Promise<ServiceMedia>
  /** Remove a photo or the video. */
  remove(serviceId: string, mediaId: string): Promise<ServiceMedia[]>
}

type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp'

async function putToR2(uploadUrl: string, file: Blob) {
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!put.ok) throw new Error('Upload failed. Please try again.')
}

/** The garage's own app: routes under /vendors/me, scoped by resolveTenant. */
export const garageMediaApi: MediaApi = {
  config: () => apiClient<MediaConfig>('/vendors/me/media-config'),

  async uploadPhoto(serviceId, file) {
    const clean = await stripImageMetadata(file)
    const { uploadUrl, publicUrl } = await apiClient<{ uploadUrl: string; publicUrl: string }>(
      `/vendors/me/services/${serviceId}/images/upload-url`,
      { method: 'POST', body: JSON.stringify({ contentType: clean.type as PhotoType }) }
    )
    await putToR2(uploadUrl, clean)
    // The answer is the whole service (or package); the block needs its media.
    const service = await apiClient<{ media?: ServiceMedia[] }>(
      `/vendors/me/services/${serviceId}/images`,
      { method: 'POST', body: JSON.stringify({ url: publicUrl, consent: true }) }
    )
    return service.media ?? []
  },

  startVideo: (serviceId, input) =>
    apiClient<VideoStart>(`/vendors/me/services/${serviceId}/videos`, {
      method: 'POST',
      body: JSON.stringify({ ...input, consent: true }),
    }),

  getMedia: (serviceId, mediaId) =>
    apiClient<ServiceMedia>(`/vendors/me/services/${serviceId}/media/${mediaId}`),

  async remove(serviceId, mediaId) {
    const service = await apiClient<{ media?: ServiceMedia[] }>(
      `/vendors/me/services/${serviceId}/images/${mediaId}`,
      { method: 'DELETE' }
    )
    return service.media ?? []
  },
}

/** Admin: routes under /admin, keyed by service alone. */
export const adminMediaApi: MediaApi = {
  config: () => apiClient<MediaConfig>('/admin/media-config'),

  async uploadPhoto(serviceId, file) {
    const clean = await stripImageMetadata(file)
    const { uploadUrl, publicUrl } = await apiClient<{ uploadUrl: string; publicUrl: string }>(
      `/admin/services/${serviceId}/images/upload-url`,
      { method: 'POST', body: JSON.stringify({ contentType: clean.type as PhotoType }) }
    )
    await putToR2(uploadUrl, clean)
    return apiClient<ServiceMedia[]>(`/admin/services/${serviceId}/images`, {
      method: 'POST',
      body: JSON.stringify({ url: publicUrl, consent: true }),
    })
  },

  startVideo: (serviceId, input) =>
    apiClient<VideoStart>(`/admin/services/${serviceId}/videos`, {
      method: 'POST',
      body: JSON.stringify({ ...input, consent: true }),
    }),

  getMedia: (serviceId, mediaId) =>
    apiClient<ServiceMedia>(`/admin/services/${serviceId}/media/${mediaId}`),

  remove: (serviceId, mediaId) =>
    apiClient<ServiceMedia[]>(`/admin/services/${serviceId}/images/${mediaId}`, {
      method: 'DELETE',
    }),
}

/** Stream asks for resumable uploads in chunks of 5 MiB+, multiples of 256 KiB. */
const TUS_CHUNK_BYTES = 50 * 1024 * 1024

/**
 * Send the file to Stream through the link startVideo returned. Progress is
 * a fraction from 0 to 1. The tus client is loaded only for a file big enough
 * to need it, so nobody downloads it to upload a photo.
 */
export async function uploadVideoFile(
  start: Pick<VideoStart, 'mode' | 'uploadUrl'>,
  file: File,
  onProgress: (fraction: number) => void
): Promise<void> {
  if (start.mode === 'tus') {
    const { Upload } = await import('tus-js-client')
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        uploadUrl: start.uploadUrl,
        chunkSize: TUS_CHUNK_BYTES,
        retryDelays: [0, 3000, 10000, 20000],
        storeFingerprintForResuming: false,
        onProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0),
        onSuccess: () => resolve(),
        onError: () => reject(new Error('The video did not finish uploading. Try again.')),
      })
      upload.start()
    })
    return
  }

  // A plain multipart POST, through XMLHttpRequest for its upload progress.
  await new Promise<void>((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', start.uploadUrl)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('The video did not finish uploading. Try again.'))
    xhr.onerror = () => reject(new Error('The video did not finish uploading. Try again.'))
    xhr.send(form)
  })
}

// ─── AI sample pictures (admin) ──────────────────────────────────────────────

/**
 * GET /admin/ai/config, shared with "Write with AI" (`getAdminAiConfig` in
 * ./admin). `pictures` is false until OpenAI is set up.
 */
export const getAiConfig = () => apiClient<{ describe: boolean; pictures: boolean }>('/admin/ai/config')

/** Two options for one description; the server adds the style. */
export const generateAiPictures = (serviceId: string, prompt: string) =>
  apiClient<{ pictures: Array<{ url: string }> }>(`/admin/services/${serviceId}/ai-pictures`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })

/** Make the chosen option the service's sample picture; the rest are removed. */
export const chooseAiPicture = (serviceId: string, url: string, otherUrls: string[]) =>
  apiClient<ServiceMedia[]>(`/admin/services/${serviceId}/ai-pictures/use`, {
    method: 'POST',
    body: JSON.stringify({ url, otherUrls }),
  })
