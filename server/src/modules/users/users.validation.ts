import { z } from 'zod'

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().email().max(255).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'At least one field must be provided',
  })

export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1),
  city: z.string().trim().min(1).max(100),
  lat: z.number().finite(),
  lng: z.number().finite(),
  isDefault: z.boolean().optional(),
})

export const updateAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export const vehicleTypeSchema = z.enum(['sedan', 'suv', 'hatchback'])

export const createVehicleSchema = z.object({
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(50).optional(),
  licensePlate: z.string().trim().min(1).max(20).optional(),
  vehicleType: vehicleTypeSchema,
  isDefault: z.boolean().optional(),
})

export const updateVehicleSchema = z
  .object({
    make: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    color: z.string().trim().min(1).max(50).nullable().optional(),
    licensePlate: z.string().trim().min(1).max(20).nullable().optional(),
    vehicleType: vehicleTypeSchema.optional(),
    isDefault: z.boolean().optional(),
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
