import { describe, expect, test } from 'bun:test'
import {
  AGREEMENT_GRACE_DAYS,
  AGREEMENT_MAX_BYTES,
  acceptRefusal,
  agreementKey,
  agreementKeyVersion,
  agreementStanding,
  agreementUploadRefusal,
  graceEndsAt,
  ipHash,
  looksLikePdf,
  nextAgreementVersion,
} from './agreements.js'
import { TIER_RULES } from './tiers.js'

const UUID = '0b4f6c1e-2d3a-4c5b-8e9f-0a1b2c3d4e5f'
const DAY = 24 * 60 * 60 * 1000

describe('the file', () => {
  test('keys are agreements/v<N>-<uuid>.pdf, and nothing else is one', () => {
    expect(agreementKey(3, UUID)).toBe(`agreements/v3-${UUID}.pdf`)
    expect(agreementKeyVersion(agreementKey(3, UUID))).toBe(3)
    expect(agreementKeyVersion(agreementKey(120, UUID))).toBe(120)
    expect(agreementKeyVersion(`agreements/v0-${UUID}.pdf`)).toBeNull()
    expect(agreementKeyVersion(`agreements/v3-${UUID}.png`)).toBeNull()
    expect(agreementKeyVersion(`agreements/../v3-${UUID}.pdf`)).toBeNull()
    expect(agreementKeyVersion(`vendors/x/agreements/v3-${UUID}.pdf`)).toBeNull()
    expect(agreementKeyVersion(`agreements/v3-${UUID}.pdf/x`)).toBeNull()
    expect(agreementKeyVersion(`agreements/v3-not-a-uuid.pdf`)).toBeNull()
  })

  test('a PDF up to 10 MB, nothing else', () => {
    expect(agreementUploadRefusal('application/pdf', 1)).toBeNull()
    expect(agreementUploadRefusal('application/pdf', AGREEMENT_MAX_BYTES)).toBeNull()
    expect(agreementUploadRefusal('application/pdf', AGREEMENT_MAX_BYTES + 1)).toBe('too_large')
    expect(agreementUploadRefusal('application/pdf', 0)).toBe('empty')
    expect(agreementUploadRefusal('application/pdf', 1.5)).toBe('empty')
    expect(agreementUploadRefusal('image/png', 100)).toBe('not_pdf')
    expect(agreementUploadRefusal('application/x-pdf', 100)).toBe('not_pdf')
  })

  test('the bytes must start like a PDF, whatever the name says', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true)
    expect(looksLikePdf(new TextEncoder().encode('%PDF'))).toBe(false)
    expect(looksLikePdf(new TextEncoder().encode('<html>'))).toBe(false)
    expect(looksLikePdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false)
  })

  test('versions count up from 1', () => {
    expect(nextAgreementVersion(null)).toBe(1)
    expect(nextAgreementVersion(4)).toBe(5)
  })
})

describe('the IP hash', () => {
  test('keyed, stable, and never the address', () => {
    const one = ipHash('203.0.113.7', 'secret-a')
    expect(one).toMatch(/^[0-9a-f]{64}$/)
    expect(one).toBe(ipHash(' 203.0.113.7 ', 'secret-a'))
    expect(one).not.toBe(ipHash('203.0.113.8', 'secret-a'))
    expect(one).not.toBe(ipHash('203.0.113.7', 'secret-b'))
    expect(one).not.toContain('203')
  })

  test('none without an address', () => {
    expect(ipHash(null, 's')).toBeNull()
    expect(ipHash('', 's')).toBeNull()
    expect(ipHash('unknown', 's')).toBeNull()
  })
})

describe('agreementStanding', () => {
  const published = new Date('2026-11-01T06:30:00Z')
  const latest = { version: 2, publishedAt: published }

  test('nothing published: nothing to accept, no Bronze', () => {
    expect(agreementStanding({ latest: null, acceptedVersion: null }, published)).toEqual({
      status: 'not_published',
      bronze: false,
      latestVersion: null,
      acceptedVersion: null,
      acceptBy: null,
    })
  })

  test('accepted the latest: Bronze', () => {
    expect(agreementStanding({ latest, acceptedVersion: 2 }, published)).toMatchObject({
      status: 'accepted',
      bronze: true,
    })
  })

  test('never accepted: no Bronze, even on the day a version comes out', () => {
    expect(agreementStanding({ latest, acceptedVersion: null }, published)).toMatchObject({
      status: 'not_accepted',
      bronze: false,
    })
  })

  test('an earlier version: Bronze for 30 days, then not', () => {
    expect(AGREEMENT_GRACE_DAYS).toBe(TIER_RULES.bronze.agreementGraceDays)
    expect(AGREEMENT_GRACE_DAYS).toBe(30)
    const inside = agreementStanding({ latest, acceptedVersion: 1 }, new Date(published.getTime() + 29 * DAY))
    expect(inside).toMatchObject({ status: 'grace', bronze: true, latestVersion: 2, acceptedVersion: 1 })
    // 06:30 UTC on 1 Dec is 12:00 IST; the last moment is that minus a ms, still 1 Dec.
    expect(graceEndsAt(published).toISOString()).toBe('2026-12-01T06:30:00.000Z')
    expect(inside.acceptBy).toBe('2026-12-01')
    const lastMoment = new Date(graceEndsAt(published).getTime() - 1)
    expect(agreementStanding({ latest, acceptedVersion: 1 }, lastMoment).bronze).toBe(true)
    expect(agreementStanding({ latest, acceptedVersion: 1 }, graceEndsAt(published))).toMatchObject({
      status: 'not_accepted',
      bronze: false,
      acceptBy: null,
    })
  })
})

describe('acceptRefusal', () => {
  const ok = { latestVersion: 2, version: 2, alreadyAccepted: false, viaSupport: false }
  test('the garage accepts the latest, once, itself', () => {
    expect(acceptRefusal(ok)).toBeNull()
    expect(acceptRefusal({ ...ok, viaSupport: true })).toBe('support_session')
    expect(acceptRefusal({ ...ok, latestVersion: null })).toBe('not_published')
    expect(acceptRefusal({ ...ok, version: 1 })).toBe('stale_version')
    expect(acceptRefusal({ ...ok, alreadyAccepted: true })).toBe('already_accepted')
  })
})
