import { z } from 'zod'
import type { ServicePricingType } from '../../lib/pricing.js'

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
  'package',
])

// The categories a plain service may use. 'package' is excluded: a package is
// only meaningful with member services attached, so it is created and edited
// through /me/packages, never by posting category: 'package' to /me/services.
export const plainServiceCategorySchema = serviceCategorySchema.exclude([
  'package',
])

export const listPublicVendorsQuerySchema = z.object({
  category: serviceCategorySchema.optional(),
  q: z.string().trim().min(1).optional(),
  bookingType: z.enum(['dropin', 'doorstep']).optional(),
})

export const servicePricingTypeSchema = z.enum([
  'flat',
  'per_vehicle',
  'on_inspection',
])

// Shared cohesion check for a service's pricing fields. 'flat'/'on_inspection'
// need a single `price`; 'per_vehicle' needs *every* tier priced. Applied via
// superRefine so we can report the offending field.
//
// All three, not "at least one": the booking charge reads the tier matching the
// customer's vehicle, so a missing tier would either bill them at another
// vehicle's rate or block the booking outright. Neither is something a vendor
// would choose on purpose, so the form asks for all three up front.
const PER_VEHICLE_TIERS = [
  { key: 'priceHatchback', label: 'Hatchback' },
  { key: 'priceSedan', label: 'Sedan' },
  { key: 'priceSuv', label: 'SUV' },
] as const

function refinePricing(
  data: {
    pricingType?: ServicePricingType
    price?: number
    priceHatchback?: number
    priceSedan?: number
    priceSuv?: number
  },
  ctx: z.RefinementCtx
) {
  const type = data.pricingType
  if (type === undefined) return

  if (type === 'flat' || type === 'on_inspection') {
    if (data.price === undefined || data.price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: `A positive price is required for '${type}' pricing`,
      })
    }
  }

  if (type === 'per_vehicle') {
    for (const { key, label } of PER_VEHICLE_TIERS) {
      const value = data[key]
      if (typeof value !== 'number' || value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `A ${label} price is required for per-vehicle pricing`,
        })
      }
    }
  }
}

export const createServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional(),
    category: plainServiceCategorySchema,
    pricingType: servicePricingTypeSchema.default('flat'),
    price: z.number().positive().optional(),
    priceHatchback: z.number().positive().optional(),
    priceSedan: z.number().positive().optional(),
    priceSuv: z.number().positive().optional(),
    durationMins: z.number().int().positive(),
  })
  .superRefine(refinePricing)

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    category: plainServiceCategorySchema.optional(),
    pricingType: servicePricingTypeSchema.optional(),
    price: z.number().positive().optional(),
    priceHatchback: z.number().positive().optional(),
    priceSedan: z.number().positive().optional(),
    priceSuv: z.number().positive().optional(),
    durationMins: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      })
      return
    }
    refinePricing(data, ctx)
  })

export const toggleServiceActiveSchema = z.object({
  isActive: z.boolean(),
})

// ─── Service images ──────────────────────────────────────────────────────────

export const serviceImageUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const createServiceImageSchema = z.object({
  url: z.string().url().max(2048),
})

export const serviceImageParamSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
})

// ─── Packages ────────────────────────────────────────────────────────────────
//
// A package is a services row (category = 'package') plus the member services
// it bundles. Its price and duration are set by the vendor and are independent
// of the members — a bundled wash + interior is usually both cheaper and faster
// than doing the two back to back. The members exist so the UI can itemize the
// contents and compute savings against their live prices.

// At least two members, or it is just a service with extra steps. The dedupe
// check mirrors the unique index on (package_id, service_id).
const packageItemIdsSchema = z
  .array(z.string().uuid())
  .min(2, 'A package needs at least 2 services')
  .max(20)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'The same service cannot be added twice'
  )

export const createPackageSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional(),
    pricingType: servicePricingTypeSchema.default('flat'),
    price: z.number().positive().optional(),
    priceHatchback: z.number().positive().optional(),
    priceSedan: z.number().positive().optional(),
    priceSuv: z.number().positive().optional(),
    durationMins: z.number().int().positive(),
    serviceIds: packageItemIdsSchema,
  })
  .superRefine(refinePricing)

export const updatePackageSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    pricingType: servicePricingTypeSchema.optional(),
    price: z.number().positive().optional(),
    priceHatchback: z.number().positive().optional(),
    priceSedan: z.number().positive().optional(),
    priceSuv: z.number().positive().optional(),
    durationMins: z.number().int().positive().optional(),
    // Omitted = leave the contents alone; provided = replace them wholesale.
    serviceIds: packageItemIdsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      })
      return
    }
    refinePricing(data, ctx)
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
export type ServiceImageUploadUrlInput = z.infer<
  typeof serviceImageUploadUrlSchema
>
export type CreateServiceImageInput = z.infer<typeof createServiceImageSchema>
export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
export type SlotsQueryInput = z.infer<typeof slotsQuerySchema>
export type ListPublicVendorsQuery = z.infer<typeof listPublicVendorsQuerySchema>
