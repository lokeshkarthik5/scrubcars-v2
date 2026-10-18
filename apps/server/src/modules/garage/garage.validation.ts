import { z } from 'zod'
import { CAR_LIMITS, GARAGE_RARITIES, GARAGE_TONES, MAX_ART_BYTES, SERIES_STATUSES } from '../../lib/garage.js'

const actorName = z.string().trim().min(2, 'Type your name').max(100)

export const idParamSchema = z.object({ id: z.uuid() })
export const userIdParamSchema = z.object({ userId: z.uuid() })
export const overviewQuerySchema = z.object({ seriesId: z.uuid().optional() })
export const statsQuerySchema = z.object({
  seriesId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
})
export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() })

/** The customer's own pulls marked seen (never anyone else's: the session's id decides). */
export const seenSchema = z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict()

export const seriesSchema = z
  .object({
    name: z.string().trim().min(CAR_LIMITS.seriesName.min).max(CAR_LIMITS.seriesName.max),
    status: z.enum(SERIES_STATUSES),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    actorName,
  })
  .strict()

/** A car as the team edits it. The rules (lengths, copy rules, no real car names) are lib/garage.ts `carProblems`. */
export const carSchema = z
  .object({
    name: z.string().max(60),
    rarity: z.enum(GARAGE_RARITIES),
    tone: z.enum(GARAGE_TONES),
    paint: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'The paint is a colour like #0F7A78'),
    colour: z.string().max(60),
    stats: z.tuple([z.string().max(60), z.string().max(60), z.string().max(60)]),
    lore: z.string().max(200),
    enabled: z.boolean(),
    actorName,
  })
  .strict()

export const actorSchema = z.object({ actorName }).strict()

export const chooseArtSchema = z
  .object({ key: z.string().min(1).max(200), otherKeys: z.array(z.string().max(200)).max(3).optional(), actorName })
  .strict()

/** Uploads are WebP only: the admin panel re-encodes the picture in the browser first. */
export const uploadUrlSchema = z
  .object({ contentType: z.literal('image/webp'), sizeBytes: z.number().int().min(1).max(MAX_ART_BYTES) })
  .strict()

export const useUploadSchema = z.object({ key: z.string().min(1).max(200), actorName }).strict()

export const givePullSchema = z.object({ actorName, reason: z.string().trim().min(3, 'Say why').max(300) }).strict()

export type SeriesInput = z.infer<typeof seriesSchema>
export type CarInput = z.infer<typeof carSchema>
