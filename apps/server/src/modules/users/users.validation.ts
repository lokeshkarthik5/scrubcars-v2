import { z } from 'zod'

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().email().max(255).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'At least one field must be provided',
  })

// Where a saved coordinate came from. Customers only ever produce these two:
// 'gps' from the browser's location, 'map_pin' from dragging the marker.
// 'unset' is implied by omitting lat/lng entirely.
export const customerGeoSourceSchema = z.enum(['gps', 'map_pin'])

// Coordinates are optional and all-or-nothing. Optional because an address with
// text but no pin is usable for a drop-in booking, and the customer is prompted
// for a pin at the point it actually matters (picking it for doorstep).
// All-or-nothing because a half-set pair is never anything but a bug.
const coordinates = {
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  geoSource: customerGeoSourceSchema.optional(),
}

function bothOrNeither(data: { lat?: number; lng?: number }) {
  return (data.lat === undefined) === (data.lng === undefined)
}

const COORDINATE_PAIR_MESSAGE = 'lat and lng must be provided together'

export const createAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1),
    city: z.string().trim().min(1).max(100),
    ...coordinates,
    isDefault: z.boolean().optional(),
  })
  .refine(bothOrNeither, { message: COORDINATE_PAIR_MESSAGE })

export const updateAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    ...coordinates,
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine(bothOrNeither, { message: COORDINATE_PAIR_MESSAGE })

export const vehicleTypeSchema = z.enum(['sedan', 'suv', 'hatchback'])

export const createVehicleSchema = z.object({
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(50).optional(),
  licensePlate: z.string().trim().min(1).max(20).optional(),
  vehicleType: vehicleTypeSchema,
  isDefault: z.boolean().optional(),
})

// How often the customer wants this car washed, for the wash bar on Home.
// Only the five intervals the app offers (lib/wash-status.ts); null goes back
// to the default (14 days, 10 in October to December).
export const washIntervalDaysSchema = z.union([
  z.literal(7),
  z.literal(10),
  z.literal(14),
  z.literal(21),
  z.literal(30),
])

export const updateVehicleSchema = z
  .object({
    make: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    color: z.string().trim().min(1).max(50).nullable().optional(),
    licensePlate: z.string().trim().min(1).max(20).nullable().optional(),
    vehicleType: vehicleTypeSchema.optional(),
    isDefault: z.boolean().optional(),
    washIntervalDays: washIntervalDaysSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export const resourceIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const avatarUploadUrlSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

export const setAvatarSchema = z.object({
  url: z.string().url().max(2048),
})

export type AvatarUploadUrlInput = z.infer<typeof avatarUploadUrlSchema>
export type SetAvatarInput = z.infer<typeof setAvatarSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type CreateAddressInput = z.infer<typeof createAddressSchema>
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>
