import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { isCalendarDate } from '../../lib/booking-ops.js'
import { MISSING_KEYS } from '../../lib/vendor-missing.js'
import {
  COLLECTION_ITEM_STATUSES,
  COLLECTION_LIMITS,
} from './collection-lists.rules.js'

/** Null or blank clears it; left out leaves it. */
const note = z
  .string()
  .trim()
  .max(COLLECTION_LIMITS.noteMax)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value))

const dueOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine(isCalendarDate, 'That date does not exist')

export const listIdParamSchema = z.object({ id: z.string().uuid() })
export const itemIdParamSchema = z.object({ id: z.string().uuid() })

/**
 * Send to team: one list per collector. Garages are checked against the 50
 * a list holds after a garage named twice is merged (the service), so the
 * array itself may name a few more.
 */
export const createCollectionListsSchema = z
  .object({
    actorName: signedActorName,
    lists: z
      .array(
        z
          .object({
            assigneeLoginId: z.string().uuid().nullable().optional(),
            assigneeName: z.string().trim().min(1, 'Say who collects').max(100),
            dueOn: dueOn.nullable().optional(),
            note,
            garages: z
              .array(
                z
                  .object({
                    vendorId: z.string().uuid(),
                    kinds: z
                      .array(z.enum(MISSING_KEYS))
                      .max(MISSING_KEYS.length * 2),
                  })
                  .strict()
              )
              .min(1)
              .max(COLLECTION_LIMITS.garagesPerList * 2),
          })
          .strict()
      )
      .min(1)
      .max(COLLECTION_LIMITS.listsPerRequest),
    sendTelegram: z.boolean(),
  })
  .strict()

export const listCollectionListsQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).default('all'),
  open: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
})

export const updateCollectionItemSchema = z
  .object({
    actorName: signedActorName,
    status: z.enum(COLLECTION_ITEM_STATUSES),
    note,
  })
  .strict()

export const closeCollectionListSchema = z
  .object({ actorName: signedActorName })
  .strict()

export type CreateCollectionListsInput = z.infer<
  typeof createCollectionListsSchema
>
export type ListCollectionListsQuery = z.infer<
  typeof listCollectionListsQuerySchema
>
export type UpdateCollectionItemInput = z.infer<
  typeof updateCollectionItemSchema
>
