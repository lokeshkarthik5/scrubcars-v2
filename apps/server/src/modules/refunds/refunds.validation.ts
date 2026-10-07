import { z } from 'zod'
import { isRazorpayRefundId } from '../../lib/refunds.js'

// The two tabs of the admin Refunds page.
export const listRefundsQuerySchema = z.object({
  status: z.enum(['owed', 'done']).default('owed'),
})

/** Optional free text: trimmed, and an empty box is the same as none. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

const toThePaisa = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

/** Whole rupees or rupees and paise; never a fraction of a paisa. */
const rupeesSchema = z
  .number()
  .positive('The amount must be more than ₹0')
  .max(10_000_000)
  .refine(toThePaisa, 'The amount can have at most two decimal places')

/**
 * Recording a refund ops has done.
 *
 * `id` names the money by where it landed: a booking's id for its payment, a
 * checkout's (booking intent's) id, or a final bill's id.
 *
 * Exactly one of `refundRef` and `outsideRazorpayNote`. A refund done in
 * Razorpay has its refund id, which is what reconciliation needs, and is
 * checked to look like one (rfnd_…) so a payment id pasted by mistake is
 * caught. Money sent back another way (UPI, a bank transfer) has no such id,
 * so ops says how instead.
 */
export const recordRefundSchema = z
  .object({
    kind: z.enum(['booking', 'checkout', 'bill']),
    id: z.string().uuid(),
    amount: rupeesSchema,
    refundRef: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined)
      .refine(
        (value) => value === undefined || isRazorpayRefundId(value),
        'A Razorpay refund id starts with rfnd_ followed by letters and numbers'
      ),
    outsideRazorpayNote: optionalText(500),
    note: optionalText(1000),
    // What had been refunded already when ops opened the dialog. The write
    // only goes through if that still holds, so the same request sent twice
    // (a lost response, then a retry) is refused instead of recorded again —
    // an outside-Razorpay refund has no refund id to catch that by. Optional
    // so a caller without it falls back to the figures the server reads.
    expectedRefunded: z
      .number()
      .min(0)
      .max(10_000_000)
      .refine(toThePaisa, 'The amount can have at most two decimal places')
      .optional(),
  })
  .refine((data) => Boolean(data.refundRef) !== Boolean(data.outsideRazorpayNote), {
    message: 'Give the Razorpay refund id, or say how it was refunded outside Razorpay',
    path: ['refundRef'],
  })

export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>
export type RecordRefundInput = z.infer<typeof recordRefundSchema>
