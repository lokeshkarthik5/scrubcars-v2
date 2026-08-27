import { z } from 'zod'

export const bookingIdParamSchema = z.object({
  bookingId: z.uuid(),
})

export const createOrderSchema = bookingIdParamSchema

const razorpayResultSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

// Two things can be paid for. `intentId` is the current flow, where the booking
// does not exist yet and this call is what creates it. `bookingId` is the
// legacy one — an unpaid booking from before this change, or any booking whose
// payment failed — settled from the "Pay Now" button on booking details.
export const verifyPaymentSchema = z.union([
  razorpayResultSchema.extend({ intentId: z.uuid() }),
  razorpayResultSchema.extend({ bookingId: z.uuid() }),
])

export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>
