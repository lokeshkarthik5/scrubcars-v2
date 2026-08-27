import { z } from 'zod'

// Codes are stored as the admin typed them but matched case-insensitively, so
// the shape is all that is constrained here: no spaces (a customer pasting
// " SAVE20 " is trimmed, but "SAVE 20" is a different code and would never
// match), and a character set that survives being read aloud over the phone.
const codeSchema = z
  .string()
  .trim()
  .min(3, 'Code must be at least 3 characters')
  .max(40)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Code can only contain letters, numbers, hyphens and underscores'
  )

const moneySchema = z.number().positive().max(1_000_000)

// Blank/0 from the admin form means "unlimited", which is null on the wire.
const optionalLimitSchema = z.number().int().positive().nullable().optional()

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')

export const validateDiscountSchema = z.object({
  code: codeSchema,
  vendorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  vehicleId: z.string().uuid(),
})

const discountBaseSchema = z.object({
  code: codeSchema,
  description: z.string().trim().max(500).nullable().optional(),
  discountType: z.enum(['percentage', 'fixed']),
  // 20 = 20%. Capped at 99 because the engine must leave ≥ ₹1 payable for
  // Razorpay; see MIN_PAYABLE_PAISE in lib/discounts.ts.
  percentOff: z.number().positive().max(99).optional(),
  amountOff: moneySchema.optional(),
  maxDiscountAmount: moneySchema.nullable().optional(),
  minOrderAmount: moneySchema.nullable().optional(),
  perUserLimit: optionalLimitSchema,
  totalUsageLimit: optionalLimitSchema,
  vendorId: z.string().uuid().nullable().optional(),
  fundedBy: z.enum(['platform', 'vendor']).default('platform'),
  startsAt: isoDateSchema.nullable().optional(),
  endsAt: isoDateSchema.nullable().optional(),
  isActive: z.boolean().default(true),
})

type DiscountBase = z.infer<typeof discountBaseSchema>

// The effect columns are nullable in the database because only one kind of
// effect applies at a time; this is what decides which one is required. Kept
// in step with the check constraints in 0016_add_discounts.sql — a change here
// without a matching migration lets a row through that the engine can't price.
const refineDiscountEffect = (
  data: Partial<DiscountBase>,
  ctx: z.RefinementCtx
) => {
  if (data.discountType === 'percentage') {
    if (typeof data.percentOff !== 'number' || data.percentOff <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['percentOff'],
        message: 'A percentage between 0 and 99 is required',
      })
    }
    if (typeof data.amountOff === 'number') {
      ctx.addIssue({
        code: 'custom',
        path: ['amountOff'],
        message: 'A percentage discount cannot also have a flat amount',
      })
    }
  }

  if (data.discountType === 'fixed') {
    if (typeof data.amountOff !== 'number' || data.amountOff <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountOff'],
        message: 'A positive amount is required',
      })
    }
    if (typeof data.percentOff === 'number') {
      ctx.addIssue({
        code: 'custom',
        path: ['percentOff'],
        message: 'A flat discount cannot also have a percentage',
      })
    }
    // A cap only means something against a percentage.
    if (typeof data.maxDiscountAmount === 'number') {
      ctx.addIssue({
        code: 'custom',
        path: ['maxDiscountAmount'],
        message: 'A maximum only applies to percentage discounts',
      })
    }
  }

  if (data.startsAt && data.endsAt) {
    if (Date.parse(data.endsAt) <= Date.parse(data.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'End date must be after the start date',
      })
    }
  }
}

export const createDiscountSchema =
  discountBaseSchema.superRefine(refineDiscountEffect)

// PATCH stays partial — only the keys actually present are written — but the
// effect refinement still runs, so switching a code from percentage to fixed
// must send the new effect column in the same request.
export const updateDiscountSchema = discountBaseSchema
  .partial()
  .superRefine(refineDiscountEffect)
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field is required'
  )

export const listDiscountsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).optional(),
})

export const discountIdParamSchema = z.object({ id: z.string().uuid() })

export type ValidateDiscountInput = z.infer<typeof validateDiscountSchema>
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>
export type ListDiscountsQuery = z.infer<typeof listDiscountsQuerySchema>
