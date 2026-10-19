import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { GIFT_BUY_DESIGNS, GIFT_MAX_AMOUNT, GIFT_MIN_AMOUNT, giftDesignToStore } from '../../lib/gift-credit.js'

export const giftIdParamSchema = z.object({ id: z.uuid() })

/** No line breaks or control characters in a name or a card's message. */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use plain text')

/**
 * Buying a gift: the amount in whole rupees, who it's for, a message, a card.
 * `fresh` (an app from before 0055) is taken and stored as `pearl`.
 */
export const buyGiftSchema = z
  .object({
    amount: z.number().int().min(GIFT_MIN_AMOUNT).max(GIFT_MAX_AMOUNT),
    recipientName: plainText(60).pipe(z.string().min(1, "Type the person's name")),
    message: plainText(200).optional(),
    design: z.enum([...GIFT_BUY_DESIGNS, 'fresh']).transform(giftDesignToStore),
  })
  .strict()

export const verifyGiftSchema = z
  .object({
    razorpayOrderId: z.string().min(1).max(255),
    razorpayPaymentId: z.string().min(1).max(255),
    razorpaySignature: z.string().min(1).max(255),
  })
  .strict()

/** A code as typed or linked; normalised and checked by lib/gift-credit.ts. */
export const giftCodeSchema = z.object({ code: z.string().min(1).max(40) }).strict()

const actorName = signedActorName

export const cancelGiftSchema = z
  .object({ actorName, reason: z.string().trim().min(3, 'Say why').max(300) })
  .strict()

export const adminGiftListQuerySchema = z.object({
  status: z.enum(['all', 'available', 'redeemed', 'expired', 'cancelled']).default('all'),
})

export type BuyGiftInput = z.infer<typeof buyGiftSchema>
export type VerifyGiftInput = z.infer<typeof verifyGiftSchema>
export type CancelGiftInput = z.infer<typeof cancelGiftSchema>
