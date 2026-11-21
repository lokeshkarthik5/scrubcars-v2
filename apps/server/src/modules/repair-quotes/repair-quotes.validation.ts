import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { ADMIN_QUOTE_FILTERS, REPAIR_QUOTE_RULES, REPAIR_VIDEO_TYPES } from '../../lib/repair-quotes.js'

const R = REPAIR_QUOTE_RULES

export const requestIdParamSchema = z.object({ id: z.string().uuid() })
export const quoteParamsSchema = z.object({ id: z.string().uuid(), quoteId: z.string().uuid() })
export const quoteIdParamSchema = z.object({ quoteId: z.string().uuid() })
export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const VIDEO_TYPES = Object.keys(REPAIR_VIDEO_TYPES) as [keyof typeof REPAIR_VIDEO_TYPES, ...Array<keyof typeof REPAIR_VIDEO_TYPES>]

/**
 * One upload link: a video (at most 60 MB) or a picture (a photo or a frame,
 * re-encoded on the phone, at most 8 MB). The size is signed into the link.
 */
export const uploadUrlSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('video'),
      contentType: z.enum(VIDEO_TYPES),
      sizeBytes: z.number().int().min(1).max(R.videoMaxBytes, 'This video is too large. Keep it under 60 MB.'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('photo'),
      contentType: z.enum(IMAGE_TYPES),
      sizeBytes: z.number().int().min(1).max(R.photoMaxBytes, 'This photo is too large.'),
    })
    .strict(),
])

/** About 6 MB of base64 for every picture together: well under the API's body limit. */
export const MAX_BRIEF_BASE64_CHARS = 6_000_000

/**
 * What the AI reads: the pictures (frames from the video and the customer's
 * photos, already re-encoded on the phone) and the customer's one line.
 * Strict, so nothing else can ride along: no name, place, car or id.
 */
export const briefSchema = z
  .object({
    note: z.string().trim().min(1, 'Say what happened in a line').max(R.noteMax),
    images: z
      .array(
        z
          .object({
            mimeType: z.enum(IMAGE_TYPES),
            dataBase64: z.string().min(16).max(MAX_BRIEF_BASE64_CHARS),
          })
          .strict()
      )
      .min(1)
      .max(R.maxFrames + R.maxPhotos),
  })
  .strict()

const boxSchema = z
  .object({
    image: z.number().int().min(0).max(R.maxFrames + R.maxPhotos - 1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .strict()

export const createRequestSchema = z
  .object({
    vehicleId: z.string().uuid(),
    // Rounded on the phone (coarse, ~110 m) before it is sent.
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    note: z.string().trim().min(1, 'Say what happened in a line').max(R.noteMax),
    brief: z
      .object({
        text: z.string().trim().min(3, 'Write a line for the garages').max(R.briefMax),
        area: z.string().trim().max(80).nullable(),
        damage: z.string().trim().max(60).nullable(),
        box: boxSchema.nullable(),
        // How the brief came to be: the AI's as written, the AI's edited, or the customer's own.
        source: z.enum(['ai', 'ai_edited', 'customer']),
      })
      .strict(),
    video: z
      .object({
        key: z.string().max(300),
        secs: z.number().int().min(1).max(R.videoMaxSecs, `Keep the video to ${R.videoMaxSecs} seconds or less`),
      })
      .strict()
      .nullable(),
    photos: z
      .array(z.object({ key: z.string().max(300), kind: z.enum(['photo', 'frame']) }).strict())
      .max(R.maxFrames + R.maxPhotos),
  })
  .strict()
  .refine((input) => input.video !== null || input.photos.length > 0, {
    message: 'Add a video or a photo of the damage',
    path: ['photos'],
  })
  .refine((input) => input.photos.filter((photo) => photo.kind === 'photo').length <= R.maxPhotos, {
    message: `Up to ${R.maxPhotos} photos`,
    path: ['photos'],
  })
  .refine((input) => input.photos.filter((photo) => photo.kind === 'frame').length <= R.maxFrames, {
    message: `Up to ${R.maxFrames} frames`,
    path: ['photos'],
  })

export const bookVisitSchema = z.object({ scheduledAt: z.string().datetime() }).strict()

export const garageListQuerySchema = z.object({ scope: z.enum(['open', 'closed']).default('open') })

export const answerSchema = z.discriminatedUnion('canDo', [
  z
    .object({
      canDo: z.literal(true),
      priceFrom: z.number().int().min(1, 'Enter a price from').max(R.priceMax),
      priceTo: z.number().int().min(1, 'Enter a price to').max(R.priceMax),
      days: z.number().int().min(1).max(R.daysMax),
      needsInspection: z.boolean(),
      note: z.string().trim().max(R.garageNoteMax).optional(),
    })
    .strict()
    .refine((answer) => answer.priceTo >= answer.priceFrom, {
      message: 'The price to must be the same as or above the price from',
      path: ['priceTo'],
    }),
  z
    .object({
      canDo: z.literal(false),
      reason: z.string().trim().max(R.garageNoteMax).optional(),
    })
    .strict(),
])

export const adminListQuerySchema = z.object({ filter: z.enum(ADMIN_QUOTE_FILTERS).default('open') })

export const adminSettingSchema = z.object({ actorName: signedActorName, enabled: z.boolean() }).strict()

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>
export type BriefInput = z.infer<typeof briefSchema>
export type CreateRequestInput = z.infer<typeof createRequestSchema>
export type AnswerInput = z.infer<typeof answerSchema>
export type AdminListQuery = z.infer<typeof adminListQuerySchema>
