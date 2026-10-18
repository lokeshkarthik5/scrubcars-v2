import { z } from 'zod'
import { COUPON_KINDS, COUPON_REWARDS, REDEEM_CHANNELS } from '../../lib/coupons.js'
import { serviceCategoryEnum } from '../../db/schema.js'

export const batchIdParamSchema = z.object({ id: z.uuid() })

/** No line breaks or control characters. */
const plainText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .min(min, message)
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use plain text')

/** A code as typed, scanned or linked; read by lib/coupons.ts parseCouponCode. */
const code = z.string().min(1).max(40)

export const lookupCouponSchema = z.object({ code }).strict()

export const redeemCouponSchema = z
  .object({ code, channel: z.enum(REDEEM_CHANNELS).default('typed') })
  .strict()

const actorName = z.string().trim().min(2, 'Type your name').max(100)
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
const wholeOrNull = z.number().int().nullable().default(null)

/**
 * A new batch. The shape here; whether it fits together (a % needs a cap,
 * stamps need Rewards, dates) is lib/coupons.ts `batchProblems`, which
 * answers in plain words.
 */
export const createBatchSchema = z
  .object({
    name: plainText(3, 80, 'Name the campaign'),
    location: plainText(3, 120, 'Say where it is given out'),
    kind: z.enum(COUPON_KINDS),
    count: z.number().int().min(1).max(5000).default(1),
    maxRedemptions: wholeOrNull,
    reward: z.enum(COUPON_REWARDS),
    amountOff: wholeOrNull,
    percentOff: wholeOrNull,
    maxDiscount: wholeOrNull,
    stamps: wholeOrNull,
    minOrder: wholeOrNull,
    serviceCategory: z.enum(serviceCategoryEnum.enumValues).nullable().default(null),
    vendorId: z.uuid().nullable().default(null),
    newCustomersOnly: z.boolean().default(false),
    validFrom: dateKey,
    validTo: dateKey,
    actorName,
  })
  .strict()

export const voidBatchSchema = z
  .object({
    actorName,
    reason: z.string().trim().min(3, 'Say why').max(300),
    /** Also cancel vouchers customers added but have not spent. */
    cancelUnspent: z.boolean().default(true),
  })
  .strict()

export const voidCodeSchema = z
  .object({
    code,
    actorName,
    reason: z.string().trim().min(3, 'Say why').max(300),
  })
  .strict()

export type CreateBatchInput = z.infer<typeof createBatchSchema>
export type VoidBatchInput = z.infer<typeof voidBatchSchema>
export type VoidCodeInput = z.infer<typeof voidCodeSchema>
export type RedeemCouponInput = z.infer<typeof redeemCouponSchema>
