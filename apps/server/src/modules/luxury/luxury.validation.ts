import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { LUXURY_BRANDS, LUXURY_RULES } from '../../lib/luxury.js'

export const vendorIdParamSchema = z.object({ vendorId: z.uuid() })

const brandsSchema = z
  .array(z.enum(LUXURY_BRANDS))
  .min(1, 'Pick at least one brand.')
  .max(LUXURY_BRANDS.length)
  .refine((brands) => new Set(brands).size === brands.length, 'Each brand once.')

/** One line of optional text: trimmed, empty is none. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))

/**
 * The garage's application (PUT /vendors/me/luxury): the brands it handles,
 * 3–8 photos it uploaded through POST …/photos/upload-url (the service checks
 * each is its own), a covered or indoor bay yes or no, and optionally the
 * products it uses and who does the work. Strict: nothing else rides along.
 */
export const sendApplicationSchema = z
  .object({
    brands: brandsSchema,
    photos: z
      .array(
        z
          .object({
            url: z.url().max(2048),
            caption: optionalText(LUXURY_RULES.captionMax),
          })
          .strict()
      )
      .min(LUXURY_RULES.minPhotos, `Add at least ${LUXURY_RULES.minPhotos} photos.`)
      .max(LUXURY_RULES.maxPhotos, `At most ${LUXURY_RULES.maxPhotos} photos.`),
    coveredBay: z.boolean(),
    products: optionalText(LUXURY_RULES.productsMax),
    staff: optionalText(LUXURY_RULES.staffMax),
  })
  .strict()

export const luxuryPhotoUploadSchema = z
  .object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) })
  .strict()

/** Approve: no note needed. */
export const approveSchema = z.object({ actorName: signedActorName }).strict()

/** Ask for more, Decline, Remove badge: a short note the garage reads word for word. */
export const noteDecisionSchema = z
  .object({
    note: z.string().trim().min(1, 'Write the garage a short note.').max(LUXURY_RULES.noteMax),
    actorName: signedActorName,
  })
  .strict()

/** Edit brands on an approved garage: what customers see. */
export const editBrandsSchema = z.object({ brands: brandsSchema, actorName: signedActorName }).strict()

export type SendApplicationInput = z.infer<typeof sendApplicationSchema>
export type LuxuryPhotoUploadInput = z.infer<typeof luxuryPhotoUploadSchema>
export type NoteDecisionInput = z.infer<typeof noteDecisionSchema>
export type EditBrandsInput = z.infer<typeof editBrandsSchema>
