import { randomInt } from 'node:crypto'

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
