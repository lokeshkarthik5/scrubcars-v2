import { z } from 'zod'
import { isCalendarDate } from '../../lib/booking-ops.js'
import { ACCOUNT_NUMBER_PATTERN, IFSC_PATTERN, UPI_ID_PATTERN } from '../../lib/payouts.js'
import { MAX_RANGE_DAYS, rangeDays } from '../../lib/stats.js'

const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')
  .refine(isCalendarDate, 'That date does not exist')

/**
 * The garage's Earnings list: IST dates, both included, by when each
 * booking became payable. Both or neither (the last 30 days); at most a
 * year, like Statistics.
 */
export const earningsStatementQuerySchema = z
  .object({ from: istDateSchema.optional(), to: istDateSchema.optional() })
  .superRefine((range, ctx) => {
    if (Boolean(range.from) !== Boolean(range.to)) {
      ctx.addIssue({ code: 'custom', message: "Give both 'from' and 'to', or neither", path: ['from'] })
    } else if (range.from && range.to) {
      if (range.from > range.to) {
        ctx.addIssue({ code: 'custom', message: "'from' must be on or before 'to'", path: ['from'] })
      } else if (rangeDays({ from: range.from, to: range.to }) > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: 'custom', message: `Pick ${MAX_RANGE_DAYS} days or fewer`, path: ['to'] })
      }
    }
  })

export const vendorIdParamSchema = z.object({ vendorId: z.string().uuid() })

const toThePaisa = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

/**
 * Recording a payout Detlio has made.
 *
 * `amount` and `upTo` are what the dialog showed: the balance due and the
 * moment it was worked out at. The payout settles every booking payable by
 * `upTo`, and only if that still comes to `amount` (409
 * PAYOUT_STATE_CHANGED otherwise), so the same press sent twice, or a
 * figure that moved while the dialog was open, records nothing. The amount
 * is never typed freely: a payout settles whole bookings.
 *
 * `actorName` is the name the person typed, as the reset and the Bin ask
 * for it: the shared admin login would otherwise make everyone 'admin'.
 */
export const recordPayoutSchema = z
  .object({
    amount: z
      .number()
      .positive('The amount must be more than ₹0')
      .max(10_000_000)
      .refine(toThePaisa, 'The amount can have at most two decimal places'),
    upTo: z.string().datetime({ offset: true }),
    method: z.enum(['bank', 'upi', 'other']),
    reference: z
      .string()
      .trim()
      .min(4, 'Give the UTR or UPI transaction id')
      .max(80)
      .regex(/^[A-Za-z0-9/_.-]+$/, 'Letters, numbers and - / _ . only'),
    paidAt: z.string().datetime({ offset: true }),
    note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => value || undefined),
    actorName: z.string().trim().min(2, 'Type your name').max(100),
  })
  .strict()

const optionalField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null)

/**
 * A garage's payout details. Empty fields clear; a bank account needs its
 * number and IFSC together; something to pay to is needed (bank or UPI).
 */
export const payoutAccountSchema = z
  .object({
    accountName: optionalField(100),
    accountNumber: optionalField(18)
      .transform((value) => (value ? value.replace(/\s+/g, '') : null))
      .refine((value) => value === null || ACCOUNT_NUMBER_PATTERN.test(value), 'An account number is 9 to 18 digits'),
    ifsc: optionalField(11)
      .transform((value) => (value ? value.toUpperCase() : null))
      .refine((value) => value === null || IFSC_PATTERN.test(value), 'An IFSC is 11 characters, like HDFC0001234'),
    upiId: optionalField(100).refine(
      (value) => value === null || UPI_ID_PATTERN.test(value),
      'A UPI id looks like name@bank'
    ),
    actorName: z.string().trim().min(2, 'Type your name').max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Boolean(input.accountNumber) !== Boolean(input.ifsc)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Give the account number and the IFSC together',
        path: [input.accountNumber ? 'ifsc' : 'accountNumber'],
      })
    }
    if (!input.accountNumber && !input.upiId) {
      ctx.addIssue({ code: 'custom', message: 'Give a bank account or a UPI id', path: ['accountNumber'] })
    }
  })

export type EarningsStatementQuery = z.infer<typeof earningsStatementQuerySchema>
export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>
export type PayoutAccountInput = z.infer<typeof payoutAccountSchema>
