import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { BYPASS_KINDS, BYPASS_RULES } from '../../lib/bypass-reports.js'

/**
 * A customer's report. The booking must be their own (the service checks);
 * the garage is never sent, it is the booking's. Strict, so nothing else (a
 * status, a garage, someone else's user id, a reward) can ride along. An
 * empty note is no note.
 */
export const createBypassReportSchema = z
  .object({
    bookingId: z.uuid(),
    kind: z.enum(BYPASS_KINDS),
    note: z
      .string()
      .trim()
      .max(BYPASS_RULES.noteMax, `Up to ${BYPASS_RULES.noteMax} characters`)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict()

export const bookingIdParamSchema = z.object({ bookingId: z.uuid() })

/** The name the person typed, as the Bin, Payouts and Certify ask for it. */
const actorName = signedActorName

/** Admin's list: New (to look into), Confirmed, Dismissed. */
export const listBypassReportsQuerySchema = z.object({
  show: z.enum(['new', 'confirmed', 'dismissed']).default('new'),
})

export const reportIdParamSchema = z.object({ id: z.uuid() })
export const vendorIdParamSchema = z.object({ vendorId: z.uuid() })

/** Confirming grants the reward (when due) and adds a strike: a typed name, as every money action asks. */
export const confirmBypassReportSchema = z.object({ actorName }).strict()

/** Dismissing says why, for the team (never the customer or the garage). */
export const dismissBypassReportSchema = z
  .object({
    actorName,
    reason: z
      .string()
      .trim()
      .min(3, 'Say why')
      .max(BYPASS_RULES.dismissReasonMax, `Up to ${BYPASS_RULES.dismissReasonMax} characters`),
  })
  .strict()

export type CreateBypassReportInput = z.infer<typeof createBypassReportSchema>
export type ListBypassReportsQuery = z.infer<typeof listBypassReportsQuerySchema>
export type ConfirmBypassReportInput = z.infer<typeof confirmBypassReportSchema>
export type DismissBypassReportInput = z.infer<typeof dismissBypassReportSchema>
