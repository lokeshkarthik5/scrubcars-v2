import { describe, expect, test } from 'bun:test'
import {
  checkOtpSendLimit,
  MAX_OTP_VERIFY_ATTEMPTS,
  otpAttemptCap,
  otpSendLimitMessage,
} from './otp.js'

const now = new Date('2026-10-04T10:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)

describe('checkOtpSendLimit', () => {
  test('a phone with no recent codes may be sent one', () => {
    expect(checkOtpSendLimit([], now)).toBeNull()
  })

  test('a second code inside 30 seconds is refused until the 30 seconds are up', () => {
    expect(checkOtpSendLimit([ago(10)], now)).toEqual({ reason: 'cooldown', retryAfterSeconds: 20 })
  })

  test('a code at exactly 30 seconds is allowed', () => {
    expect(checkOtpSendLimit([ago(30)], now)).toBeNull()
  })

  test('a part second still waits a whole one', () => {
    expect(checkOtpSendLimit([new Date(now.getTime() - 29_500)], now)).toEqual({
      reason: 'cooldown',
      retryAfterSeconds: 1,
    })
  })

  test('four codes in the hour leave room for a fifth', () => {
    expect(checkOtpSendLimit([ago(3000), ago(2000), ago(1000), ago(60)], now)).toBeNull()
  })

  test('the sixth in an hour waits for the oldest of the last five to age out', () => {
    const sent = [ago(3000), ago(2000), ago(1000), ago(500), ago(60)]
    // The send 3000 s ago leaves the window 600 s from now.
    expect(checkOtpSendLimit(sent, now)).toEqual({ reason: 'hourly', retryAfterSeconds: 600 })
  })

  test('codes older than the hour do not count', () => {
    const sent = [ago(7200), ago(3700), ago(3000), ago(2000), ago(1000)]
    expect(checkOtpSendLimit(sent, now)).toBeNull()
  })

  test('order does not matter', () => {
    const sent = [ago(60), ago(3000), ago(500), ago(2000), ago(1000)]
    expect(checkOtpSendLimit(sent, now)).toEqual({ reason: 'hourly', retryAfterSeconds: 600 })
  })

  test('when both limits apply, the later moment wins', () => {
    const sent = [ago(3590), ago(2000), ago(1000), ago(500), ago(5)]
    // Cooldown ends in 25 s, the hourly limit in 10 s: 25 s is when a send works.
    expect(checkOtpSendLimit(sent, now)).toEqual({ reason: 'cooldown', retryAfterSeconds: 25 })

    const later = [ago(3000), ago(2000), ago(1000), ago(500), ago(5)]
    expect(checkOtpSendLimit(later, now)).toEqual({ reason: 'hourly', retryAfterSeconds: 600 })
  })
})

describe('otpSendLimitMessage', () => {
  test('a short wait is said in seconds', () => {
    expect(otpSendLimitMessage(20)).toBe(
      'Too many codes requested for this number. Try again in 20 seconds.'
    )
    expect(otpSendLimitMessage(1)).toBe('Too many codes requested for this number. Try again in 1 second.')
  })

  test('a long wait is said in whole minutes, rounded up', () => {
    expect(otpSendLimitMessage(600)).toBe(
      'Too many codes requested for this number. Try again in 10 minutes.'
    )
    expect(otpSendLimitMessage(61)).toBe('Too many codes requested for this number. Try again in 2 minutes.')
    expect(otpSendLimitMessage(60)).toBe('Too many codes requested for this number. Try again in 1 minute.')
  })
})

describe('otpAttemptCap', () => {
  test('a fresh window gives the latest code every attempt', () => {
    expect(otpAttemptCap(0)).toBe(MAX_OTP_VERIFY_ATTEMPTS)
  })

  test('failed attempts on earlier codes in the window come off the cap', () => {
    expect(otpAttemptCap(2)).toBe(MAX_OTP_VERIFY_ATTEMPTS - 2)
  })

  test('never negative', () => {
    expect(otpAttemptCap(9)).toBe(0)
  })

  test('the window ends at the limit: other codes plus this cap is the max', () => {
    // Two wrong guesses on an earlier code, then a fresh code. The cap does
    // not take this code's own counter, which a burst of parallel guesses is
    // moving, so every guess in the burst works out the same cap of 1.
    expect(2 + otpAttemptCap(2)).toBe(MAX_OTP_VERIFY_ATTEMPTS)
  })
})
