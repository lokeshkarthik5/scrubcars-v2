import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { GUARANTEE_ISSUES, GUARANTEE_RULES } from '../../lib/guarantee.js'

const uuid = z.string().uuid()

export const bookingIdParamSchema = z.object({ bookingId: uuid })
export const claimIdParamSchema = z.object({ id: uuid })

/** A presigned upload for one photo of the problem. */
export const claimPhotoUploadSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  })
  .strict()

/**
 * A claim: the booking, what is wrong (from the list; "Something else" needs
 * words), and the keys of the photos the customer just uploaded. The user is
 * always the session's.
 */
export const createClaimSchema = z
  .object({
    bookingId: uuid,
    issues: z
      .array(z.enum(GUARANTEE_ISSUES))
      .min(1, 'Pick what is wrong')
      .max(GUARANTEE_ISSUES.length)
      .transform((issues) => [...new Set(issues)]),
    otherText: z.string().trim().max(GUARANTEE_RULES.otherTextMax).optional(),
    photoKeys: z.array(z.string().min(1).max(300)).min(GUARANTEE_RULES.minPhotos).max(GUARANTEE_RULES.maxPhotos),
  })
  .strict()

/** One IST day of free times for the redo. */
export const redoSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
})

/** The time the customer picked for the redo. */
export const bookRedoSchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }),
  })
  .strict()

/** The garage disputes the claim, saying why. */
export const disputeClaimSchema = z
  .object({
    note: z.string().trim().min(5, 'Say why, in a few words').max(GUARANTEE_RULES.garageNoteMax),
  })
  .strict()

/** The garage's list: what is still to answer or under way, or what is closed. */
export const garageClaimsQuerySchema = z.object({
  scope: z.enum(['open', 'closed']).default('open'),
})

export const adminClaimsQuerySchema = z.object({
  tab: z.enum(['needs_decision', 'open', 'closed']).default('needs_decision'),
})

const actorName = signedActorName

/**
 * Detlio's decision, with the name typed. A claim not approved always says
 * why (the customer reads it); `note` is the team's and never leaves admin.
 */
export const decideClaimSchema = z
  .object({
    decision: z.enum(['redo', 'refund', 'reject']),
    actorName,
    reason: z.string().trim().max(GUARANTEE_RULES.reasonMax).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((input) => input.decision !== 'reject' || (input.reason ?? '').length >= 5, {
    message: 'Say why it is not approved; the customer reads this',
    path: ['reason'],
  })

export type CreateClaimInput = z.infer<typeof createClaimSchema>
export type ClaimPhotoUploadInput = z.infer<typeof claimPhotoUploadSchema>
export type BookRedoInput = z.infer<typeof bookRedoSchema>
export type DisputeClaimInput = z.infer<typeof disputeClaimSchema>
export type GarageClaimsQuery = z.infer<typeof garageClaimsQuerySchema>
export type AdminClaimsQuery = z.infer<typeof adminClaimsQuerySchema>
export type DecideClaimInput = z.infer<typeof decideClaimSchema>
