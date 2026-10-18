// Imported by the E2E helpers too (apps/e2e/support/db.ts), so it must keep
// to node built-ins: nothing that loads env or a database client.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const OTP_LENGTH = 6
export const OTP_EXPIRY_MINUTES = 3
export const MAX_OTP_VERIFY_ATTEMPTS = 3
export const OTP_VERIFY_WINDOW_MINUTES = 5
export const OTP_EXPIRY_SECONDS = OTP_EXPIRY_MINUTES * 60

// Per-phone send limits. Each code is an SMS someone pays for and a message on
// a real person's phone, and the per-IP limiter alone lets one caller hand a
// single number a code every few seconds from a pool of addresses.
//
// 30 seconds is the shortest gap a person waiting for an SMS needs; the verify
// screen offers Resend at the same moment, so a customer never meets this
// refusal by tapping what the app offers. Five an hour is more than a real
// login takes, even with a slow network and a typo or two.
export const OTP_RESEND_COOLDOWN_SECONDS = 30
export const OTP_MAX_SENDS_PER_HOUR = 5
export const OTP_SEND_WINDOW_SECONDS = 60 * 60

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0')
}

/**
 * Login codes are kept as a keyed hash, never as the code itself, so a copy of
 * the table (a backup, a support query, a leaked read replica) hands nobody a
 * way into an account.
 *
 * The digest is bound to the phone and the purpose, so a row cannot be copied
 * onto another number or reused for another flow. It is cut to fit the
 * existing `otp_code` varchar(10): ten base64url characters are 60 bits,
 * plenty when the key is secret and a code gets three guesses (see
 * MAX_OTP_VERIFY_ATTEMPTS) and three minutes.
 */
export const OTP_DIGEST_LENGTH = 10

/**
 * The hashing key, derived from the JWT secret under its own label rather than
 * reusing it raw, so a digest can never double as anything the session tokens
 * accept. Changing the label (or the JWT secret) only voids codes in flight.
 */
export function deriveOtpKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('otp-v1').digest()
}

/** What `otp_code` holds for `code`, sent to `phone` for `purpose`. */
export function otpDigest(key: Buffer, code: string, phone: string, purpose: string): string {
  // The code goes last: phone and purpose never contain ':', so no two
  // different (purpose, phone, code) triples can make the same message.
  return createHmac('sha256', key)
    .update(`${purpose}:${phone}:${code}`)
    .digest('base64url')
    .slice(0, OTP_DIGEST_LENGTH)
}

/**
 * A row written before codes were hashed: the plain six digits. A digest is
 * always OTP_DIGEST_LENGTH (10) characters, so the two cannot be confused.
 *
 * Transitional — such a row lives three minutes and is purged within a day, so
 * this (and its branch in otpMatches) can go in any release after the one
 * that started hashing.
 */
export function isPlainOtpRow(stored: string): boolean {
  return stored.length === OTP_LENGTH && /^\d+$/.test(stored)
}

/** Whether `given` is the code a row was written for. Constant time. */
export function otpMatches(
  key: Buffer,
  stored: string,
  given: string,
  phone: string,
  purpose: string
): boolean {
  const expected = Buffer.from(stored)
  const actual = Buffer.from(isPlainOtpRow(stored) ? given : otpDigest(key, given, phone, purpose))
  // Lengths are not secret (a digest is always ten characters, a plain code
  // six), and timingSafeEqual throws on a mismatch.
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// Old codes are deleted a day after they expire, a few at a time, whenever a
// new one is sent (see authService.sendOtp). A day is well past every window
// that counts them — the send limit's hour, the verify window's five minutes —
// so a purge never changes a rate-limit answer.
export const OTP_RETENTION_HOURS = 24
// Bounds each send's share of the work: the first send after a deploy may
// find months of rows, and nobody's login should wait for all of them.
export const OTP_PURGE_BATCH = 500

/** Rows whose code expired before this may be deleted. */
export function getOtpPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - OTP_RETENTION_HOURS * 60 * 60 * 1000)
}

