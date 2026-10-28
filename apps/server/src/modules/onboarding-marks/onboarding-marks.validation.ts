import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { CHECKLIST_LIMITS } from '../../lib/mark-checklist.js'
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

/**
 * One checklist item as the edit dialog sends it (0061): its id when it was
 * already there (a stored one, or "note-1" read from an old note), its words,
 * and optionally its tick and answer. Who answered is the server's to stamp.
 */
const checklistItemSchema = z
  .object({
    id: z.string().trim().min(1).max(64).optional(),
    text: z
      .string()
      .trim()
      .min(1, 'An item needs words')
      .max(CHECKLIST_LIMITS.textMax),
    done: z.boolean().optional(),
    answer: z
      .string()
      .trim()
      .max(CHECKLIST_LIMITS.answerMax)
      .nullable()
      .optional(),
  })
  .strict()

const checklistSchema = z.array(checklistItemSchema).max(CHECKLIST_LIMITS.items)

export const vendorIdParamSchema = z.object({ id: z.string().uuid() })

export const markItemParamSchema = z.object({
  id: z.string().uuid(),
  markId: z.string().uuid(),
  itemId: z.string().trim().min(1).max(64),
})

/**
 * One item ticked, unticked or answered, from the checklist or the call
 * sheet: the mark's status follows (lib/mark-checklist.ts).
 */
export const updateMarkItemSchema = z
  .object({
    actorName: signedActorName,
    done: z.boolean().optional(),
    answer: z
      .string()
      .trim()
      .max(CHECKLIST_LIMITS.answerMax)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((input) => input.done !== undefined || input.answer !== undefined, {
    message: 'Say what changed',
  })

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
    items: checklistSchema.optional(),
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
    // The whole checklist as the dialog left it; left out leaves it.
    items: checklistSchema.optional(),
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
export type UpdateMarkItemInput = z.infer<typeof updateMarkItemSchema>
