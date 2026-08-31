import { apiClient } from './client'
import type { BookingType, PaymentMethod } from '@repo/core/types'

export interface PaymentOrder {
  bookingId: string
  orderId: string
  amount: number
  currency: string
  keyId: string
}

export interface BookingIntentOrder {
  intentId: string
  orderId: string
  amount: number
  currency: string
  keyId: string
}

// Mirrors the old CreateBookingPayload — the server prices an intent from the
// same body it used to create a booking from.
export interface CreateBookingIntentPayload {
  vendorId: string
  serviceId: string
  vehicleId: string
  bookingType: BookingType
  scheduledAt: string
  paymentMethod: PaymentMethod
  /** Promo code, if the customer applied one. The server re-resolves it. */
  discountCode?: string
}

interface RazorpayResult {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

// Either an intent (the booking does not exist yet — verifying is what creates
// it) or an existing unpaid booking settled from booking details.
export type VerifyPaymentPayload =
  | (RazorpayResult & { intentId: string })
  | (RazorpayResult & { bookingId: string })

/** POST /payments/orders */
export async function createPaymentOrder(
  bookingId: string
): Promise<PaymentOrder> {
  return apiClient<PaymentOrder>('/payments/orders', {
    method: 'POST',
    body: JSON.stringify({ bookingId }),
  })
}

/**
 * POST /booking-intents
 *
 * Prices the booking and opens a Razorpay order against it *without* creating
 * the booking — closing the checkout sheet then leaves nothing behind. The
 * booking is written by verifyPayment (or by the Razorpay webhook, if this
 * client never gets to call it).
 */
export async function createBookingIntent(
  payload: CreateBookingIntentPayload
): Promise<BookingIntentOrder> {
  return apiClient<BookingIntentOrder>('/booking-intents', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** POST /payments/verify */
export async function verifyPayment(
  payload: VerifyPaymentPayload
): Promise<{ bookingId: string; payment: { status: string } | null }> {
  return apiClient('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
