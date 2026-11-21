import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { plainServiceCategorySchema } from '../vendors/vendors.validation.js'

export const serviceIdParamSchema = z.object({ serviceId: z.string().uuid() })

/**
 * Settings → Services in Others: Move (and its Undo). `from` is the category
 * the page showed: when someone changed the service since, the move is
 * refused rather than undoing their change.
 */
export const moveServiceCategorySchema = z
  .object({
    actorName: signedActorName,
    from: plainServiceCategorySchema,
    category: plainServiceCategorySchema,
  })
  .strict()

/** "Not this" (true) on a service's hint, or showing it again (false). */
export const setCategoryHintSchema = z
  .object({
    actorName: signedActorName,
    dismissed: z.boolean(),
  })
  .strict()

export type MoveServiceCategoryInput = z.infer<typeof moveServiceCategorySchema>
export type SetCategoryHintInput = z.infer<typeof setCategoryHintSchema>
