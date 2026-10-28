import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { MARK_KINDS, MISSING_KEYS } from '../../lib/vendor-missing.js'

/** Column sizes and request limits, as in packages/core/src/onboarding-marks.ts. */
export const MARK_LIMITS = {
  labelMax: 60,
  noteMax: 500,
  askedGaragesMax: 50,
} as const

export const MARK_STATUSES = ['to_ask', 'asked', 'received'] as const
export type MarkStatus = (typeof MARK_STATUSES)[number]

const label = z
  .string()
  .trim()
  .min(1, 'Give the mark a name')
  .max(MARK_LIMITS.labelMax)

/** Null or blank clears it; left out leaves it. */
const note = z
  .string()
  .trim()
  .max(MARK_LIMITS.noteMax)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value))

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

export const markParamSchema = z.object({
  id: z.string().uuid(),
  markId: z.string().uuid(),
})

/** A custom mark needs its own label; a missing key's may have one. */
export const createMarkSchema = z
  .object({
    actorName: signedActorName,
    kind: z.enum(MARK_KINDS),
    label: label.optional(),
    note,
    status: z.enum(MARK_STATUSES).optional(),
  })
  .strict()
  .refine((input) => input.kind !== 'custom' || input.label !== undefined, {
    message: 'A custom mark needs a label',
    path: ['label'],
  })

/** The kind never changes. */
export const updateMarkSchema = z
  .object({
    actorName: signedActorName,
    status: z.enum(MARK_STATUSES).optional(),
    note,
    label: label.optional(),
  })
  .strict()

export const deleteMarkSchema = z
  .object({ actorName: signedActorName })
  .strict()

/**
 * "Mark these as Asked today", after Ask on WhatsApp: per garage, its missing
 * keys' open marks (made where there is none) and the marks named.
 */
export const markAskedSchema = z
  .object({
    actorName: signedActorName,
    garages: z
      .array(
        z
          .object({
            vendorId: z.string().uuid(),
            kinds: z.array(z.enum(MISSING_KEYS)).max(MISSING_KEYS.length * 2),
            markIds: z.array(z.string().uuid()).max(50).optional(),
          })
          .strict()
      )
      .min(1)
      .max(MARK_LIMITS.askedGaragesMax),
  })
  .strict()

export type CreateMarkInput = z.infer<typeof createMarkSchema>
export type UpdateMarkInput = z.infer<typeof updateMarkSchema>
export type MarkAskedInput = z.infer<typeof markAskedSchema>
