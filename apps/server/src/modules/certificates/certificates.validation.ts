import { z } from 'zod'
import { SHARE_EXPIRY_DAYS } from '../../lib/service-history-certificate.js'

/** /users/me/vehicles/:vehicleId/certificate… The user is always the session's. */
export const vehicleParamSchema = z.object({
  vehicleId: z.string().uuid(),
})

/**
 * POST …/certificate/share: a new link. Photos are off and the link never
 * runs out unless the customer says otherwise.
 */
export const shareSchema = z
  .object({
    includePhotos: z.boolean().default(false),
    expiresInDays: z
      .union([z.literal(SHARE_EXPIRY_DAYS[0]), z.literal(SHARE_EXPIRY_DAYS[1]), z.literal(SHARE_EXPIRY_DAYS[2])])
      .nullable()
      .default(null),
  })
  .strict()

/** PATCH …/certificate/share: photos on or off for the link already shared. */
export const updateShareSchema = z
  .object({
    includePhotos: z.boolean(),
  })
  .strict()

/**
 * POST /certificates/verify: the public page. The token travels in the body,
 * never an API URL (request logs record paths). Any string is accepted here
 * so a malformed token gets the same 404 as an unknown one.
 */
export const verifySchema = z
  .object({
    token: z.string().max(200),
  })
  .strict()

/** GET /certificates/photos/:photoId?e=&s= */
export const photoParamSchema = z.object({
  photoId: z.string().uuid(),
})

export const photoQuerySchema = z.object({
  e: z.coerce.number().int().positive(),
  s: z.string().min(1).max(64),
})

export type ShareInput = z.infer<typeof shareSchema>
export type UpdateShareInput = z.infer<typeof updateShareSchema>
