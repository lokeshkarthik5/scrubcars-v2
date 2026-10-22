import { z } from 'zod'
import { MAX_PROPOSAL_SLOTS, PROPOSAL_NOTE_MAX_CHARS } from '../../lib/time-proposals.js'

export const proposalBookingParamSchema = z.object({
  id: z.uuid(),
})

/** One IST day of the garage's free times for this job. */
export const proposalSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
})

/**
 * The times the garage offers, as the slot list gave them, and an optional
 * line for the customer. Strict, so nothing else rides along.
 */
export const suggestTimesSchema = z
  .object({
    slots: z
      .array(z.string().datetime({ offset: true }))
      .min(1, 'Pick at least one time')
      .max(MAX_PROPOSAL_SLOTS, `Pick at most ${MAX_PROPOSAL_SLOTS} times`),
    // Optional; an empty box is no note.
    note: z
      .string()
      .trim()
      .max(PROPOSAL_NOTE_MAX_CHARS)
      .optional()
      .transform((note) => (note ? note : undefined)),
  })
  .strict()

/** The customer's pick: one of the offered times. */
export const chooseTimeSchema = z
  .object({
    slot: z.string().datetime({ offset: true }),
  })
  .strict()

export type ProposalSlotsQuery = z.infer<typeof proposalSlotsQuerySchema>
export type SuggestTimesInput = z.infer<typeof suggestTimesSchema>
export type ChooseTimeInput = z.infer<typeof chooseTimeSchema>
