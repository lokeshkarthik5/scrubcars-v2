import { z } from 'zod'
import {
  FINAL_BILL_LINE_MAX_CHARS,
  FINAL_BILL_MAX_LINES,
  finalBillTotal,
} from '../../lib/final-bill.js'

export const jobIdParamSchema = z.object({
  id: z.uuid(),
})

export const chargeParamSchema = z.object({
  id: z.uuid(),
  chargeId: z.uuid(),
})

// Rupees, as a number with at most two decimals. The ceiling is far above any
// real car repair and well inside numeric(10,2), so a slipped zero is refused
// rather than stored.
const lineAmountSchema = z
  .number()
  .positive('Each line needs an amount above ₹0')
  .max(1_000_000, 'That amount is too large for one line')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Amounts can have at most two decimals',
  })

export const finalBillLineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Describe each line')
    .max(FINAL_BILL_LINE_MAX_CHARS, `Keep each line under ${FINAL_BILL_LINE_MAX_CHARS} characters`),
  amount: lineAmountSchema,
})

export const raiseFinalBillSchema = z
  .object({
    lines: z
      .array(finalBillLineSchema)
      .min(1, 'Add at least one line')
      .max(FINAL_BILL_MAX_LINES, `A bill can have at most ${FINAL_BILL_MAX_LINES} lines`),
    // Optional, and an empty box is no note rather than an empty one.
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((note) => (note ? note : undefined)),
  })
  .refine((bill) => Number(finalBillTotal(bill.lines)) >= 1, {
    message: 'The bill must come to at least ₹1',
    path: ['lines'],
  })

export const verifyChargePaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

export type RaiseFinalBillInput = z.infer<typeof raiseFinalBillSchema>
export type VerifyChargePaymentInput = z.infer<typeof verifyChargePaymentSchema>
