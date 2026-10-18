/**
 * Telling test money from real money (gateway_mode, 0032), as pure rules.
 *
 * lib/razorpay.ts holds the network side: it opens orders and asks Razorpay
 * about old ids. The decisions it makes with what it gets back live here, so
 * each one has a test that needs no environment and no network. They are the
 * rules "Real money is never deleted" rests on (the test-data reset, see
 * lib/data-reset.ts), so a wrong answer here could make a live payment
 * deletable: every doubt answers 'unknown', which keeps it.
 */

export type GatewayModeValue = 'live' | 'test' | 'fake'

/** What Razorpay said about a payment or order id, when it was asked. */
export type ModeLookup = 'live' | 'test' | 'unknown'

/**
 * The mode an order opened now is in: an order the server mints itself
 * under E2E_FAKE_PAYMENTS is 'fake'; otherwise the key id says it,
 * rzp_live_… being live and anything else test.
 */
export function gatewayModeForKey(
  keyId: string | undefined,
  fakePayments: boolean
): GatewayModeValue {
  if (fakePayments) return 'fake'
  return keyId?.startsWith('rzp_live_') ? 'live' : 'test'
}

/** A Razorpay payment or order id, and nothing that could change the path. */
const LOOKUP_ID = /^(pay|order)_[A-Za-z0-9]{1,40}$/

export function isLookupId(id: string): boolean {
  return LOOKUP_ID.test(id)
}

/**
 * What Razorpay's answer to GET /v1/payments/:id (or /v1/orders/:id) says
 * about the id's mode. `answer` is null when there was no answer at all (a
 * network error, a timeout).
 *
 * Razorpay keeps test and live data apart, and each key pair sees only its
 * own. So with live keys, an id Razorpay knows is live money and an id it
 * says does not exist is test money; with test keys, only "known" can be
 * trusted (test money), because a live id is invisible to them too.
 * "Does not exist" comes back as a 400 (sometimes a 404) with that
 * description. Anything else (a refusal of the keys, a rate limit, a 5xx,
 * no answer) says nothing about the payment and is 'unknown'.
 */
export function classifyModeLookup(input: {
  liveKeys: boolean
  answer: { ok: boolean; status: number; description: string | null } | null
}): ModeLookup {
  const { liveKeys, answer } = input
  if (!answer) return 'unknown'
  if (answer.ok) return liveKeys ? 'live' : 'test'
  if (answer.status === 400 || answer.status === 404) {
    const missing = /does not exist|not found/i.test(answer.description ?? '')
    if (missing) return liveKeys ? 'test' : 'unknown'
  }
  return 'unknown'
}
