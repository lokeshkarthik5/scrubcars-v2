import { ApiError } from '@repo/core/api/client'

/**
 * Turning "Razorpay says paid" into "here is your booking", without ever
 * offering to take the money twice.
 *
 * Once the gateway reports success the customer has paid, whatever happens
 * next. If the confirm call then fails — a dropped connection on a moving
 * train, a cold server — the old screen re-enabled Pay, and a second tap
 * opened a second order for the same booking. This module is the rule for
 * what happens instead: retry the confirm a few times, then watch for the
 * booking the Razorpay webhook writes on its own, and only then hand the
 * customer a calm "we have your payment" with a way to reach us.
 *
 * Pure apart from the calls it is given, and clock-free (the caller passes
 * `sleep` and `now`), so the whole decision tree runs in a unit test without
 * waiting a minute.
 */

/** Backoff before each retry of the confirm call: three retries in all. */
export const VERIFY_RETRY_DELAYS_MS = [1000, 3000, 6000] as const

/** How long to watch for the booking once the confirm call has given up. */
export const POLL_WINDOW_MS = 60_000

/** How often to look while watching. */
export const POLL_INTERVAL_MS = 3000

/** Where a paid checkout ended up. */
export type PaymentOutcome =
  | { kind: 'booked'; bookingId: string }
  /** Money taken, no booking: the server's words, which say it is refunded. */
  | { kind: 'failed'; message: string }
  /** Nobody can say yet. The payment is real; the booking is still coming. */
  | { kind: 'unconfirmed' }

/** What one look at the booking's state found. */
export type PollResult =
  | { kind: 'booked'; bookingId: string }
  | { kind: 'failed'; message: string }
  | { kind: 'pending' }

/**
 * Whether a failed call is worth making again. A network failure or a 5xx is
 * a blip; a 4xx is the server's answer — the signature did not match, the
 * checkout expired — and asking again gets the same answer.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 429
  // fetch rejects with a TypeError when the request never got an answer.
  return error instanceof TypeError
}

/**
 * The 409s that mean the payment landed but cannot stand: no booking could be
 * written for it, or the final bill it paid was replaced while the customer
 * paid. They carry the refund message the customer must see, and are final.
 */
const REFUND_DUE_CODES = new Set(['BOOKING_CONFIRM_FAILED_REFUND_DUE', 'FINAL_BILL_REFUND_DUE'])

export function refundMessage(error: unknown): string | null {
  return error instanceof ApiError && error.code !== undefined && REFUND_DUE_CODES.has(error.code)
    ? error.message
    : null
}

export interface ConfirmPaymentDeps {
  /** The confirm call. Resolves with the booking it created or found. */
  verify: () => Promise<{ bookingId: string }>
  /** One look at whether the booking exists yet. */
  poll: () => Promise<PollResult>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

/**
 * Confirm, retrying blips; then watch for up to a minute; then admit we do not
 * know yet. Never throws: every road ends in an outcome the screen can show.
 */
export async function confirmPayment(deps: ConfirmPaymentDeps): Promise<PaymentOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { bookingId } = await deps.verify()
      return { kind: 'booked', bookingId }
    } catch (error) {
      const refund = refundMessage(error)
      if (refund) return { kind: 'failed', message: refund }

      // Any other refusal, or the retries running out, is not the end: the
      // webhook confirms the same payment on its own, so the booking may
      // still appear. Go and look for it.
      const delay = VERIFY_RETRY_DELAYS_MS[attempt]
      if (!isRetryable(error) || delay === undefined) break
      await deps.sleep(delay)
    }
  }

  const deadline = deps.now() + POLL_WINDOW_MS
  for (;;) {
    try {
      const result = await deps.poll()
      if (result.kind !== 'pending') return result
    } catch (error) {
      // A 4xx here (signed out, not theirs) will not change by asking again.
      if (!isRetryable(error)) return { kind: 'unconfirmed' }
    }

    if (deps.now() + POLL_INTERVAL_MS > deadline) return { kind: 'unconfirmed' }
    await deps.sleep(POLL_INTERVAL_MS)
  }
}

