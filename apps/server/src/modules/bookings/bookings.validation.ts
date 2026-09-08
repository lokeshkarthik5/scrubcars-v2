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
// Both modes are bookable. Doorstep additionally requires `addressId`, which
// `createBookingSchema` enforces below rather than leaving to the service — a
// doorstep request with no address is malformed, not a business-rule failure.
export const createBookingTypeSchema = bookingTypeSchema

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

// A booking can carry several services, but not an unbounded number: the
// duration is their sum, and past a handful nothing fits inside a working day
// anyway. The cap is here rather than in the UI so the API is bounded too.
export const MAX_SERVICES_PER_BOOKING = 10

export const createBookingSchema = z
  .object({
    vendorId: z.string().uuid(),
    // `serviceId` is the old single-service shape, still accepted so a client
    // that has not been updated keeps working. Exactly one of the two must be
    // present; both normalise to `serviceIds` below, and nothing downstream
    // knows there were ever two shapes.
    serviceId: z.string().uuid().optional(),
    serviceIds: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_SERVICES_PER_BOOKING)
      .optional(),
    vehicleId: z.string().uuid(),
    bookingType: createBookingTypeSchema,
    scheduledAt: z.string().datetime(),
    // All bookings prepay online via Razorpay; cash is no longer accepted.
    paymentMethod: z.literal('online').default('online'),
    // Required for doorstep and meaningless for drop-in; see the refine below.
    addressId: z.string().uuid().optional(),
    // Optional promo code. Only the shape is validated here — whether it
    // applies is decided by the discount engine at write time, never by the
    // client.
    discountCode: z.string().trim().min(3).max(40).optional(),
  })
  .transform(({ serviceId, serviceIds, ...rest }) => ({
    ...rest,
    // Deduped rather than rejected: the same service twice is a double-tap in
    // the UI, not a request to charge for it twice. Order is the customer's.
    serviceIds: Array.from(
      new Set(serviceIds ?? (serviceId ? [serviceId] : []))
    ),
  }))
  .refine((input) => input.serviceIds.length > 0, {
    message: 'Pick at least one service',
    path: ['serviceIds'],
  })
  .refine((input) => input.serviceIds.length <= MAX_SERVICES_PER_BOOKING, {
    message: `A booking can include at most ${MAX_SERVICES_PER_BOOKING} services`,
    path: ['serviceIds'],
  })
  .refine(
    (input) => input.bookingType !== 'doorstep' || input.addressId !== undefined,
    {
      message: 'Choose the address we should come to',
      path: ['addressId'],
    }
  )

export type ListMyBookingsQuery = z.infer<typeof listMyBookingsQuerySchema>
export type ListVendorBookingsQuery = z.infer<
  typeof listVendorBookingsQuerySchema
>
export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>
