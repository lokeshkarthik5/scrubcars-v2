import { z } from 'zod'

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Phone must be a 10-digit number')

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM')

const serviceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional(),
    category: z.enum([
      'car_wash',
      'detailing',
      'coating',
      'scratch_removal',
      'others',
    ]),
    pricingType: z
      .enum(['flat', 'per_vehicle', 'from', 'on_inspection'])
      .default('flat'),
    price: z.number().positive().optional(),
    priceHatchback: z.number().positive().optional(),
    priceSedan: z.number().positive().optional(),
    priceSuv: z.number().positive().optional(),
    durationMins: z.number().int().positive(),
  })
  .superRefine((data, ctx) => {
    if (data.pricingType === 'flat' || data.pricingType === 'from') {
      if (data.price === undefined || data.price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['price'],
          message: `A positive price is required for '${data.pricingType}' pricing`,
        })
      }
    }
    if (data.pricingType === 'per_vehicle') {
      const tiers = [data.priceHatchback, data.priceSedan, data.priceSuv]
      if (!tiers.some((t) => typeof t === 'number' && t > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priceHatchback'],
          message:
            'At least one vehicle tier price is required for per-vehicle pricing',
        })
      }
    }
  })

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

export const createVendorSchema = z.object({
  // Business + contact
  ownerName: z.string().trim().min(1).max(255),
  ownerPhone: phoneSchema,
  businessName: z.string().trim().min(1).max(255),
  phone: phoneSchema,
  address: z.string().trim().min(1),
  city: z.string().trim().min(1).max(100),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Pincode must be a 6-digit number'),
  email: z.string().trim().email().optional(),
  whatsapp: phoneSchema.optional(),
  yearsInOperation: z.string().trim().max(20).optional(),
  mapsUrl: z.string().trim().url().max(2048).optional(),
  // Operations
  pickup: z.enum(['yes', 'nearby', 'no']).optional(),
  pickupRadiusKm: z.number().positive().optional(),
  dropinEnabled: z.boolean().optional(),
  doorstepEnabled: z.boolean().optional(),
  slotIntervalMins: z
    .union([z.literal(30), z.literal(45), z.literal(60)])
    .optional(),
  bays: z.number().int().min(0).optional(),
  jobsPerDay: z.number().int().min(0).optional(),
  vehicleTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  // Working hours: applied to workingDays, closed on the rest
  workingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  openTime: timeSchema.optional(),
  closeTime: timeSchema.optional(),
  // Onboarding
  status: z.enum(['pending', 'active', 'suspended', 'archived']).optional(),
  isVerified: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional(),
  // Services offered (structured: bookable line items)
  services: z.array(serviceInputSchema).max(50).optional(),
})

export const listBookingsQuerySchema = z.object({
  status: z
    .enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>
