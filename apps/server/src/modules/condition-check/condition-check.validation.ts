import { z } from 'zod'
import { CONDITION_NOTE_MAX, DAMAGE_KINDS, MARK_PART_MAX } from '../../lib/condition-check.js'

export const conditionJobParamSchema = z.object({
  id: z.uuid(),
})

export const conditionPhotoParamSchema = z.object({
  id: z.uuid(),
  photoId: z.uuid(),
})

export const conditionMarkParamSchema = z.object({
  id: z.uuid(),
  markId: z.uuid(),
})

/** "Add a mark Detlio missed": which photo, what, and where on the car. */
export const addMarkSchema = z
  .object({
    photoId: z.uuid(),
    kind: z.enum(DAMAGE_KINDS),
    part: z.string().trim().min(1).max(MARK_PART_MAX),
  })
  .strict()

/**
 * The customer's answer to the before check: "Looks right", or
 * "Something's wrong" with a short note the garage and the team read.
 */
export const conditionAnswerSchema = z.discriminatedUnion('answer', [
  z.object({ answer: z.literal('looks_right') }).strict(),
  z
    .object({
      answer: z.literal('something_wrong'),
      note: z.string().trim().min(1).max(CONDITION_NOTE_MAX),
    })
    .strict(),
])

export type AddMarkInput = z.infer<typeof addMarkSchema>
export type ConditionAnswerInput = z.infer<typeof conditionAnswerSchema>
