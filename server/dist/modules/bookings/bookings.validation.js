import { z } from 'zod';
export const bookingStatusSchema = z.enum([
    'pending',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
]);
export const bookingTypeSchema = z.enum(['doorstep', 'dropin']);
export const paymentMethodSchema = z.enum(['online', 'cash']);
export const listMyBookingsQuerySchema = z.object({
    status: bookingStatusSchema.optional(),
    booking_type: bookingTypeSchema.optional(),
});
export const listVendorBookingsQuerySchema = z.object({
    status: z
        .enum(['pending', 'confirmed', 'in_progress', 'completed'])
        .optional(),
});
export const bookingIdParamSchema = z.object({
    id: z.string().uuid(),
});
export const createBookingSchema = z
    .object({
    vendorId: z.string().uuid(),
    serviceId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    bookingType: bookingTypeSchema,
    scheduledAt: z.string().datetime(),
    paymentMethod: paymentMethodSchema,
    addressId: z.string().uuid().optional(),
})
    .superRefine((data, ctx) => {
    if (data.bookingType === 'doorstep' && !data.addressId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'addressId is required for doorstep bookings',
            path: ['addressId'],
        });
    }
});
