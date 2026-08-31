import { apiClient } from './client'

export interface AppliedDiscount {
  code: string
  /** Rupees off, as a decimal string. */
  discountAmount: string
  /** Pre-discount price, as a decimal string. */
  subtotal: string
  /** What the customer will pay, as a decimal string. */
  finalAmount: string
}

/**
 * POST /discounts/validate — a preview only.
 *
 * The server recomputes the subtotal from the service and vehicle, so nothing
 * here is trusted at payment time: `POST /bookings` resolves the code again and
 * that result is the one that binds. Throws an ApiError whose message is the
 * customer-facing reason ("This code has expired.").
 */
export async function validateDiscount(input: {
  code: string
  vendorId: string
  serviceId: string
  vehicleId: string
}): Promise<AppliedDiscount> {
  return apiClient<AppliedDiscount>('/discounts/validate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
