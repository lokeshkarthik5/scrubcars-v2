import { createHmac } from 'node:crypto'
import { AppError } from './errors.js'
import { env } from './env.js'

type RazorpayOrder = {
  id: string
  amount: number
  currency: string
  receipt: string
  status: string
}

function getCredentials() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new AppError(
      503,
      'Razorpay is not configured',
      'RAZORPAY_NOT_CONFIGURED'
    )
  }

  return {
    keyId: env.razorpayKeyId,
    keySecret: env.razorpayKeySecret,
  }
}

function basicAuthHeader(keyId: string, keySecret: string) {
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  return `Basic ${token}`
}

export function toPaise(amount: string | number) {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount

  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError(400, 'Invalid payment amount', 'INVALID_AMOUNT')
  }

  return Math.round(value * 100)
}

export async function createRazorpayOrder(input: {
  amount: string
  receipt: string
  // Exactly one of these identifies what is being paid for. `bookingId` is the
  // legacy path (an unpaid booking that already exists); `intentId` is the
  // current one, where the booking is only written once this order is captured.
  // Both are echoed into `notes` so the webhook can resolve either kind without
  // depending on which flow opened the checkout.
  bookingId?: string
  intentId?: string
}) {
  const { keyId, keySecret } = getCredentials()
  const amount = toPaise(input.amount)

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: basicAuthHeader(keyId, keySecret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'INR',
      receipt: input.receipt,
      notes: {
        ...(input.bookingId ? { booking_id: input.bookingId } : {}),
        ...(input.intentId ? { intent_id: input.intentId } : {}),
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('Razorpay order creation failed:', errorBody)
    throw new AppError(
      502,
      'Failed to create Razorpay order',
      'RAZORPAY_ORDER_FAILED'
    )
  }

  const order = (await response.json()) as RazorpayOrder

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,
  }
}

export function verifyPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
}) {
  const { keySecret } = getCredentials()
  const payload = `${input.orderId}|${input.paymentId}`
  const expected = createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex')

  return expected === input.signature
}

export function verifyWebhookSignature(body: string, signature: string | undefined) {
  if (!env.razorpayWebhookSecret) {
    if (env.isDev) {
      return true
    }

    throw new AppError(
      503,
      'Razorpay webhook secret is not configured',
      'RAZORPAY_WEBHOOK_NOT_CONFIGURED'
    )
  }

  if (!signature) {
    return false
  }

  const expected = createHmac('sha256', env.razorpayWebhookSecret)
    .update(body)
    .digest('hex')

  return expected === signature
}
