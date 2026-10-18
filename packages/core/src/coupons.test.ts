import { describe, expect, test } from 'bun:test'
import { checkCharacter, codeFromScan, couponCodeProblem, formatCouponCode, parseCouponCode } from './coupons'

const body = '7K4QM92MX'
const CODE = body + checkCharacter(body)

describe('reading a coupon code in the app', () => {
  test('the QR link, the printed form or the bare code', () => {
    expect(codeFromScan(`https://detlio.com/c/${CODE}`)).toBe(CODE)
    expect(codeFromScan(`https://www.detlio.com/c/${CODE}?utm_source=flyer`)).toBe(CODE)
    expect(codeFromScan(formatCouponCode(CODE))).toBe(CODE)
    expect(codeFromScan(CODE.toLowerCase())).toBe(CODE)
  })

  test('another QR (a menu, a payment) or a typo is never sent as a guess', () => {
    expect(codeFromScan('https://example.com/menu')).toBeNull()
    expect(codeFromScan('upi://pay?pa=shop@okicici')).toBeNull()
    expect(codeFromScan(`${body}${CODE[9] === 'A' ? 'B' : 'A'}`)).toBeNull()
  })

  test('a typo and a wrong shape get different sentences; a good code none', () => {
    expect(couponCodeProblem(CODE)).toBeNull()
    expect(couponCodeProblem(`${body}${CODE[9] === 'A' ? 'B' : 'A'}`)).toContain('Check each character')
    expect(couponCodeProblem('DTL-123')).toContain('10 letters and numbers')
    expect(parseCouponCode(`DTL-${CODE}`)).toEqual({ ok: true, code: CODE })
  })
})
