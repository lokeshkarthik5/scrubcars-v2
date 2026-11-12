/**
 * The payment QR reader (Garage Book payment details, 0074), on real
 * pictures. The fixtures in __fixtures__ were drawn once from known text
 * with the `qrcode` package (a QR encoder), so each one's answer is known:
 *
 *   upi-qr.png      a GPay-style screenshot: upi://pay?pa=samplecarcare@okaxis&pn=Sample%20Car%20Care
 *   upi-qr.jpg      the same code as a big phone photo (1300 px, JPEG, grey page)
 *   website-qr.png  a QR of a website address, not a UPI one
 *   blank.png       a picture with no QR in it
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { decodeImage, readPaymentQr, readQrText } from './upi-qr.js'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)))

describe('reading a payment QR', () => {
  test('a screenshot of a UPI QR gives its UPI id and name', () => {
    expect(readPaymentQr(fixture('upi-qr.png'))).toEqual({
      status: 'upi',
      upiId: 'samplecarcare@okaxis',
      upiName: 'Sample Car Care',
    })
  })

  test('a big JPEG photo of it reads the same', () => {
    expect(readPaymentQr(fixture('upi-qr.jpg'))).toEqual({
      status: 'upi',
      upiId: 'samplecarcare@okaxis',
      upiName: 'Sample Car Care',
    })
  })

  test('a QR that is not a UPI one is refused', () => {
    expect(readQrText(fixture('website-qr.png'))).toBe('https://example.com/pay')
    expect(readPaymentQr(fixture('website-qr.png'))).toEqual({ status: 'not_upi' })
  })

  test('a picture with no QR, or not a picture, is unreadable (kept, and the owner asked to check)', () => {
    expect(readPaymentQr(fixture('blank.png'))).toEqual({ status: 'unreadable' })
    expect(readPaymentQr(new TextEncoder().encode('not an image at all'))).toEqual({ status: 'unreadable' })
    // A PNG cut off half-way is no picture, not a crash.
    const png = fixture('upi-qr.png')
    expect(decodeImage(png.subarray(0, 200))).toBeNull()
    expect(readPaymentQr(png.subarray(0, 200))).toEqual({ status: 'unreadable' })
  })
})
