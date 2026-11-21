import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { PLACE_TEXT_MAX } from '../../lib/places/kinds.js'

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

/**
 * POST /admin/vendors/:id/google/search: Google's places near the garage's
 * pin for these words (the garage's name when left out).
 */
export const garageGoogleSearchSchema = z
  .object({
    text: z.string().trim().min(2).max(PLACE_TEXT_MAX).optional(),
  })
  .strict()

/** POST /admin/vendors/:id/google/link: the place picked. Signed by the session. */
export const garageGoogleLinkSchema = z
  .object({
    placeId: z.string().trim().min(1).max(300),
    actorName: signedActorName,
  })
  .strict()

/** POST /admin/vendors/:id/google/unlink. Signed by the session. */
export const garageGoogleUnlinkSchema = z
  .object({ actorName: signedActorName })
  .strict()

export type GarageGoogleSearchInput = z.infer<typeof garageGoogleSearchSchema>
export type GarageGoogleLinkInput = z.infer<typeof garageGoogleLinkSchema>
export type GarageGoogleUnlinkInput = z.infer<typeof garageGoogleUnlinkSchema>
