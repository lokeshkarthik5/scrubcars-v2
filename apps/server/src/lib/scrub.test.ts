import { describe, expect, test } from 'bun:test'
import { scrubBreadcrumb, scrubEvent, scrubText } from './scrub.js'

describe('scrubText', () => {
  test('takes out a ten-digit phone however it was typed', () => {
    for (const phone of ['9876543210', '+919876543210', '+91 98765 43210', '91-98765-43210', '98765 43210']) {
      expect(scrubText(`call ${phone} now`)).toBe('call [phone] now')
    }
  })

  test('takes out a six-digit code', () => {
    expect(scrubText('otp 482913 rejected')).toBe('otp [code] rejected')
    expect(scrubText('{"otp":"004521"}')).toBe('{"otp":"[code]"}')
  })

  test('leaves ids, times and short numbers alone', () => {
    const text = 'booking e2e00000-0000-4000-8000-000000000101 at 10:30, ₹499, attempt 3, 2026-10-04'
    expect(scrubText(text)).toBe(text)
  })

  test('does not cut a code out of a longer number', () => {
    expect(scrubText('order 12345678')).toBe('order 12345678')
    expect(scrubText('ts 1759572000000')).toBe('ts 1759572000000')
  })
})

describe('scrubEvent', () => {
  test('cleans the message, the exception, the request and the extra data', () => {
    const event = scrubEvent({
      message: 'verify failed for 9876543210',
      exception: { values: [{ value: 'Invalid OTP 123456 for 9876543210' }] },
      request: {
        url: 'https://api.detlio.com/api/v1/auth/otp/send?phone=9876543210',
        query_string: 'phone=9876543210',
        data: { phone: '9876543210', otp: '123456', purpose: 'login' },
      },
      extra: { path: '/api/v1/auth/otp/verify', attempt: { otp: '654321' } },
    })

    expect(event.message).toBe('verify failed for [phone]')
    expect(event.exception.values[0].value).toBe('Invalid OTP [code] for [phone]')
    expect(event.request.url).toBe('https://api.detlio.com/api/v1/auth/otp/send?phone=[phone]')
    expect(event.request.query_string).toBe('phone=[phone]')
    expect(event.request.data).toEqual({ phone: '[phone]', otp: '[code]', purpose: 'login' })
    expect(event.extra).toEqual({ path: '/api/v1/auth/otp/verify', attempt: { otp: '[code]' } })
  })

  test('an event with none of those parts comes back unharmed', () => {
    expect(scrubEvent({})).toEqual({})
  })
})

describe('scrubBreadcrumb', () => {
  test('cleans the message and the data', () => {
    expect(
      scrubBreadcrumb({ message: 'POST /otp/verify 9876543210', data: { body: 'otp=111222' } })
    ).toEqual({ message: 'POST /otp/verify [phone]', data: { body: 'otp=[code]' } })
  })
})
