import { z } from 'zod'

export const jobPhotoStageSchema = z.enum(['before', 'after'])

export const jobIdParamSchema = z.object({
  id: z.uuid(),
})

export const jobPhotoParamSchema = z.object({
  id: z.uuid(),
  photoId: z.uuid(),
})

// Images only, the same three types as every other upload. The portal turns
// a phone photo into a JPEG no wider than 1600px before asking, so the
// 5 MB limit the photo screens use is never the reason one is refused.
export const jobPhotoUploadUrlSchema = z.object({
  stage: jobPhotoStageSchema,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

// Recorded by the key the upload URL was minted for, not by a URL: the
// service checks the key sits under this job's folder and builds the public
// URL itself, so nothing the client sends ends up as a link on its own.
export const recordJobPhotoSchema = z.object({
  stage: jobPhotoStageSchema,
  key: z.string().min(1).max(1024),
})

export type JobPhotoUploadUrlInput = z.infer<typeof jobPhotoUploadUrlSchema>
export type RecordJobPhotoInput = z.infer<typeof recordJobPhotoSchema>
