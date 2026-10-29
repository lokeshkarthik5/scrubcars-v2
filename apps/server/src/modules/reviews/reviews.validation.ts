import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import {
  RATING_RULES,
  REVIEW_TAGS,
  reviewTagsRefusal,
} from '../../lib/ratings.js'

const TAG_WORDS = {
  unknown_tag: 'Pick tags from the list.',
  duplicate: 'Each tag once.',
  wrong_tone: 'Good tags go with 4 or 5 stars, problems with 1 to 3.',
} as const

/**
 * A review: stars, an optional comment and, since 0065, optional tags from
 * the fixed list that go with the stars (lib/ratings.ts). The web form sends
 * none; the app adds them.
 */
export const createReviewSchema = z
  .object({
    bookingId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(5000).nullable().optional(),
    tags: z.array(z.enum(REVIEW_TAGS)).max(REVIEW_TAGS.length).optional(),
  })
  .superRefine((value, ctx) => {
    const refusal = reviewTagsRefusal(value.rating, value.tags ?? [])
    if (refusal)
      ctx.addIssue({
        code: 'custom',
        path: ['tags'],
        message: TAG_WORDS[refusal],
      })
  })

export const vendorIdParamSchema = z.object({
  vendorId: z.string().uuid(),
})

export const reviewIdParamSchema = z.object({
  reviewId: z.string().uuid(),
})

/** Anyone signed in, or the garage, reporting a review to the team (0065). */
export const reportReviewSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(
        RATING_RULES.reasonMinLength,
        'Say in a few words what is wrong with it'
      )
      .max(RATING_RULES.reportReasonMaxLength),
  })
  .strict()

/** The garage's one public reply (0065), editable for 24 hours. */
export const replySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Write a reply')
      .max(RATING_RULES.replyMaxLength),
  })
  .strict()

/** Admin hides a review, with the reason (0065). Signed by the session. */
export const hideReviewSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(RATING_RULES.reasonMinLength, 'Say why it is hidden')
      .max(RATING_RULES.hideReasonMaxLength),
    actorName: signedActorName,
  })
  .strict()

/** Admin shows a hidden review again. Signed by the session. */
export const showReviewSchema = z
  .object({ actorName: signedActorName })
  .strict()

export type CreateReviewInput = z.infer<typeof createReviewSchema>
export type ReportReviewInput = z.infer<typeof reportReviewSchema>
export type ReplyInput = z.infer<typeof replySchema>
export type HideReviewInput = z.infer<typeof hideReviewSchema>
