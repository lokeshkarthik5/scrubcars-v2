import { describe, expect, test } from 'bun:test'
import type { MyCoupon } from '@repo/core/api/coupons'
import { carriesCouponCode, couponClosedLine, couponsForCheckout } from './coupons'

const coupon = (overrides: Partial<MyCoupon>): MyCoupon => ({
  id: 'c1',
  kind: 'voucher',
  vendorId: null,
  reward: 'amount',
  title: '₹100 off',
  conditions: [],
  offAmount: 100,
  offPercent: null,
  stamps: null,
  validFrom: '2026-11-01T00:00:00Z',
  validUntil: '2026-12-31T18:29:59Z',
  state: 'ready',
  code: 'CPABCDEFGH',
  expiresAt: '2026-12-31T18:29:59Z',
  addedAt: '2026-11-02T00:00:00Z',
  ...overrides,
})

describe('coupons in the customer app', () => {
  test('the coupon page and sign-in on the way back to it keep Meta out', () => {
    expect(carriesCouponCode('/c/7K4QM92MXA', null)).toBe(true)
    expect(carriesCouponCode('/login', '/c/7K4QM92MXA')).toBe(true)
    expect(carriesCouponCode('/profile/coupons', null)).toBe(false)
    expect(carriesCouponCode('/contact', null)).toBe(false)
  })

  test('checkout offers ready vouchers only', () => {
    const list = [
      coupon({}),
      coupon({ id: 'c2', state: 'used', code: null }),
      coupon({ id: 'c3', kind: 'stamps', state: 'added', code: null }),
      coupon({ id: 'c4', state: 'expired', code: null }),
    ]
    expect(couponsForCheckout(list).map((c) => c.id)).toEqual(['c1'])
    expect(couponsForCheckout(undefined)).toEqual([])
  })

  test('a coupon that cannot be added says why', () => {
    expect(couponClosedLine({ state: 'available', validFrom: '', validUntil: '' })).toBeNull()
    expect(couponClosedLine({ state: 'redeemed', validFrom: '', validUntil: '' })).toBe('This coupon has already been used.')
    expect(couponClosedLine({ state: 'expired', validFrom: '', validUntil: '2026-12-31T18:29:59Z' })).toBe('This coupon expired on 31 Dec 2026.')
  })
})
