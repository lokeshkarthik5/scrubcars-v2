import { z } from 'zod'
import { LEVELS, REWARDS_FIXED, SCRATCH_OUTCOMES, SETTINGS_LIMITS } from '../../lib/rewards.js'

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
 * unspent voucher; always why, and the typed name.
 */
export const adjustRewardsSchema = z
  .object({
    action: z.enum(['add_stamps', 'remove_stamps', 'issue_voucher', 'cancel_voucher']),
    stamps: z.number().int().min(1).max(REWARDS_FIXED.maxAdjustmentStamps).optional(),
    amount: z.number().int().min(1).max(REWARDS_FIXED.maxAdjustmentVoucher).optional(),
    voucherId: z.uuid().optional(),
    reason: z.string().trim().min(3, 'Say why').max(300),
    actorName: z.string().trim().min(2, 'Type your name').max(100),
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
  })
  .strict()

/** Saving: the settings, the version the admin opened (409 if another save came first) and the typed name. */
export const saveSettingsSchema = z
  .object({
    version: z.number().int().min(0),
    settings: rewardsSettingsSchema,
    actorName: z.string().trim().min(2, 'Type your name').max(100),
  })
  .strict()

export type AdjustRewardsInput = z.infer<typeof adjustRewardsSchema>
export type SaveSettingsInput = z.infer<typeof saveSettingsSchema>
