import { createHmac, randomUUID } from 'node:crypto'
import { AppError } from './errors.js'
import { env } from './env.js'

type RazorpayOrder = {
  id: string
  amount: number
  currency: string
  receipt: string
  status: string
}

/**
 * Prefix marking an order this server minted itself under E2E_FAKE_PAYMENTS.
 *
 * It is what keeps the test bypass narrow: verifyPaymentSignature waives the
 * HMAC for these ids and only these ids, so a real Razorpay order id can never
 * take the fake path even with the flag on.
 */
const FAKE_ORDER_PREFIX = 'order_e2e_'

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
  // What is being paid for. `bookingId` alone is the legacy path (an unpaid
  // booking that already exists); `intentId` is the current one, where the
  // booking is only written once this order is captured; `chargeId` (with its
  // `bookingId`) is a final bill paid after the job. All are echoed into
  // `notes` so the webhook can resolve any kind without depending on which
  // flow opened the checkout — and it checks `charge_id` first, because a
  // bill's order carries its booking's id too.
  bookingId?: string
  intentId?: string
  chargeId?: string
}) {
  const { keyId, keySecret } = getCredentials()
  const amount = toPaise(input.amount)

  // Tests stand in for the gateway rather than reaching it. The amount is
  // still computed by the real toPaise, so the value the checkout sheet shows
  // and the value asserted in the database are the ones production would use.
  if (env.e2eFakePayments) {
    return {
      orderId: `${FAKE_ORDER_PREFIX}${randomUUID()}`,
      amount,
      currency: 'INR',
      keyId,
    }
  }

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
        ...(input.chargeId ? { charge_id: input.chargeId } : {}),
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

/**
 * The public key id the checkout sheet opens with. For handing an order that
 * already exists back to the app (a final bill's order is reused rather than
 * opened again), where there is no fresh createRazorpayOrder result to read it
 * from.
 */
export function razorpayKeyId(): string {
  return getCredentials().keyId
}

export function verifyPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
}) {
  const { keySecret } = getCredentials()

  // Only orders this server minted under the flag skip the check. Anything
  // else — including a real order id while the flag happens to be on — still
  // has to produce a matching HMAC.
  if (env.e2eFakePayments && input.orderId.startsWith(FAKE_ORDER_PREFIX)) {
    return true
  }

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
