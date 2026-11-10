import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'

export const ownerDeleteIdParamSchema = z.object({ id: z.string().uuid() })

export const zoneSignupParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
})

/**
 * A delete with nothing to type (a review, a notice, a job photo…): the
 * signed-in admin's name only, filled in by adminSignedJson.
 */
export const ownerDeleteSchema = z.object({ actorName: signedActorName }).strict()

/**
 * A delete that touches money or a customer: the name or number the sheet
 * asks for, typed (checked against the row in the service, where it is).
 */
export const ownerTypedDeleteSchema = z
  .object({
    actorName: signedActorName,
    confirmText: z.string().max(200),
  })
  .strict()

/**
 * One printed coupon code, typed in full as Void asks for it: only its hash
 * is stored, so the code itself is what finds it (and confirms the delete).
 */
export const ownerCouponCodeDeleteSchema = z
  .object({
    actorName: signedActorName,
    code: z.string().trim().min(1).max(40),
  })
  .strict()

export type OwnerDeleteInput = z.infer<typeof ownerDeleteSchema>
export type OwnerTypedDeleteInput = z.infer<typeof ownerTypedDeleteSchema>
export type OwnerCouponCodeDeleteInput = z.infer<typeof ownerCouponCodeDeleteSchema>
