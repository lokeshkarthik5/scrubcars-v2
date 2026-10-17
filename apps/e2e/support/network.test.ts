import { describe, expect, test } from 'bun:test'
import { isBlockedThirdParty } from './network'

describe('isBlockedThirdParty', () => {
  test('blocks the hosts a page must never reach, including a subdomain', () => {
    expect(isBlockedThirdParty('https://checkout.razorpay.com/v1/checkout.js')).toBe(true)
    expect(isBlockedThirdParty('https://api.razorpay.com/v1/orders')).toBe(true)
    expect(isBlockedThirdParty('https://a.b.tiles.openfreemap.org/x')).toBe(true)
    expect(isBlockedThirdParty('https://fonts.googleapis.com/css2?family=Inter')).toBe(true)
    expect(isBlockedThirdParty('https://fonts.gstatic.com/s/inter.woff2')).toBe(true)
    expect(isBlockedThirdParty('https://connect.facebook.net/en_US/fbevents.js')).toBe(true)
    expect(isBlockedThirdParty('https://www.facebook.com/tr')).toBe(true)
    expect(isBlockedThirdParty('https://FONTS.GOOGLEAPIS.COM/css')).toBe(true)
    expect(isBlockedThirdParty('https://fonts.googleapis.com')).toBe(true)
  })

  test('leaves the app and lookalike hosts alone', () => {
    expect(isBlockedThirdParty('http://localhost:3000/home')).toBe(false)
    expect(isBlockedThirdParty('http://localhost:8080/api/v1/health')).toBe(false)
    expect(isBlockedThirdParty('https://notcheckout.razorpay.com/')).toBe(false)
    expect(isBlockedThirdParty('https://www.facebook.com.evil.com/')).toBe(false)
    expect(isBlockedThirdParty('https://evil.com/?next=https://checkout.razorpay.com')).toBe(false)
    expect(isBlockedThirdParty('https://facebook.com/tr')).toBe(false)
  })
})
