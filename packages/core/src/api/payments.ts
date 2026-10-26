import { apiClient } from './client'
import type { BookingType, PaymentMethod } from '@repo/core/types'

export interface PaymentOrder {
  bookingId: string
  orderId: string
  amount: number
  currency: string
  keyId: string
}

/**
 * What POST /booking-intents answers. With Detlio credit (0049) covering the
 * whole booking there is no Razorpay order: `paidWithCredit` is true, the
 * booking already exists (`bookingId`), and `orderId`/`keyId` are null.
 * Otherwise `amount` (paise) is what Razorpay takes, after any credit.
 */
export interface BookingIntentOrder {
  intentId: string
  orderId: string | null
  amount: number
  currency: string
  keyId: string | null
  /** The Detlio credit this checkout uses, as a decimal string ("0.00" when none). */
  creditAmount?: string
  paidWithCredit?: boolean
  bookingId?: string | null
}

// Mirrors the old CreateBookingPayload — the server prices an intent from the
// same body it used to create a booking from.
export interface CreateBookingIntentPayload {
  vendorId: string
  serviceIds: string[]
  vehicleId: string
  bookingType: BookingType
  scheduledAt: string
  paymentMethod: PaymentMethod
  /**
   * Required for doorstep, ignored for drop-in. The server snapshots the saved
   * address onto the booking and checks it against the garage's travel radius,
   * so this is an id rather than a typed-in address.
   */
  addressId?: string
  /** Promo code, if the customer applied one. The server re-resolves it. */
  discountCode?: string
  /**
   * Pay with the customer's Detlio credit first, after any promo (0049).
   * The server decides how much; ignored while gifts are off.
   */
  useCredit?: boolean
}

interface RazorpayResult {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

// Either an intent (the booking does not exist yet — verifying is what creates
// it) or an existing unpaid booking settled from booking details.
/**
 * Sent with a payment confirmation only when the customer has accepted
 * marketing cookies (the consent banner). The API then also reports the
 * paid booking to Meta from the server (Conversions API, META_CAPI_TOKEN),
 * under the same event id the browser's Pixel used, so Meta counts it once.
 * Never carries a name, phone or address. An older API ignores it.
 */
export interface MarketingConsentContext {
  consent: true
  /** Meta's _fbp cookie, when set. */
  fbp?: string
  /** Meta's _fbc cookie (a click from Facebook or Instagram), when set. */
  fbc?: string
  /** The page the payment was made on: origin + path, never a query string. */
  eventSourceUrl?: string
}

/** The Purchase event id the Pixel and the Conversions API share for one booking. */
export function purchaseEventId(bookingId: string): string {
  return `purchase-${bookingId}`
}

export type VerifyPaymentPayload = (
  | (RazorpayResult & { intentId: string })
  | (RazorpayResult & { bookingId: string })
) & { marketing?: MarketingConsentContext }

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

/** Where a checkout stands after payment. Mirrors GET /booking-intents/:id. */
export interface BookingIntentStatus {
  status: 'pending' | 'consumed' | 'failed'
  /** Set once the payment has become a booking. */
  bookingId: string | null
  /** Set when the payment landed but no booking could be written. */
  failureReason: string | null
  /** The customer-facing words for that failure, which promise the refund. */
  message: string | null
}

/**
 * GET /booking-intents/:id
 *
 * Polled after a payment whose confirm call never came back: the Razorpay
 * webhook confirms the same payment on its own, and this is how checkout
 * learns that it has.
 */
export async function getBookingIntentStatus(
  intentId: string
): Promise<BookingIntentStatus> {
  return apiClient<BookingIntentStatus>(`/booking-intents/${intentId}`)
}
