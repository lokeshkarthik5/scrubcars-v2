import { apiClient } from './client'

export interface PaymentOrder {
  bookingId: string
  orderId: string
  amount: number
  currency: string
  keyId: string
}

export interface VerifyPaymentPayload {
  bookingId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

/** POST /payments/orders */
export async function createPaymentOrder(
  bookingId: string
): Promise<PaymentOrder> {
  return apiClient<PaymentOrder>('/payments/orders', {
    method: 'POST',
    body: JSON.stringify({ bookingId }),
  })
}

/** POST /payments/verify */
export async function verifyPayment(
  payload: VerifyPaymentPayload
): Promise<{ bookingId: string; payment: { status: string } }> {
  return apiClient('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
