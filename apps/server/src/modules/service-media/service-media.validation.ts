import { z } from 'zod'
import { AI_PROMPT_MAX, MAX_VIDEO_BYTES } from '../../lib/service-media.js'

// The privacy tick rides on every upload. Optional here so that a missing
// tick is the service's own 400 MEDIA_CONSENT_REQUIRED, which the apps can
// explain, rather than a generic validation error.
const consent = z.boolean().optional()

export const photoUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const addPhotoSchema = z.object({
  url: z.string().url().max(2048),
  consent,
})

export const startVideoSchema = z.object({
  consent,
  /** The file's size, which decides the basic or the resumable upload. */
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES, {
    message: 'Video files can be up to 2 GB',
  }),
  /**
   * The length the phone read from the file. Checked so a long clip is
   * refused before it is uploaded; Stream enforces the real one.
   */
  durationSecs: z.number().nonnegative().max(24 * 60 * 60).optional(),
  /**
   * The video this one replaces. A ready one stays until the new one is
   * ready; a failed or unfinished one is removed when the new upload starts.
   */
  replaces: z.string().uuid().optional(),
})

export const garageServiceParamSchema = z.object({
  id: z.string().uuid(),
})

export const garageMediaParamSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid(),
})

export const adminServiceParamSchema = z.object({
  serviceId: z.string().uuid(),
})

export const adminMediaParamSchema = z.object({
  serviceId: z.string().uuid(),
  mediaId: z.string().uuid(),
})

export const aiPicturesSchema = z.object({
  prompt: z.string().trim().min(3).max(AI_PROMPT_MAX),
})

export const useAiPictureSchema = z.object({
  url: z.string().url().max(2048),
  /** The options not picked, removed from storage straight away. */
  otherUrls: z.array(z.string().url().max(2048)).max(4).optional(),
})

export type PhotoUploadUrlInput = z.infer<typeof photoUploadUrlSchema>
export type AddPhotoInput = z.infer<typeof addPhotoSchema>
export type StartVideoInput = z.infer<typeof startVideoSchema>
export type AiPicturesInput = z.infer<typeof aiPicturesSchema>
export type UseAiPictureInput = z.infer<typeof useAiPictureSchema>
