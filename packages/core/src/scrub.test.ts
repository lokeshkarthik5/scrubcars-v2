import { describe, expect, test } from 'bun:test'
import { sentryOptions } from './monitoring'
import { scrubBreadcrumb, scrubEvent, scrubText } from './scrub'

// The same rules as apps/server/src/lib/scrub.ts — these cases are shared on
// purpose, so the two copies cannot drift without a test noticing.

describe('scrubText', () => {
  test('takes out a ten-digit phone however it was typed', () => {
    for (const phone of ['9876543210', '+919876543210', '+91 98765 43210', '91-98765-43210', '98765 43210']) {
      expect(scrubText(`call ${phone} now`)).toBe('call [phone] now')
    }
  })

  test('takes out a six-digit code', () => {
    expect(scrubText('otp 482913 rejected')).toBe('otp [code] rejected')
  })

  test('leaves ids, times and short numbers alone', () => {
    const text = 'booking e2e00000-0000-4000-8000-000000000101 at 10:30, ₹499, attempt 3, 2026-10-04'
    expect(scrubText(text)).toBe(text)
  })
})

describe('scrubEvent and scrubBreadcrumb', () => {
  test('clean what a browser error carries', () => {
    const event = scrubEvent({
      message: 'verify failed for 9876543210',
      exception: { values: [{ value: 'Invalid OTP 123456' }] },
      request: { url: 'https://www.detlio.com/verify-otp?phone=9876543210' },
    })
    expect(event.message).toBe('verify failed for [phone]')
    expect(event.exception.values[0].value).toBe('Invalid OTP [code]')
    expect(event.request.url).toBe('https://www.detlio.com/verify-otp?phone=[phone]')

    expect(scrubBreadcrumb({ message: 'console: sent 654321 to 98765 43210' })).toEqual({
      message: 'console: sent [code] to [phone]',
    })
  })
})

describe('sentryOptions', () => {
  test('nothing at all without a DSN', () => {
    expect(sentryOptions({ app: 'users', dsn: undefined, environment: 'production', version: '0.3.0' })).toBeNull()
    expect(sentryOptions({ app: 'users', dsn: '', environment: 'production', version: '0.3.0' })).toBeNull()
  })

  test('with one: tagged by app and version, no traces, and scrubbed', () => {
    const options = sentryOptions({
      app: 'vendors',
      dsn: 'https://key@o0.ingest.sentry.io/1',
      environment: 'production',
      version: '0.3.0',
    })!
    expect(options.environment).toBe('production')
    expect(options.release).toBe('vendors@0.3.0')
    expect(options.tracesSampleRate).toBe(0)
    expect(options.dataCollection.httpBodies).toEqual([])
    expect(options.beforeSend({ message: 'otp 123456' }).message).toBe('otp [code]')
  })

  test('an unset environment reads as development, never as production', () => {
    const options = sentryOptions({ app: 'admin', dsn: 'https://k@o0.ingest.sentry.io/1', environment: undefined, version: undefined })!
    expect(options.environment).toBe('development')
    expect(options.release).toBeUndefined()
  })
})
