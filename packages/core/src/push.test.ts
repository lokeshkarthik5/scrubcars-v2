import { describe, expect, test } from 'bun:test'
import { isIosDevice, pushSupport, urlBase64ToUint8Array, type PushEnvironment } from './push'

const full: PushEnvironment = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIos: false,
  isStandalone: false,
  permission: 'default',
}

describe('whether this browser can take notifications', () => {
  test('a browser with push can turn them on', () => {
    expect(pushSupport(full)).toBe('supported')
    expect(pushSupport({ ...full, permission: 'granted' })).toBe('supported')
  })

  test('blocked for the site: only the browser settings can undo it', () => {
    expect(pushSupport({ ...full, permission: 'denied' })).toBe('denied')
  })

  test('an iPhone tab has no PushManager until the app is added to the Home Screen', () => {
    const safariTab = { ...full, hasPushManager: false, hasNotification: false, isIos: true }
    expect(pushSupport(safariTab)).toBe('ios_install')
    // Opened from the Home Screen on an iOS too old for web push: nothing to suggest.
    expect(pushSupport({ ...safariTab, isStandalone: true })).toBe('unsupported')
    // From the Home Screen on iOS 16.4+, it is an ordinary supported browser.
    expect(pushSupport({ ...full, isIos: true, isStandalone: true })).toBe('supported')
  })

  test('a browser with no push at all', () => {
    expect(pushSupport({ ...full, hasServiceWorker: false })).toBe('unsupported')
  })
})

test('an iPad says Macintosh but has a touch screen', () => {
  expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 5)).toBe(true)
  expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe(true)
  expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe(false)
  expect(isIosDevice('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false)
})

test('the VAPID public key becomes the 65 bytes of a P-256 point', () => {
  const bytes = urlBase64ToUint8Array('BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4')
  expect(bytes.length).toBe(65)
  expect(bytes[0]).toBe(4)
})
