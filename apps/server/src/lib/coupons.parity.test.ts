import { describe, expect, test } from 'bun:test'
import * as server from './coupons.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The app
// catches a typo before asking and shows the same words the server sends.
const coreUrl = new URL('../../../../packages/core/src/coupons.ts', import.meta.url).href

type Core = Pick<
  typeof server,
  | 'COUPON_CODE_ALPHABET'
  | 'COUPON_CODE_BODY'
  | 'COUPON_CODE_LENGTH'
  | 'COUPON_CODE_PREFIX'
  | 'COUPON_KINDS'
  | 'COUPON_REWARDS'
  | 'REDEEM_CHANNELS'
  | 'COUPON_LIMITS'
  | 'checkCharacter'
  | 'parseCouponCode'
  | 'formatCouponCode'
  | 'offerTitle'
  | 'offerConditions'
> & { codeFromScan: (text: string) => string | null }

describe('coupons parity', () => {
  test('the code shape, the lists and the limits are the same', async () => {
    const core = (await import(coreUrl)) as Core
    expect(core.COUPON_CODE_ALPHABET).toBe(server.COUPON_CODE_ALPHABET)
    expect(core.COUPON_CODE_BODY).toBe(server.COUPON_CODE_BODY)
    expect(core.COUPON_CODE_LENGTH).toBe(server.COUPON_CODE_LENGTH)
    expect(core.COUPON_CODE_PREFIX).toBe(server.COUPON_CODE_PREFIX)
    expect([...core.COUPON_KINDS]).toEqual([...server.COUPON_KINDS])
    expect([...core.COUPON_REWARDS]).toEqual([...server.COUPON_REWARDS])
    expect([...core.REDEEM_CHANNELS]).toEqual([...server.REDEEM_CHANNELS])
    expect(core.COUPON_LIMITS).toEqual(server.COUPON_LIMITS)
  })

  test('both read a code the same way', async () => {
    const core = (await import(coreUrl)) as Core
    const keys = server.couponKeys('parity')
    for (let seq = 0; seq < 50; seq += 1) {
      const code = server.deriveCouponCode(keys.codeKey, 'e2e00000-0000-4000-8000-000000003690', seq)
      expect(core.checkCharacter(code.slice(0, 9))).toBe(server.checkCharacter(code.slice(0, 9)))
      const printed = server.formatCouponCode(code)
      expect(core.formatCouponCode(code)).toBe(printed)
      for (const input of [printed, code.toLowerCase(), `${code.slice(0, 9)}A`, code.slice(1), 'DTL-OOOOO-OOOOO']) {
        expect(core.parseCouponCode(input)).toEqual(server.parseCouponCode(input))
      }
      // What the camera reads: the QR's link.
      expect(core.codeFromScan(server.couponLink('https://detlio.com', code))).toBe(code)
    }
    expect(core.codeFromScan('https://example.com/menu')).toBeNull()
  })

  test('the words are the same', async () => {
    const core = (await import(coreUrl)) as Core
    const offers: server.CouponOffer[] = [
      { reward: 'amount', amountOff: 100, percentOff: null, maxDiscount: null, stamps: null, minOrder: 499, serviceCategory: null, vendorName: null, newCustomersOnly: true },
      { reward: 'percent', amountOff: null, percentOff: 20, maxDiscount: 1500, stamps: null, minOrder: null, serviceCategory: 'detailing', vendorName: 'Marina Auto Spa', newCustomersOnly: false },
      { reward: 'free_wash', amountOff: 299, percentOff: null, maxDiscount: null, stamps: null, minOrder: null, serviceCategory: 'car_wash', vendorName: null, newCustomersOnly: false },
      { reward: 'stamps', amountOff: null, percentOff: null, maxDiscount: null, stamps: 2, minOrder: null, serviceCategory: null, vendorName: null, newCustomersOnly: true },
    ]
    for (const offer of offers) {
      expect(core.offerTitle(offer)).toBe(server.offerTitle(offer))
      expect(core.offerConditions(offer)).toEqual(server.offerConditions(offer))
    }
  })
})
