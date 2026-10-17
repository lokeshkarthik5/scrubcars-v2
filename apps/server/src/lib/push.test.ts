import { describe, expect, test } from 'bun:test'
import {
  classifySendFailure,
  customerWants,
  deviceLabel,
  isAllowedPushEndpoint,
  isPushConfigured,
  isValidSubscriptionKeys,
  pushPayload,
  type PushMessage,
} from './push.js'

// A real-shaped P-256 public key and auth secret (throwaway, never used).
const P256DH = 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4'
const AUTH = 'k3vHqKPmQc5a2VRZ4bS7Cg'

describe('which endpoints may be stored and sent to', () => {
  test('the browsers’ push services are allowed', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc:APA91b',
      'https://android.googleapis.com/gcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
      'https://web.push.apple.com/QGuQyavXutnMsjzmS1iPSB',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(true)
    }
  })

  test('anything the server should never call is refused', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc', // not https
      'https://localhost/fcm/send/abc',
      'https://169.254.169.254/latest/meta-data',
      'https://api.detlio.com/api/v1/admin/vendors',
      'https://fcm.googleapis.com.evil.example/fcm/send/abc', // lookalike host
      'https://evilfcm.googleapis.com.example/x',
      'https://notify.windows.com.evil.example/x',
      'https://user:pass@fcm.googleapis.com/fcm/send/abc', // credentials
      'https://fcm.googleapis.com:8443/fcm/send/abc', // a port
      'not a url',
      `https://fcm.googleapis.com/fcm/send/${'a'.repeat(1100)}`, // too long
    ]) {
      expect(isAllowedPushEndpoint(endpoint)).toBe(false)
    }
  })
})

test('subscription keys must look like keys', () => {
  expect(isValidSubscriptionKeys({ p256dh: P256DH, auth: AUTH })).toBe(true)
  expect(isValidSubscriptionKeys({ p256dh: 'short', auth: AUTH })).toBe(false)
  expect(isValidSubscriptionKeys({ p256dh: P256DH, auth: 'x' })).toBe(false)
  expect(isValidSubscriptionKeys({ p256dh: `${P256DH.slice(0, 80)}<script>`, auth: AUTH })).toBe(false)
})

test('a device is named by browser and system, never by its raw user agent', () => {
  expect(
    deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')
  ).toBe('Chrome on Android')
  expect(
    deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
  ).toBe('Safari on iPhone')
  expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0')).toBe(
    'Edge on Windows'
  )
  expect(deviceLabel('Mozilla/5.0 (Linux; Android 13) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36')).toBe(
    'Samsung Internet on Android'
  )
  expect(deviceLabel(undefined)).toBeNull()
})

describe('what a push service’s answer means', () => {
  test('404 and 410: the browser dropped the subscription', () => {
    expect(classifySendFailure(410)).toEqual({ kind: 'gone' })
    expect(classifySendFailure(404)).toEqual({ kind: 'gone' })
  })

  test('anything else may pass: kept and counted', () => {
    expect(classifySendFailure(429)).toEqual({ kind: 'failed', status: 429 })
    expect(classifySendFailure(500)).toEqual({ kind: 'failed', status: 500 })
    expect(classifySendFailure(undefined)).toEqual({ kind: 'failed', status: null })
  })
})

test('a customer’s two switches decide booking news and reminders; a test always goes', () => {
  const off = { pushBookingUpdates: false, pushReminders: false }
  const on = { pushBookingUpdates: true, pushReminders: true }
  expect(customerWants('booking_update', on)).toBe(true)
  expect(customerWants('booking_update', { ...on, pushBookingUpdates: false })).toBe(false)
  expect(customerWants('reminder', { ...on, pushReminders: false })).toBe(false)
  expect(customerWants('reminder', { ...off, pushReminders: true })).toBe(true)
  expect(customerWants('test', off)).toBe(true)
})

describe('whether notifications are on', () => {
  const keys = { publicKey: P256DH, privateKey: 'private', subject: 'mailto:support@detlio.com' }

  test('needs all three VAPID settings, with a contact the push service can use', () => {
    expect(isPushConfigured(keys)).toBe(true)
    expect(isPushConfigured({ ...keys, subject: 'https://detlio.com' })).toBe(true)
    expect(isPushConfigured({ ...keys, publicKey: undefined })).toBe(false)
    expect(isPushConfigured({ ...keys, privateKey: undefined })).toBe(false)
    expect(isPushConfigured({ ...keys, subject: undefined })).toBe(false)
    expect(isPushConfigured({ ...keys, subject: 'support@detlio.com' })).toBe(false)
    expect(isPushConfigured({})).toBe(false)
  })

  test('the E2E stand-in needs only the public key the browser subscribes with', () => {
    expect(isPushConfigured({ publicKey: P256DH, fake: true })).toBe(true)
    expect(isPushConfigured({ fake: true })).toBe(false)
  })
})

test('the payload carries what the service worker shows, and no delivery settings', () => {
  const message: PushMessage = {
    title: 'T',
    body: 'B',
    url: '/bookings/1',
    tag: 'booking:1',
    category: 'booking_update',
    ttlSeconds: 60,
    urgency: 'high',
  }
  expect(JSON.parse(pushPayload(message))).toEqual({ title: 'T', body: 'B', url: '/bookings/1', tag: 'booking:1' })
})