export function getOtpExpiryDate(): Date {
  return new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000)
}

export function getOtpVerifyWindowStart(): Date {
  return new Date(Date.now() - OTP_VERIFY_WINDOW_MINUTES * 60 * 1000)
}

/** The start of the rolling hour the send limit counts over. */
export function getOtpSendWindowStart(now: Date): Date {
  return new Date(now.getTime() - OTP_SEND_WINDOW_SECONDS * 1000)
}

export type OtpSendRefusal = {
  reason: 'cooldown' | 'hourly'
  retryAfterSeconds: number
}

/**
 * Whether another code may be sent to a phone now, given when the codes in
 * the last hour went out. Null means yes.
 *
 * `sentAt` may arrive in any order and may include sends older than the hour;
 * both are handled here so the query stays a plain "since" read. When both
 * limits apply, the later of the two moments is the one that matters, since
 * that is the earliest a send can actually succeed.
 */
export function checkOtpSendLimit(sentAt: Date[], now: Date): OtpSendRefusal | null {
  const nowMs = now.getTime()
  const windowStart = nowMs - OTP_SEND_WINDOW_SECONDS * 1000
  const recent = sentAt
    .map((d) => d.getTime())
    .filter((t) => t > windowStart && t <= nowMs)
    .sort((a, b) => a - b)

  if (recent.length === 0) return null

  let refusal: OtpSendRefusal | null = null

  const latest = recent[recent.length - 1]
  const cooldownEnds = latest + OTP_RESEND_COOLDOWN_SECONDS * 1000
  if (cooldownEnds > nowMs) {
    refusal = { reason: 'cooldown', retryAfterSeconds: secondsUntil(cooldownEnds, nowMs) }
  }

  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    // The oldest send that has to age out of the window before the count drops
    // below the limit again.
    const freeing = recent[recent.length - OTP_MAX_SENDS_PER_HOUR]
    const hourlyEnds = freeing + OTP_SEND_WINDOW_SECONDS * 1000
    if (!refusal || hourlyEnds > nowMs + refusal.retryAfterSeconds * 1000) {
      refusal = { reason: 'hourly', retryAfterSeconds: secondsUntil(hourlyEnds, nowMs) }
    }
  }

  return refusal
}

function secondsUntil(at: number, now: number): number {
  return Math.max(1, Math.ceil((at - now) / 1000))
}

/**
 * The refusal in words. Seconds under a minute — the 30-second case — because
 * "1 minute" for a wait of 12 seconds sends people away for longer than they
 * need; minutes, rounded up, for the hourly one.
 */
export function otpSendLimitMessage(retryAfterSeconds: number): string {
  const wait =
    retryAfterSeconds < 60
      ? `${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}`
      : `${Math.ceil(retryAfterSeconds / 60)} minute${Math.ceil(retryAfterSeconds / 60) === 1 ? '' : 's'}`
  return `Too many codes requested for this number. Try again in ${wait}.`
}

/**
 * How high one code's attempts counter may go, given the failed attempts the
 * verify window holds on this phone's other codes.
 *
 * The window rule is "MAX_OTP_VERIFY_ATTEMPTS wrong guesses per phone and
 * purpose per window", but only the latest code can be guessed at, so the
 * window's other codes are history: their attempts are fixed. That leaves this
 * code `MAX - others` attempts, and capping its counter there inside one
 * UPDATE makes the rule hold even for guesses sent in parallel.
 *
 * `otherAttempts` must leave this code out. Read as "window total minus this
 * code's counter", it is two reads of a row that parallel guesses are
 * changing, and each guess that lands between them raises the cap by one.
 */
export function otpAttemptCap(otherAttempts: number): number {
  return Math.max(0, MAX_OTP_VERIFY_ATTEMPTS - otherAttempts)
}
