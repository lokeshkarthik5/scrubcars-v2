import { z } from 'zod'

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(5000).nullable().optional(),
})

export const vendorIdParamSchema = z.object({
  vendorId: z.string().uuid(),
})

export type CreateReviewInput = z.infer<typeof createReviewSchema>
