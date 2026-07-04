import { z } from 'zod';
const phoneSchema = z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number');
const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
export const vendorIdParamSchema = z.object({
    id: z.string().uuid(),
});
export const resourceIdParamSchema = z.object({
    id: z.string().uuid(),
});
export const slotsQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    service_id: z.string().uuid(),
});
export const createVendorSchema = z.object({
    businessName: z.string().trim().min(1).max(255),
    phone: phoneSchema,
    address: z.string().trim().min(1),
    city: z.string().trim().min(1).max(100),
    lat: z.number().finite(),
    lng: z.number().finite(),
});
export const updateVendorSchema = z
    .object({
    businessName: z.string().trim().min(1).max(255).optional(),
    phone: phoneSchema.optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});
export const updateJobTypesSchema = z
    .object({
    dropinEnabled: z.boolean().optional(),
})
    .refine((data) => data.dropinEnabled !== undefined, {
    message: 'dropinEnabled must be provided',
});
export const updateSlotIntervalSchema = z.object({
    slotIntervalMins: z.union([z.literal(30), z.literal(45), z.literal(60)]),
});
export const workingHoursDaySchema = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: timeSchema,
    closeTime: timeSchema,
    isClosed: z.boolean().default(false),
});
export const setWorkingHoursSchema = z.object({
    days: z
        .array(workingHoursDaySchema)
        .length(7)
        .refine((days) => new Set(days.map((day) => day.dayOfWeek)).size === 7, 'days must include each dayOfWeek from 0 to 6 exactly once'),
});
export const createServiceAreaSchema = z.object({
    areaName: z.string().trim().min(1).max(255),
    pincode: z.string().trim().min(6).max(10),
    radiusKm: z.number().positive().optional(),
});
export const uploadPhotoSchema = z.object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(100),
});
export const reorderPhotosSchema = z.object({
    photos: z
        .array(z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
    }))
        .min(1),
});
export const serviceCategorySchema = z.enum([
    'car_wash',
    'detailing',
    'coating',
    'scratch_removal',
]);
export const listPublicVendorsQuerySchema = z.object({
    booking_type: z.enum(['doorstep', 'dropin']).optional(),
    category: serviceCategorySchema.optional(),
    q: z.string().trim().min(1).optional(),
    pincode: z.string().trim().min(6).max(10).optional(),
});
export const createServiceSchema = z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional(),
    category: serviceCategorySchema,
    price: z.number().positive(),
    durationMins: z.number().int().positive(),
});
export const updateServiceSchema = z
    .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    category: serviceCategorySchema.optional(),
    price: z.number().positive().optional(),
    durationMins: z.number().int().positive().optional(),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
});
export const toggleServiceActiveSchema = z.object({
    isActive: z.boolean(),
});
