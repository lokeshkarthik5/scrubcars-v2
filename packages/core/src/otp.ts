import { ApiError } from '@repo/core/api/client'
import { SUPPORT_PHONE_DISPLAY } from '@repo/core/support'

/**
 * The login code's two clocks, as the verify screen shows them.
 *
 * They are different clocks on purpose. The code expires when the server says
 * (expiresInSeconds on the send, 3 minutes today) and the screen counts that
 * down; Resend opens after 30 seconds, the server's per-phone cooldown, so a
 * customer whose SMS never came can ask again long before the first code would
 * have lapsed. Locking Resend until expiry, as it used to, kept them waiting
 * on a code that was never coming.
 */

/** Matches OTP_RESEND_COOLDOWN_SECONDS on the server. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30

/** Used only if a send response somehow carries no expiry. */
export const OTP_FALLBACK_EXPIRY_SECONDS = 180

/** Whole seconds from `now` until `at`, never below zero. */
export function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000))
}

/** "2:58", "0:05", "41:20". */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * The epoch-ms moments a send fixes: when its code expires and when another
 * may be asked for. Stored as moments rather than counters so a reload, or a
 * phone that slept, still reads the right time.
 */
export function otpDeadlines(
  sentAt: number,
  expiresInSeconds: number | undefined
): { expiresAt: number; resendAt: number } {
  const expiry =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0
      ? expiresInSeconds
      : OTP_FALLBACK_EXPIRY_SECONDS
  return {
    expiresAt: sentAt + expiry * 1000,
    resendAt: sentAt + OTP_RESEND_COOLDOWN_SECONDS * 1000,
  }
}

/**
 * What a failed send or verify says to the customer.
 *
 * The SMS provider failing is the one case where the server's words are not
 * enough: the customer can do nothing about it, so they are told how to
 * reach a person instead. Everything else the server already words for them.
 */
export function otpErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'SMS_SEND_FAILED') {
      return `We couldn't send the code right now. Try again in a minute, or WhatsApp us on ${SUPPORT_PHONE_DISPLAY}.`
    }
    return error.message
  }
  // fetch throws a TypeError when the request never reached the server.
  if (error instanceof TypeError) return 'Check your connection and try again.'
  return fallback
}

/**
 * When a number refused by the per-phone send limit may ask again, as an
 * epoch-ms moment, or null for any other refusal.
 */
export function retryAt(error: unknown, now: number): number | null {
  if (
    error instanceof ApiError &&
    error.code === 'OTP_RATE_LIMITED' &&
    typeof error.retryAfterSeconds === 'number'
  ) {
    return now + error.retryAfterSeconds * 1000
  }
  return null
}
