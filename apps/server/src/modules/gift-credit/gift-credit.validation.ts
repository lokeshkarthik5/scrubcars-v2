import { z } from 'zod'
import { MAX_ADJUSTMENT } from '../../lib/gift-credit.js'

export const customerIdParamSchema = z.object({ userId: z.uuid() })

/** Finding a customer by phone: in the body, never the URL. Ten digits. */
export const findCustomerSchema = z
  .object({ phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter the 10-digit mobile number') })
  .strict()

/**
 * A manual adjustment: signed rupees (up to two decimals), why, and the
 * name of the person making it, as the Bin records it.
 */
export const adjustCreditSchema = z
  .object({
    amount: z
      .number()
      .min(-MAX_ADJUSTMENT)
      .max(MAX_ADJUSTMENT)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'At most two decimals'),
    reason: z.string().trim().min(3, 'Say why').max(300),
    actorName: z.string().trim().min(2, 'Type your name').max(100),
  })
  .strict()

export type FindCustomerInput = z.infer<typeof findCustomerSchema>
export type AdjustCreditInput = z.infer<typeof adjustCreditSchema>
