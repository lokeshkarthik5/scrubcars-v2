import { z } from 'zod'
import { isCalendarDate } from '../../lib/booking-ops.js'
import type { ServicePricingType } from '../../lib/pricing.js'

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number')

const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/)

export const vendorIdParamSchema = z.object({
  id: z.string().uuid(),
})

// A vendor and one of the customer's bookings there, for the reschedule
// sheet's slot list.
export const rescheduleSlotsParamSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
})

export const resourceIdParamSchema = z.object({
  id: z.string().uuid(),
})

// `service_id` takes one id or a comma-separated list, because a booking can
// now be several services and the block that has to fit is their combined
// duration. A single id is still exactly what it was.
export const slotsQuerySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    service_id: z.string().min(1),
    // Doorstep needs more notice than at-garage. A client that does not say
    // gets the stricter doorstep list, so it is never offered a time that
    // checkout would then refuse.
    booking_type: z.enum(['dropin', 'doorstep']).optional(),
  })
  .transform(({ service_id, booking_type, ...rest }) => ({
    ...rest,
    bookingType: booking_type ?? ('doorstep' as const),
    serviceIds: Array.from(
      new Set(
        service_id
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ),
  }))
  .refine(
    (input) =>
      input.serviceIds.length > 0 &&
      input.serviceIds.length <= 10 &&
      input.serviceIds.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ),
    { message: 'service_id must be one or more service UUIDs', path: ['service_id'] }
  )

const pickupSchema = z.enum(['yes', 'nearby', 'no'])

const vehicleTypesSchema = z.array(z.string().trim().min(1).max(100)).max(20)

// Where the garage's pin came from. 'map_pin' is what the onboarding picker
// sends after the owner drags the marker; 'gps' when they tapped "use my
// current location" and did not move it; 'admin' when staff placed it.
export const vendorGeoSourceSchema = z.enum(['gps', 'map_pin', 'admin'])

const vendorProfileFields = {
  whatsapp: phoneSchema.optional(),
  geoSource: vendorGeoSourceSchema.optional(),
  // How far this garage will travel for doorstep work. Separate from
  // pickupRadiusKm, which is pickup-and-drop of the vehicle. Null clears it,
  // and the garage then covers DEFAULT_DOORSTEP_RADIUS_KM (lib/doorstep.ts):
  // Settings says "Leave empty to use 10 km", so emptying the field has to
  // reach the column rather than leave the old number in place.
  doorstepRadiusKm: z.number().positive().max(100).nullable().optional(),
  email: z.string().trim().email().max(255).optional(),
  yearsInOperation: z.string().trim().max(20).optional(),
  mapsUrl: z.string().trim().url().max(2048).optional(),
  pickup: pickupSchema.optional(),
  pickupRadiusKm: z.number().positive().optional(),
  // How many cars the garage can work on at once. The slot list and checkout
  // both read it, so a garage claiming 0 would be a garage nobody can book —
  // 1 is the floor, and 20 is past any single site we have seen.
  bays: z.number().int().min(1).max(20).optional(),
  // The most jobs in one day. Null clears it: no cap beyond the bays.
  jobsPerDay: z.number().int().min(1).max(500).nullable().optional(),
  vehicleTypes: vehicleTypesSchema.optional(),
  // No `notes`. That column is Detlio's internal "Notes (optional)" under
  // Onboarding status, written only through the admin API (admin.validation.ts
  // has its own). Accepting it here let a garage wipe the ops note, or write
  // one that reads as if staff had, on signup or PATCH /vendors/me. Zod drops
  // the unknown key, so an old client that still sends it changes nothing.
}

export const createVendorSchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  phone: phoneSchema,
  address: z.string().trim().min(1),
  city: z.string().trim().min(1).max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be a 6-digit number'),
  // Required, unlike on update. A garage without coordinates cannot be found,
  // cannot be distance-sorted and cannot have its doorstep radius checked — and
  // it is far cheaper to insist at creation than to chase it afterwards.
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  ...vendorProfileFields,
})

export const updateVendorSchema = z
  .object({
    businessName: z.string().trim().min(1).max(255).optional(),
    phone: phoneSchema.optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be a 6-digit number').optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    ...vendorProfileFields,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng must be provided together',
  })

