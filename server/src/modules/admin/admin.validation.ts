import { z } from 'zod'

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Phone must be a 10-digit number')

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

export const createVendorSchema = z.object({
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
})

export const listBookingsQuerySchema = z.object({
  status: z
    .enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>
