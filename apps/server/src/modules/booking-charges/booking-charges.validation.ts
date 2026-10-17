import { z } from 'zod'
import {
  EXTRA_WORK_DESCRIPTION_MAX_CHARS,
  EXTRA_WORK_MAX_PHOTOS,
  EXTRA_WORK_NOTE_MAX_CHARS,
} from '../../lib/extra-work.js'
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

/**
 * Extra work the garage asks for (0041): what, the price, an optional note
 * and up to three photos, by the keys their upload URLs were minted for (the
 * service checks each sits in this job's folder and builds the URL itself).
 * Strict, so nothing else rides along.
 */
export const askExtraWorkSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Say what the extra work is')
      .max(
        EXTRA_WORK_DESCRIPTION_MAX_CHARS,
        `Keep it under ${EXTRA_WORK_DESCRIPTION_MAX_CHARS} characters`
      ),
    // At least ₹1: Razorpay takes nothing smaller.
    amount: lineAmountSchema.refine((value) => value >= 1, {
      message: 'The price must be at least ₹1',
    }),
    note: z
      .string()
      .trim()
      .max(EXTRA_WORK_NOTE_MAX_CHARS)
      .optional()
      .transform((note) => (note ? note : undefined)),
    photoKeys: z
      .array(z.string().min(1).max(1024))
      .max(EXTRA_WORK_MAX_PHOTOS, `Add at most ${EXTRA_WORK_MAX_PHOTOS} photos`)
      .default([]),
  })
  .strict()

/** A photo for an extra-work request: images only, like job photos. */
export const extraWorkUploadUrlSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  })
  .strict()

export const verifyChargePaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

export type RaiseFinalBillInput = z.infer<typeof raiseFinalBillSchema>
export type VerifyChargePaymentInput = z.infer<typeof verifyChargePaymentSchema>
export type AskExtraWorkInput = z.infer<typeof askExtraWorkSchema>
export type ExtraWorkUploadUrlInput = z.infer<typeof extraWorkUploadUrlSchema>
