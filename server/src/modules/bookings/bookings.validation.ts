import { z } from 'zod'

export const bookingStatusSchema = z.enum([
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'rescheduled',
])

export const bookingTypeSchema = z.enum(['doorstep', 'dropin'])
export const createBookingTypeSchema = z.literal('dropin')

export const paymentMethodSchema = z.enum(['online', 'cash'])

export const listMyBookingsQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  booking_type: bookingTypeSchema.optional(),
})

export const listVendorBookingsQuerySchema = z.object({
  status: z
    .enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .optional(),
})

export const bookingIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

export const rescheduleBookingSchema = z.object({
  scheduledAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional(),
})

export const createBookingSchema = z
  .object({
    vendorId: z.string().uuid(),
    serviceId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    bookingType: createBookingTypeSchema,
    scheduledAt: z.string().datetime(),
    // All bookings prepay online via Razorpay; cash is no longer accepted.
    paymentMethod: z.literal('online').default('online'),
    addressId: z.string().uuid().optional(),
    // Optional promo code. Only the shape is validated here — whether it
    // applies is decided by the discount engine at write time, never by the
    // client.
    discountCode: z.string().trim().min(3).max(40).optional(),
  })

export type ListMyBookingsQuery = z.infer<typeof listMyBookingsQuerySchema>
export type ListVendorBookingsQuery = z.infer<
  typeof listVendorBookingsQuerySchema
>
export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>
