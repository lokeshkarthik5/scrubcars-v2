import { describe, expect, test } from 'bun:test'
import { ApiError } from '@repo/core/api/client'
import {
  formatCountdown,
  OTP_RESEND_COOLDOWN_SECONDS,
  otpDeadlines,
  otpErrorMessage,
  retryAt,
  secondsUntil,
} from './otp'

const now = Date.UTC(2026, 9, 4, 10, 0)

describe('formatCountdown', () => {
  test('minutes and zero-padded seconds', () => {
    expect(formatCountdown(180)).toBe('3:00')
    expect(formatCountdown(178)).toBe('2:58')
    expect(formatCountdown(5)).toBe('0:05')
    expect(formatCountdown(2480)).toBe('41:20')
  })

  test('never below zero', () => {
    expect(formatCountdown(-3)).toBe('0:00')
  })
})

describe('secondsUntil', () => {
  test('rounds a part second up, so 0:00 only shows once it is really over', () => {
    expect(secondsUntil(now + 1500, now)).toBe(2)
    expect(secondsUntil(now + 1, now)).toBe(1)
    expect(secondsUntil(now, now)).toBe(0)
    expect(secondsUntil(now - 5000, now)).toBe(0)
  })
})

describe('otpDeadlines', () => {
  test('the code lasts as long as the server says; Resend opens after 30 seconds', () => {
    expect(otpDeadlines(now, 180)).toEqual({
      expiresAt: now + 180_000,
      resendAt: now + OTP_RESEND_COOLDOWN_SECONDS * 1000,
    })
  })

  test('a missing or nonsense expiry falls back to three minutes', () => {
    expect(otpDeadlines(now, undefined).expiresAt).toBe(now + 180_000)
    expect(otpDeadlines(now, 0).expiresAt).toBe(now + 180_000)
  })
})

describe('otpErrorMessage', () => {
  test('an SMS failure tells the customer how to reach a person', () => {
    expect(otpErrorMessage(new ApiError(502, 'provider down', 'SMS_SEND_FAILED'), 'x')).toBe(
      "We couldn't send the code right now. Try again in a minute, or WhatsApp us on +91 93444 34474."
    )
  })

  test("any other refusal is the server's own words", () => {
    const limited = new ApiError(429, 'Too many codes requested for this number. Try again in 20 seconds.', 'OTP_RATE_LIMITED', 20)
    expect(otpErrorMessage(limited, 'x')).toBe(limited.message)
  })

  test('no answer at all is a connection problem', () => {
    expect(otpErrorMessage(new TypeError('Failed to fetch'), 'x')).toBe('Check your connection and try again.')
    expect(otpErrorMessage(new Error('?'), 'Failed to send OTP')).toBe('Failed to send OTP')
  })
})

describe('retryAt', () => {
  test('the per-phone limit says when to try again', () => {
    const limited = new ApiError(429, 'Too many codes…', 'OTP_RATE_LIMITED', 20)
    expect(retryAt(limited, now)).toBe(now + 20_000)
  })

  test('other refusals do not', () => {
    expect(retryAt(new ApiError(429, 'Too many requests', 'RATE_LIMIT_EXCEEDED', 20), now)).toBeNull()
    expect(retryAt(new ApiError(429, 'Too many codes…', 'OTP_RATE_LIMITED'), now)).toBeNull()
    expect(retryAt(new TypeError('Failed to fetch'), now)).toBeNull()
  })
})