export const updateJobTypesSchema = z
  .object({
    dropinEnabled: z.boolean().optional(),
    doorstepEnabled: z.boolean().optional(),
    // Sent with doorstepEnabled when the owner says how far they go in the
    // same breath (onboarding does), so the two land together. Optional: left
    // out, the garage covers DEFAULT_DOORSTEP_RADIUS_KM (lib/doorstep.ts).
    doorstepRadiusKm: z.number().min(1).max(30).optional(),
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

// ─── Public listing ──────────────────────────────────────────────────────────

export const vendorSortSchema = z.enum([
  'distance',
  'rating',
  'price_asc',
  'price_desc',
  'relevance',
])

/**
 * Viewport rectangle as "minLng,minLat,maxLng,maxLat" — the order PostGIS's
 * ST_MakeEnvelope takes, so it needs no reshuffling downstream.
 *
 * This exists for the map view's "search as I move the map". A viewport is not
 * a radius, and expressing one as the other is what forces an API rewrite later
 * (see plans/geo.md §8), so both shapes are accepted from the start.
 */
export const bboxSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const parts = raw.split(',').map((p) => Number(p.trim()))
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({
        code: 'custom',
        message: 'bbox must be "minLng,minLat,maxLng,maxLat"',
      })
      return z.NEVER
    }

    const [minLng, minLat, maxLng, maxLat] = parts

    if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) {
      ctx.addIssue({ code: 'custom', message: 'bbox is out of range' })
      return z.NEVER
    }

    if (minLat >= maxLat || minLng >= maxLng) {
      ctx.addIssue({ code: 'custom', message: 'bbox min must be below max' })
      return z.NEVER
    }

    return { minLng, minLat, maxLng, maxLat }
  })

/**
 * A doorstep coverage polygon, as a GeoJSON-style outer ring of [lng, lat]
 * pairs. `null` clears it and falls the vendor back to doorstepRadiusKm.
 *
 * Capped at 200 vertices: a drag-drawn area needs a fraction of that, and an
 * uncapped ring is an easy way to make every ST_Covers against this vendor slow
 * for everyone.
 */
export const doorstepAreaSchema = z.object({
  ring: z
    .array(
      z.tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
    )
    // A ring needs at least three distinct corners plus the repeated closing
    // point. Fewer is a line, not an area.
    .min(4)
    .max(200)
    .nullable(),
})

export const listPublicVendorsQuerySchema = z
  .object({
    category: serviceCategorySchema.optional(),
    q: z.string().trim().min(1).optional(),
    bookingType: z.enum(['dropin', 'doorstep']).optional(),
    // Origin. Optional throughout — the list must render for someone who has
    // declined location permission, just without distances.
    lat: z.coerce.number().finite().min(-90).max(90).optional(),
    lng: z.coerce.number().finite().min(-180).max(180).optional(),
    // Drop-in only. Doorstep deliberately ignores this and uses the *vendor's*
    // doorstepRadiusKm instead: the question is "who will come to me", and the
    // garage is the one that decides how far it travels. Left out, the list
    // reaches LIST_RADIUS_KM (lib/discovery.ts), which is also the most a
    // caller may ask for. A typed search (`q`) ignores it: no radius applies.
    radiusKm: z.coerce.number().positive().max(50).optional(),
    bbox: bboxSchema.optional(),
    sort: vendorSortSchema.optional(),
    /**
     * Append garages that have no coordinates yet, after the located ones.
     *
     * Defaults to true. Hiding them is the worse failure while most garages are
     * still unpinned — a geo filter they cannot satisfy would empty the listing
     * for a city full of garages. Pass false when the surface genuinely cannot
     * use them, which today means the map view.
     */
    includeUnlocated: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => (data.lat === undefined) === (data.lng === undefined), {
    message: 'lat and lng must be provided together',
  })
  .refine((data) => !(data.bbox && data.radiusKm), {
    message: 'Pass either bbox or radiusKm, not both',
  })
  .refine((data) => !(data.sort === 'distance' && data.lat === undefined), {
    message: 'sort=distance requires lat and lng',
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

// ─── Holidays and pausing ─────────────────────────────────────────────────────

// A real calendar day, so "2026-02-30" is a 400 rather than an Invalid Date.
// The window (today to a year ahead) is checked in the service, against the
// clock, by closureDateProblem.
export const createClosureSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .refine(isCalendarDate, 'That date does not exist'),
  reason: z.string().trim().max(200).optional(),
})

// The reason is optional and public: the garage page shows it under "Not
// taking bookings right now".
export const pauseBookingsSchema = z.object({
  reason: z.string().trim().max(200).optional(),
})

export type CreateClosureInput = z.infer<typeof createClosureSchema>
export type PauseBookingsInput = z.infer<typeof pauseBookingsSchema>

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
export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
export type SlotsQueryInput = z.infer<typeof slotsQuerySchema>
export type ListPublicVendorsQuery = z.infer<typeof listPublicVendorsQuerySchema>
export type DoorstepAreaInput = z.infer<typeof doorstepAreaSchema>

// The Earnings screen's period toggle. Defaults to the trailing week, which is
// what the screen opens on.
export const earningsQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('week'),
})

export type EarningsQuery = z.infer<typeof earningsQuerySchema>
