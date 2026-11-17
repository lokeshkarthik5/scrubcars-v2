import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { SHINE_AREAS, SHINE_MAX_PHOTO_BYTES } from '../../lib/shine-score.js'

/** Base64 of at most SHINE_MAX_PHOTO_BYTES once decoded (4 characters per 3 bytes). */
const MAX_BASE64 = Math.ceil(SHINE_MAX_PHOTO_BYTES / 3) * 4

/**
 * A scan: exactly one photo per area, re-encoded on the phone (no EXIF or
 * location), as base64. Strict, so nothing else (a car, a name, a place)
 * can ride along: only the pictures are ever sent on.
 */
export const createScanSchema = z
  .object({
    photos: z
      .array(
        z
          .object({
            area: z.enum(SHINE_AREAS),
            mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            dataBase64: z
              .string()
              .min(100, 'That photo is empty')
              .max(MAX_BASE64, 'That photo is too large')
              .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'That photo could not be read'),
          })
          .strict()
      )
      .length(SHINE_AREAS.length, 'Add all four photos')
      .refine((photos) => new Set(photos.map((p) => p.area)).size === SHINE_AREAS.length, 'One photo of each area'),
  })
  .strict()

export const scanIdParamSchema = z.object({ scanId: z.uuid() })
export const bookingIdParamSchema = z.object({ bookingId: z.uuid() })

/** Where to look for garages: the phone's rounded location, or nothing (nearest unknown). */
export const suggestionsQuerySchema = z.object({
  need: z.enum(['inside', 'outside', 'both', 'none']),
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
})

export const listChecksQuerySchema = z.object({
  show: z.enum(['new', 'looks_fine', 'followed_up']).default('new'),
})

export const checkIdParamSchema = z.object({ id: z.uuid() })

/** Looks fine, or Followed up (a call to the garage, or a complaint logged for the customer). */
export const reviewCheckSchema = z
  .object({ actorName: signedActorName, outcome: z.enum(['looks_fine', 'followed_up']) })
  .strict()

export type CreateScanInput = z.infer<typeof createScanSchema>
export type SuggestionsQuery = z.infer<typeof suggestionsQuerySchema>
export type ListChecksQuery = z.infer<typeof listChecksQuerySchema>
export type ReviewCheckInput = z.infer<typeof reviewCheckSchema>
