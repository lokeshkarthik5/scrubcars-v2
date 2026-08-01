import { z } from 'zod'

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number')

const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/)

export const vendorIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const resourceIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  service_id: z.string().uuid(),
})

const pickupSchema = z.enum(['yes', 'nearby', 'no'])

const vehicleTypesSchema = z.array(z.string().trim().min(1).max(100)).max(20)

const vendorProfileFields = {
  whatsapp: phoneSchema.optional(),
  email: z.string().trim().email().max(255).optional(),
  yearsInOperation: z.string().trim().max(20).optional(),
  mapsUrl: z.string().trim().url().max(2048).optional(),
  pickup: pickupSchema.optional(),
  pickupRadiusKm: z.number().positive().optional(),
  bays: z.number().int().min(0).optional(),
  jobsPerDay: z.number().int().min(0).optional(),
  vehicleTypes: vehicleTypesSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
}

export const createVendorSchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  phone: phoneSchema,
  address: z.string().trim().min(1),
  city: z.string().trim().min(1).max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be a 6-digit number'),
  lat: z.number().finite(),
  lng: z.number().finite(),
  ...vendorProfileFields,
})

export const updateVendorSchema = z
  .object({
    businessName: z.string().trim().min(1).max(255).optional(),
    phone: phoneSchema.optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be a 6-digit number').optional(),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    ...vendorProfileFields,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export const updateJobTypesSchema = z
  .object({
    dropinEnabled: z.boolean().optional(),
    doorstepEnabled: z.boolean().optional(),
  })
  .refine((data) => data.dropinEnabled !== undefined || data.doorstepEnabled !== undefined, {
    message: 'At least one of dropinEnabled or doorstepEnabled must be provided',
  })

export const updateSlotIntervalSchema = z.object({
  slotIntervalMins: z.union([z.literal(30), z.literal(45), z.literal(60)]),
})

export const workingHoursDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: timeSchema,
  closeTime: timeSchema,
  isClosed: z.boolean().default(false),
})

export const setWorkingHoursSchema = z.object({
  days: z
    .array(workingHoursDaySchema)
    .length(7)
    .refine(
      (days) => new Set(days.map((day) => day.dayOfWeek)).size === 7,
      'days must include each dayOfWeek from 0 to 6 exactly once'
    ),
})

export const createServiceAreaSchema = z.object({
  areaName: z.string().trim().min(1).max(255),
  pincode: z.string().trim().min(6).max(10),
  radiusKm: z.number().positive().optional(),
})

export const reorderPhotosSchema = z.object({
  photos: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1),
})

export const photoUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const createPhotoSchema = z.object({
  url: z.string().url().max(2048),
})

export const logoUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const setLogoSchema = z.object({
  url: z.string().url().max(2048),
})

export const serviceCategorySchema = z.enum([
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
])

export const listPublicVendorsQuerySchema = z.object({
  category: serviceCategorySchema.optional(),
  q: z.string().trim().min(1).optional(),
})

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional(),
  category: serviceCategorySchema,
  price: z.number().positive(),
  durationMins: z.number().int().positive(),
})

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
  })

export const toggleServiceActiveSchema = z.object({
  isActive: z.boolean(),
})

export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>
export type UpdateJobTypesInput = z.infer<typeof updateJobTypesSchema>
export type UpdateSlotIntervalInput = z.infer<typeof updateSlotIntervalSchema>
export type SetWorkingHoursInput = z.infer<typeof setWorkingHoursSchema>
export type CreateServiceAreaInput = z.infer<typeof createServiceAreaSchema>
export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>
export type PhotoUploadUrlInput = z.infer<typeof photoUploadUrlSchema>
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>
export type LogoUploadUrlInput = z.infer<typeof logoUploadUrlSchema>
export type SetLogoInput = z.infer<typeof setLogoSchema>
export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
export type ToggleServiceActiveInput = z.infer<typeof toggleServiceActiveSchema>
export type SlotsQueryInput = z.infer<typeof slotsQuerySchema>
export type ListPublicVendorsQuery = z.infer<typeof listPublicVendorsQuerySchema>
