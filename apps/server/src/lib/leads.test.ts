import { describe, expect, test } from 'bun:test'
import {
  isIndianMobile,
  leadDisplayName,
  leadDisplayPhone,
  normalisePhone,
  statusColumns,
} from './leads.js'

describe('normalisePhone', () => {
  test('an Indian number written any usual way is its ten digits', () => {
    for (const raw of [
      '9840012345',
      '+91 98400 12345',
      '91-98400-12345',
      '098400 12345',
      '(+91) 98400-12345',
      '0919840012345',
    ]) {
      expect(normalisePhone(raw)).toBe('9840012345')
    }
  })

  test('a Chennai landline with or without its 0 is the same number', () => {
    expect(normalisePhone('044 2345 6789')).toBe('4423456789')
    expect(normalisePhone('+91 44 2345 6789')).toBe('4423456789')
    expect(normalisePhone('4423456789')).toBe('4423456789')
  })

  test('no number, too short or too long is none', () => {
    expect(normalisePhone(null)).toBeNull()
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone('call us')).toBeNull()
    expect(normalisePhone('12345')).toBeNull()
    expect(normalisePhone('1234567890123456')).toBeNull()
  })
})

test('isIndianMobile: ten digits from 6 to 9, what WhatsApp opens', () => {
  expect(isIndianMobile('9840012345')).toBe(true)
  expect(isIndianMobile('6000000000')).toBe(true)
  expect(isIndianMobile('4423456789')).toBe(false)
  expect(isIndianMobile('98400123')).toBe(false)
  expect(isIndianMobile(null)).toBe(false)
})

test("a lead's name and phone: the team's, else Google's, else a stand-in", () => {
  expect(
    leadDisplayName({ name: 'Speed Wash', googleName: 'Speed Wash Anna Nagar' })
  ).toBe('Speed Wash')
  expect(leadDisplayName({ name: null, googleName: 'Shine Pro' })).toBe(
    'Shine Pro'
  )
  expect(leadDisplayName({ name: null, googleName: null })).toBe(
    'Place from Google (details expired)'
  )
  expect(leadDisplayPhone({ phone: null, googlePhone: '9840022417' })).toBe(
    '9840022417'
  )
  expect(
    leadDisplayPhone({ phone: '9840000000', googlePhone: '9840022417' })
  ).toBe('9840000000')
  expect(leadDisplayPhone({ phone: null, googlePhone: null })).toBeNull()
})

describe('statusColumns', () => {
  const now = new Date('2026-10-29T06:00:00Z')

  test('Not interested keeps its reason, the day and the try-again day', () => {
    expect(
      statusColumns(
        {
          status: 'not_interested',
          reason: '  Has their own app ',
          retryAfter: '2027-01-29',
        },
        '2026-10-29',
        now
      )
    ).toEqual({
      status: 'not_interested',
      notInterestedReason: 'Has their own app',
      notInterestedOn: '2026-10-29',
      retryAfter: '2027-01-29',
    })
  })

  test('Not interested without a reason is refused', () => {
    expect(() =>
      statusColumns(
        { status: 'not_interested', reason: ' ' },
        '2026-10-29',
        now
      )
    ).toThrow()
  })

  test('any other status clears the three; Onboarded stamps when', () => {
    expect(
      statusColumns(
        { status: 'to_target', reason: 'ignored', retryAfter: '2027-01-01' },
        '2026-10-29',
        now
      )
    ).toEqual({
      status: 'to_target',
      notInterestedReason: null,
      notInterestedOn: null,
      retryAfter: null,
      onboardedAt: null,
    })
    expect(
      statusColumns({ status: 'onboarded' }, '2026-10-29', now).onboardedAt
    ).toEqual(now)
  })
})
