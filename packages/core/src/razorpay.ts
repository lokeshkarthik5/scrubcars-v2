import type { PaymentOrder } from './api/payments'

export interface RazorpaySuccessResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayCheckoutOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  theme?: {
    color?: string
  }
  handler: (response: RazorpaySuccessResponse) => void
  modal?: {
    ondismiss?: () => void
  }
}

interface RazorpayInstance {
  open: () => void
  on: (event: 'payment.failed', handler: (response: { error: { description: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance
  }
}

let scriptPromise: Promise<void> | null = null

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay is only available in the browser'))
  }

  if (window.Razorpay) {
    return Promise.resolve()
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Razorpay checkout'))
      document.body.appendChild(script)
    })
  }

  return scriptPromise
}

/**
 * A checkout outcome the sheet has already told the customer about.
 *
 * `openRazorpayCheckout` rejects for two reasons that are not faults the caller
 * needs to report: the customer closed the sheet, and the gateway declined the
 * card. Both are surfaced at the point they happen — the first through
 * `onDismiss`, the second through `onFailure` — so a caller that also toasts
 * its catch shows the same message twice. Callers should skip reporting these.
 */
export class RazorpayReportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RazorpayReportedError'
  }
}

export interface OpenRazorpayCheckoutInput {
  // Only the gateway fields matter here, so this accepts both a booking order
  // and a booking-intent order rather than naming one of them.
  order: Pick<PaymentOrder, 'orderId' | 'amount' | 'currency' | 'keyId'>
  description: string
  customer?: {
    name?: string
    email?: string
    phone?: string
  }
  onSuccess: (response: RazorpaySuccessResponse) => void | Promise<void>
  onDismiss?: () => void
  onFailure?: (message: string) => void
}

export async function openRazorpayCheckout(
  input: OpenRazorpayCheckoutInput
): Promise<void> {
  await loadRazorpayScript()

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is unavailable')
  }

  const key = input.order.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID

  if (!key) {
    throw new Error('Razorpay key is not configured')
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key,
      amount: input.order.amount,
      currency: input.order.currency,
      name: 'Detlio',
      description: input.description,
      order_id: input.order.orderId,
      prefill: {
        name: input.customer?.name,
        email: input.customer?.email,
        contact: input.customer?.phone,
      },
      theme: {
        color: '#E11D2E',
      },
      handler: async (response) => {
        try {
          await input.onSuccess(response)
          resolve()
        } catch (error) {
          reject(error)
        }
      },
      modal: {
        ondismiss: () => {
          input.onDismiss?.()
          reject(new RazorpayReportedError('Payment cancelled'))
        },
      },
    })

    rzp.on('payment.failed', (response) => {
      const message = response.error?.description ?? 'Payment failed'
      input.onFailure?.(message)
      reject(new RazorpayReportedError(message))
    })

    rzp.open()
  })
}
