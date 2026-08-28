import { z } from 'zod'

// Member management writes only the two vendor-scoped roles. `super_admin` and
// `user` are not representable here — the endpoint refuses them and the CHECK
// constraint would refuse them again, so a garage-facing route can never mint a
// platform grant.
export const vendorScopedRoleSchema = z.enum([
  'vendor_admin',
  'vendor_operator',
])

export const addMemberSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Phone must be 10 digits'),
  // Only used when the phone has no account yet, to name the stub row.
  name: z.string().trim().min(1).max(255).optional(),
  role: vendorScopedRoleSchema,
})

export const updateMemberSchema = z
  .object({
    role: vendorScopedRoleSchema.optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: 'Provide a role or a status to change',
  })

export const memberIdParamSchema = z.object({ id: z.string().uuid() })

export const transferOwnershipSchema = z.object({
  /** The member who becomes the owner. Must already be in the company. */
  userId: z.string().uuid(),
})

export type AddMemberInput = z.infer<typeof addMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>
