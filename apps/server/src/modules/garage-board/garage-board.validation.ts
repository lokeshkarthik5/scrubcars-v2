import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { COLOUR_NAME_MAX, COLOUR_TAGS, TARGET_COUNTS, TARGET_MAX } from '../../lib/admin-settings.js'
import { isCalendarDate } from '../../lib/booking-ops.js'

/** The most garages one "Set colour" takes: a page of the list and more. */
export const COLOUR_TAG_MAX_GARAGES = 500

const day = z.string().refine(isCalendarDate, 'Pick a real day (YYYY-MM-DD)')

/**
 * The colour for one garage or several checked rows: a colour, or null for
 * none. `callOn` is the Call back day, only with blue.
 */
export const setColourTagsSchema = z
  .object({
    actorName: signedActorName,
    vendorIds: z.array(z.string().uuid()).min(1).max(COLOUR_TAG_MAX_GARAGES),
    tag: z.enum(COLOUR_TAGS).nullable(),
    callOn: day.nullable().optional(),
  })
  .strict()
  .refine((input) => !input.callOn || input.tag === 'blue', {
    message: 'Only Call back takes a day',
    path: ['callOn'],
  })

/** The onboarding target: how many, by when (optional), and what counts. */
export const setGarageTargetSchema = z
  .object({
    actorName: signedActorName,
    target: z.number().int().min(1, 'At least 1').max(TARGET_MAX),
    endsOn: day.nullable(),
    counts: z.enum(TARGET_COUNTS),
  })
  .strict()

const colourName = z.string().trim().min(1, 'Give each colour a name').max(COLOUR_NAME_MAX)

/** The colours' names, for the whole team. */
export const setColourNamesSchema = z
  .object({
    actorName: signedActorName,
    green: colourName,
    amber: colourName,
    red: colourName,
    blue: colourName,
  })
  .strict()

export type SetColourTagsInput = z.infer<typeof setColourTagsSchema>
export type SetGarageTargetInput = z.infer<typeof setGarageTargetSchema>
export type SetColourNamesInput = z.infer<typeof setColourNamesSchema>
