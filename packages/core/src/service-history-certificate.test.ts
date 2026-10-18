import { describe, expect, test } from 'bun:test'
import {
  isVerifyPath,
  bodyTypeLabel,
  certificateDateLabel,
  isCertificateTokenShaped,
  jobsLabel,
  shortVerifyLink,
  verifyPath,
  viewsLine,
} from './service-history-certificate'

describe('service history certificate words', () => {
  test('dates read as printed', () => {
    expect(certificateDateLabel('2026-10-17')).toBe('17 Oct 2026')
    expect(certificateDateLabel('2026-01-05')).toBe('5 Jan 2026')
  })

  test('the short link has no scheme', () => {
    const token = 'a'.repeat(32)
    expect(verifyPath(token)).toBe(`/verify/${token}`)
    expect(shortVerifyLink('https://detlio.com', token)).toBe(`detlio.com/verify/${token}`)
    expect(shortVerifyLink('http://localhost:3000/', token)).toBe(`localhost:3000/verify/${token}`)
  })

  test('tokens are checked before any call', () => {
    expect(isCertificateTokenShaped('A1b2_-'.padEnd(32, 'x'))).toBe(true)
    expect(isCertificateTokenShaped('short')).toBe(false)
    expect(isCertificateTokenShaped('../../etc/passwd'.padEnd(32, 'x'))).toBe(false)
  })

  test('labels', () => {
    expect(bodyTypeLabel('suv')).toBe('SUV / MUV')
    expect(bodyTypeLabel('van')).toBe('van')
    expect(jobsLabel(1)).toBe('1 job')
    expect(jobsLabel(2)).toBe('2 jobs')
    expect(viewsLine(0, null)).toBe('Not opened yet')
    // 20:00 UTC is 01:30 the next day in IST.
    expect(viewsLine(3, '2026-10-16T20:00:00Z')).toBe('Opened 3 times, last on 17 Oct 2026')
    expect(viewsLine(1, '2026-10-16T10:00:00Z')).toBe('Opened once, last on 16 Oct 2026')
  })

  test('the verify page is recognised, so no third party is sent its address', () => {
    expect(isVerifyPath(`/verify/${'a'.repeat(32)}`)).toBe(true)
    expect(isVerifyPath('/verify')).toBe(true)
    expect(isVerifyPath('/verify-otp')).toBe(false)
    expect(isVerifyPath('/profile/cars/x/certificate')).toBe(false)
    expect(isVerifyPath(null)).toBe(false)
  })
})
