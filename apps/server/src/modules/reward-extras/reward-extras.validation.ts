import { z } from 'zod'
import { CHALLENGE_BOOKING_TYPES, CHALLENGE_CATEGORIES, CHALLENGE_LIMITS, CHALLENGE_REWARD_KINDS } from '../../lib/challenges.js'
import { LEVELS } from '../../lib/rewards.js'

export const challengeIdParamSchema = z.object({ id: z.uuid() })
export const customerIdParamSchema = z.object({ userId: z.uuid() })

/** A Wrapped year: four digits, 2026 or later (the rules check it is open). */
const year = z.coerce.number().int().min(2026).max(2200)
export const wrappedQuerySchema = z.object({ year }).strict()
export const wrappedYearParamSchema = z.object({ year })

/** The celebration was shown: the badges' ids (the session's own only). */
export const seenSchema = z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict()

/** Opened or shared, counted; nothing else is sent (no image, no where). */
export const wrappedEventSchema = z.object({ kind: z.enum(['opened', 'shared']) }).strict()

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
const whole = z.number().int()

/**
 * A challenge as the admin form sends it: the shape only. The rules (dates,
 * goal, the reward's fields, copy rules, a ₹ prize's winners cap) are
 * lib/challenges.ts `challengeProblems`, which the service runs.
 */
export const challengeSchema = z
  .object({
    title: z.string().trim().min(CHALLENGE_LIMITS.title.min).max(CHALLENGE_LIMITS.title.max),
    description: z.string().trim().max(CHALLENGE_LIMITS.description.max).nullable(),
    startDate: dateKey,
    endDate: dateKey,
    goalCount: whole,
    category: z.enum(CHALLENGE_CATEGORIES).nullable(),
    bookingType: z.enum(CHALLENGE_BOOKING_TYPES).nullable(),
    rewardKind: z.enum(CHALLENGE_REWARD_KINDS),
    rewardStamps: whole.nullable(),
    rewardAmount: whole.nullable(),
    rewardMultiplier: whole.nullable(),
    audienceMinLevel: z.enum(LEVELS).nullable(),
    maxWinners: whole.nullable(),
    actorName: z.string().trim().min(2, 'Type your name').max(100),
  })
  .strict()

/** Publish or end: the typed name. */
export const challengeActionSchema = z.object({ actorName: z.string().trim().min(2, 'Type your name').max(100) }).strict()

export type ChallengeBody = z.infer<typeof challengeSchema>
