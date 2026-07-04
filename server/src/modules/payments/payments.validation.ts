import { z } from 'zod'

export const bookingIdParamSchema = z.object({
  bookingId: z.uuid(),
})

export const createOrderSchema = bookingIdParamSchema

export const verifyPaymentSchema = z.object({
  bookingId: z.uuid(),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>
