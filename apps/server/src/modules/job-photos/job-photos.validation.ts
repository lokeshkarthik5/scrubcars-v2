import { z } from 'zod'
import { PHOTO_ANGLES } from '../../lib/job-photo-standards.js'

export const jobPhotoStageSchema = z.enum(['before', 'after'])

/** The guided angle a photo was taken from (0045). Optional: extras have none. */
export const jobPhotoAngleSchema = z.enum(PHOTO_ANGLES)

export const jobIdParamSchema = z.object({
  id: z.uuid(),
})

export const jobPhotoParamSchema = z.object({
  id: z.uuid(),
  photoId: z.uuid(),
})

// Images only, the same three types as every other upload. The portal turns
// a phone photo into a JPEG no wider than 1600px before asking, and the
// customer app re-encodes it (stripImageMetadata), so the 5 MB limit the
// photo screens use is never the reason one is refused.
export const jobPhotoUploadUrlSchema = z
  .object({
    stage: jobPhotoStageSchema,
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  })
  .strict()

// Recorded by the key the upload URL was minted for, not by a URL: the
// service checks the key sits under this job's folder (the customer's own
// folder for a customer) and builds the public URL itself, so nothing the
// client sends ends up as a link on its own.
export const recordJobPhotoSchema = z
  .object({
    stage: jobPhotoStageSchema,
    key: z.string().min(1).max(1024),
    angle: jobPhotoAngleSchema.optional(),
  })
  .strict()

export type JobPhotoUploadUrlInput = z.infer<typeof jobPhotoUploadUrlSchema>
export type RecordJobPhotoInput = z.infer<typeof recordJobPhotoSchema>
