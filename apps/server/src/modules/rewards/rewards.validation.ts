import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { GARAGE_RARITIES } from '../../lib/garage.js'
import { BADGE_KEYS, LEVELS, REWARDS_FIXED, SCRATCH_OUTCOMES, SETTINGS_LIMITS } from '../../lib/rewards.js'

export const scratchCardParamSchema = z.object({ id: z.uuid() })
export const customerIdParamSchema = z.object({ userId: z.uuid() })
export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() })

/** The invite page's code, in the body (never an API URL). */
export const openInviteSchema = z.object({ code: z.string().trim().min(1).max(20) }).strict()

/** The signed note the invite page kept, brought back after signing up. */
export const claimInviteSchema = z.object({ token: z.string().trim().min(10).max(200) }).strict()

/** The customer's birthday: month and day only, or null to remove it. */
export const birthdaySchema = z
  .object({
    birthday: z
      .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
      .strict()
      .nullable(),
  })
  .strict()

/** Finding a customer by phone: in the body, never the URL. Ten digits. */
export const findCustomerSchema = z
  .object({ phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter the 10-digit mobile number') })
  .strict()

/**
 * A team adjustment: stamps on or off the card, a voucher, or cancelling an
 * unspent voucher; always why, signed by the session (0058).
 */
export const adjustRewardsSchema = z
  .object({
    action: z.enum(['add_stamps', 'remove_stamps', 'issue_voucher', 'cancel_voucher']),
    stamps: z.number().int().min(1).max(REWARDS_FIXED.maxAdjustmentStamps).optional(),
    amount: z.number().int().min(1).max(REWARDS_FIXED.maxAdjustmentVoucher).optional(),
    voucherId: z.uuid().optional(),
    reason: z.string().trim().min(3, 'Say why').max(300),
    actorName: signedActorName,
  })
  .strict()
  .refine(
    (input) =>
      input.action === 'add_stamps' || input.action === 'remove_stamps'
        ? input.stamps !== undefined
        : input.action === 'issue_voucher'
          ? input.amount !== undefined
          : input.voucherId !== undefined,
    { message: 'Say how many stamps, how much, or which voucher' }
  )

const whole = z.number().int()
const weights = z
  .object(Object.fromEntries(SCRATCH_OUTCOMES.map((outcome) => [outcome, whole.min(0).max(100)])) as Record<
    (typeof SCRATCH_OUTCOMES)[number],
    z.ZodNumber
  >)
  .strict()

/** Achievements (0054): each badge on or off and its bonus stamps; any badge left out reads as its default. */
const achievements = z
  .object(
    Object.fromEntries(
      BADGE_KEYS.map((key) => [key, z.object({ enabled: z.boolean(), bonusStamps: whole }).strict().optional()])
    ) as Record<(typeof BADGE_KEYS)[number], z.ZodOptional<z.ZodObject<{ enabled: z.ZodBoolean; bonusStamps: z.ZodNumber }>>>
  )
  .strict()

/**
 * The Detlio Garage (0057): its switch and numbers. Every key optional: a
 * key left out reads as its default (`garageSettings`); the ranges and the
 * odds adding up to 100 are `garageSettingsProblems`.
 */
const garage = z
  .object({
    enabled: z.boolean().optional(),
    rarityWeights: z
      .object(Object.fromEntries(GARAGE_RARITIES.map((r) => [r, whole])) as Record<(typeof GARAGE_RARITIES)[number], z.ZodNumber>)
      .strict()
      .optional(),
    unownedBiasPercent: whole.optional(),
    pityRare: whole.optional(),
    pityLegendary: whole.optional(),
    duplicatesPerStar: whole.optional(),
    rowVoucher: whole.optional(),
    rowFallbackStamps: whole.optional(),
    scratchCardWeight: whole.optional(),
    badgeBonusCards: whole.optional(),
  })
  .strict()

/**
 * The whole settings object, shape and types only. The ranges, the
 * weights adding up to 100 and the levels' order are lib/rewards.ts
 * `settingsProblems`, which the service runs on what this lets through.
 * Also what a stored version is read back through.
 */
export const rewardsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    stampsPerCard: whole,
    minPaidAmount: whole,
    stampValidMonths: whole,
    voucherValidDays: whole,
    scratchCardValidDays: whole,
    scratchAmounts: z.object({ small_off: whole, medium_off: whole, big_off: whole, free_wash: whole }).strict(),
    scratchWeights: weights,
    streakMonths: whole,
    streakBonusStamps: whole,
    levelWindowMonths: whole,
    noShowDropMonths: whole,
    levels: z
      .array(
        z
          .object({
            key: z.enum(LEVELS),
            label: z.string().trim().min(SETTINGS_LIMITS.labelLength.min).max(SETTINGS_LIMITS.labelLength.max),
            minBookings: whole,
            cardReward: whole,
            birthdayVoucher: whole.nullable(),
            annualDetailingVoucher: whole.nullable(),
            scratchWeights: weights.nullable(),
            garageBadge: z.boolean(),
          })
          .strict()
      )
      .length(LEVELS.length),
    referralAmount: whole,
    referralMaxPerYear: whole,
    monthlyCap: whole,
    nudgeGapDays: whole,
    expiryWarningDays: whole,
    achievements: achievements.optional(),
    garage: garage.optional(),
  })
  .strict()

/** Saving: the settings, the version the admin opened (409 if another save came first) and the typed name. */
export const saveSettingsSchema = z
  .object({
    version: z.number().int().min(0),
    settings: rewardsSettingsSchema,
    actorName: signedActorName,
  })
  .strict()

export type AdjustRewardsInput = z.infer<typeof adjustRewardsSchema>
export type SaveSettingsInput = z.infer<typeof saveSettingsSchema>
