import { createHmac, randomUUID } from 'node:crypto'
import { AppError } from './errors.js'
import { env } from './env.js'
import { classifyModeLookup, gatewayModeForKey, isLookupId } from './gateway-mode.js'

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

/**
 * The Razorpay mode an order opened now is in, for gateway_mode (0032): an
 * order this server mints under E2E_FAKE_PAYMENTS is 'fake'; otherwise the
 * key id says it, rzp_live_… being live and anything else test. Recorded on
 * every row money can land in, so telling test money from real money later
 * (the test-data reset) needs no call to Razorpay. Never branch payment
 * logic on it. The rule itself is gatewayModeForKey (lib/gateway-mode.ts).
 */
export function gatewayModeFor(keyId: string | undefined): 'live' | 'test' | 'fake' {
  return gatewayModeForKey(keyId, env.e2eFakePayments)
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
      gatewayMode: gatewayModeFor(keyId),
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
    gatewayMode: gatewayModeFor(keyId),
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

/** What Razorpay said about a payment or order id; see lookupRazorpayMode. */
export type RazorpayModeLookup = 'live' | 'test' | 'unknown'

/**
 * Asks Razorpay which mode an old payment or order was in, for a row from
 * before gateway_mode was recorded. Used only by the test-data reset's dry
 * run, and only for rows with no gateway_mode.
 *
 * Only the asking is here. What the answer means (an id live keys can't
 * find is test money; anything in doubt is 'unknown', and unknown keeps the
 * booking) is classifyModeLookup in lib/gateway-mode.ts, where it is tested.
 *
 * Never reaches Razorpay under E2E_FAKE_PAYMENTS or without keys.
 */
export async function lookupRazorpayMode(id: string, timeoutMs: number): Promise<RazorpayModeLookup> {
  if (env.e2eFakePayments || !env.razorpayKeyId || !env.razorpayKeySecret) return 'unknown'
  if (!isLookupId(id) || timeoutMs <= 0) return 'unknown'

  const liveKeys = env.razorpayKeyId.startsWith('rzp_live_')
  const path = id.startsWith('pay_') ? 'payments' : 'orders'

  try {
    const response = await fetch(`https://api.razorpay.com/v1/${path}/${id}`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: basicAuthHeader(env.razorpayKeyId, env.razorpayKeySecret) },
    })
    // The body is only read for the error's description; a success says
    // all it needs to by its status.
    const body = response.ok
      ? null
      : ((await response.json().catch(() => null)) as { error?: { description?: string } } | null)
    return classifyModeLookup({
      liveKeys,
      answer: {
        ok: response.ok,
        status: response.status,
        description: body?.error?.description ?? null,
      },
    })
  } catch {
    return classifyModeLookup({ liveKeys, answer: null })
  }
}

/** Which keys the server holds, for the reset page to say what a check can tell. */
export function razorpayKeyMode(): 'live' | 'test' | 'fake' | 'none' {
  if (env.e2eFakePayments) return 'fake'
  if (!env.razorpayKeyId || !env.razorpayKeySecret) return 'none'
  return env.razorpayKeyId.startsWith('rzp_live_') ? 'live' : 'test'
}