/** Said when a failed checkout comes back without words of its own. */
export const FALLBACK_REFUND_MESSAGE =
  'This payment could not be turned into a booking. A refund is being processed.'

/** One look at a checkout (GET /booking-intents/:id), as confirmPayment reads it. */
export function intentPollResult(intent: {
  status: 'pending' | 'consumed' | 'failed'
  bookingId: string | null
  message: string | null
}): PollResult {
  if (intent.status === 'consumed' && intent.bookingId) {
    return { kind: 'booked', bookingId: intent.bookingId }
  }
  if (intent.status === 'failed') {
    return { kind: 'failed', message: intent.message || FALLBACK_REFUND_MESSAGE }
  }
  return { kind: 'pending' }
}

/**
 * Said when a final bill's payment landed after the garage replaced the bill.
 * The server says the same (FINAL_BILL_REFUND_DUE); this is for a poll that
 * finds it out on its own.
 */
export const FINAL_BILL_REPLACED_MESSAGE =
  'The garage changed this bill while you were paying, so this payment will be refunded. Please check the new bill.'

/** The same, when Detlio cancelled the booking while the customer paid its bill. */
export const FINAL_BILL_CANCELLED_MESSAGE =
  'This booking was cancelled while you were paying, so this payment will be refunded.'

/**
 * One look at a final bill being paid, as confirmPayment reads it: the bill
 * that now stands on the booking. Paid is done; a different bill (or none)
 * standing in its place means the one paid for was replaced — or withdrawn,
 * when the booking was cancelled.
 */
export function finalBillPollResult(
  bookingId: string,
  chargeId: string,
  live: { id: string; status: string } | null,
  bookingStatus?: string
): PollResult {
  if (!live || live.id !== chargeId) {
    return {
      kind: 'failed',
      message:
        bookingStatus === 'cancelled' ? FINAL_BILL_CANCELLED_MESSAGE : FINAL_BILL_REPLACED_MESSAGE,
    }
  }
  if (live.status === 'paid') return { kind: 'booked', bookingId }
  return { kind: 'pending' }
}

/**
 * Why the customer is writing to us, which decides what their pre-filled
 * WhatsApp message asks:
 * - `missing_booking`: paid at checkout, and no booking to show yet.
 * - `not_marked_paid`: paid for a booking they are looking at, which does not
 *   show the payment yet.
 * - `bill_not_marked_paid`: paid a final bill, which does not show as paid yet.
 * - `refund`: paid, the booking could not be made, and we said it is refunded.
 * - `bill_refund`: paid a final bill that could no longer take the payment
 *   (replaced, already paid, or the booking cancelled), and we said it is
 *   refunded. Not `refund`: there is no missing booking to look for.
 */
export type PaymentHelpSituation =
  | 'missing_booking'
  | 'not_marked_paid'
  | 'bill_not_marked_paid'
  | 'refund'
  | 'bill_refund'

/**
 * The message a customer sends us about a payment we could not settle on
 * screen. It says what they are actually seeing — a "hasn't shown up" message
 * sent right after being told about a refund, or from the booking itself,
 * starts the conversation on the wrong foot. The payment id is what lets the
 * team find it in Razorpay at once.
 */
export function paymentHelpMessage(
  paymentId: string,
  situation: PaymentHelpSituation = 'missing_booking'
): string {
  switch (situation) {
    case 'not_marked_paid':
      return `Hi Detlio, I paid for my booking but it doesn't show as paid yet. Payment ID: ${paymentId}`
    case 'bill_not_marked_paid':
      return `Hi Detlio, I paid the final bill for my booking but it doesn't show as paid yet. Payment ID: ${paymentId}`
    case 'refund':
      return `Hi Detlio, my payment couldn't be made into a booking and I was told it will be refunded. Can you tell me about the refund? Payment ID: ${paymentId}`
    case 'bill_refund':
      return `Hi Detlio, I paid the final bill for my booking and was told this payment will be refunded. Can you tell me about the refund? Payment ID: ${paymentId}`
    case 'missing_booking':
      return `Hi Detlio, I paid for a booking but it hasn't shown up yet. Payment ID: ${paymentId}`
  }
}

/** Real timers, for the screens. */
export const realClock = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
}
