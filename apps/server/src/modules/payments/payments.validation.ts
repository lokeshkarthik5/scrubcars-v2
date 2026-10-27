import { z } from 'zod'
import { cleanEventSourceUrl, cleanMetaCookie } from '../../lib/meta-capi.js'

/**
 * Sent with a payment confirmation only when the customer accepted marketing
 * cookies (packages/core MarketingConsentContext); the API then reports the
 * paid booking to Meta (lib/meta-capi.ts). Strict: an unknown key, or a
 * consent that is not `true`, is refused. A cookie or page URL that doesn't
 * look right is dropped rather than refused, so a confirmation that took
 * money never fails over a cookie.
 */
export const marketingConsentSchema = z
  .object({
    consent: z.literal(true),
    // Meta's _fbp / _fbc cookies: `fb.1.…`, at most 200 characters.
    fbp: z
      .string()
      .optional()
      .catch(undefined)
      .transform((value) => cleanMetaCookie(value)),
    fbc: z
      .string()
      .optional()
      .catch(undefined)
      .transform((value) => cleanMetaCookie(value)),
    // https on detlio.com or www.detlio.com, ≤ 300 characters, no query.
    eventSourceUrl: z
      .string()
      .optional()
      .catch(undefined)
      .transform((value) => cleanEventSourceUrl(value)),
  })
  .strict()

export const bookingIdParamSchema = z.object({
  bookingId: z.uuid(),
})

export const createOrderSchema = bookingIdParamSchema

const razorpayResultSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  marketing: marketingConsentSchema.optional(),
})

// Two things can be paid for. `intentId` is the current flow, where the booking
// does not exist yet and this call is what creates it. `bookingId` is the
// legacy one — an unpaid booking from before this change, or any booking whose
// payment failed — settled from the "Pay Now" button on booking details.
export const verifyPaymentSchema = z.union([
  razorpayResultSchema.extend({ intentId: z.uuid() }),
  razorpayResultSchema.extend({ bookingId: z.uuid() }),
])

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>
