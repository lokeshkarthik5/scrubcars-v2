import { describe, expect, test } from 'bun:test'
import {
  endNowPatch,
  isAllowedNoticeLink,
  noticeMatchesBooking,
  noticeProblem,
  noticeState,
  type NoticeFields,
} from './notices.js'
import { createNoticeSchema, updateNoticeSchema } from '../modules/notices/notices.validation.js'

const NOW = new Date('2026-10-12T06:30:00Z')
const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const ahead = (ms: number) => new Date(NOW.getTime() + ms)

describe('a notice over time', () => {
  test('scheduled, live, then ended; switched off is ended', () => {
    expect(noticeState({ isActive: true, startsAt: ahead(HOUR), endsAt: ahead(2 * HOUR) }, NOW)).toBe('scheduled')
    expect(noticeState({ isActive: true, startsAt: ago(HOUR), endsAt: ahead(HOUR) }, NOW)).toBe('live')
    expect(noticeState({ isActive: true, startsAt: ago(2 * HOUR), endsAt: NOW }, NOW)).toBe('ended')
    expect(noticeState({ isActive: false, startsAt: ago(HOUR), endsAt: ahead(HOUR) }, NOW)).toBe('ended')
  })

  test('End now ends a live notice now, but switches a scheduled one off', () => {
    expect(endNowPatch({ isActive: true, startsAt: ago(HOUR), endsAt: ahead(HOUR) }, NOW)).toEqual({ endsAt: NOW })
    // Setting ends_at = now on a scheduled notice would break the window CHECK.
    expect(endNowPatch({ isActive: true, startsAt: ahead(HOUR), endsAt: ahead(2 * HOUR) }, NOW)).toEqual({ isActive: false })
    expect(endNowPatch({ isActive: false, startsAt: ago(HOUR), endsAt: ahead(HOUR) }, NOW)).toBeNull()
  })
})

describe('who a booking-window notice is about', () => {
  const notice = {
    audience: 'with_booking_between' as const,
    vendorId: 'v1',
    bookingFrom: new Date('2026-10-15T00:00:00Z'),
    bookingTo: new Date('2026-10-16T00:00:00Z'),
  }
  const at = (iso: string, overrides: object = {}) => ({
    status: 'confirmed',
    vendorId: 'v1',
    scheduledAt: new Date(iso),
    ...overrides,
  })

  test('a booking still to happen, in the window, at its garage', () => {
    expect(noticeMatchesBooking(notice, at('2026-10-15T04:30:00Z'))).toBe(true)
    // Both ends count.
    expect(noticeMatchesBooking(notice, at('2026-10-15T00:00:00Z'))).toBe(true)
    expect(noticeMatchesBooking(notice, at('2026-10-16T00:00:00Z'))).toBe(true)
    expect(noticeMatchesBooking(notice, at('2026-10-16T00:00:01Z'))).toBe(false)
    expect(noticeMatchesBooking(notice, at('2026-10-15T04:30:00Z', { vendorId: 'v2' }))).toBe(false)
    expect(noticeMatchesBooking(notice, at('2026-10-15T04:30:00Z', { status: 'cancelled' }))).toBe(false)
    expect(noticeMatchesBooking({ ...notice, vendorId: null }, at('2026-10-15T04:30:00Z', { vendorId: 'v2' }))).toBe(true)
    expect(noticeMatchesBooking({ ...notice, audience: 'all' }, at('2026-10-15T04:30:00Z'))).toBe(false)
  })
})

describe('links', () => {
  test('https links and app paths only', () => {
    for (const ok of ['https://detlio.com/help', '/bookings', '/', '/garage/abc?x=1']) {
      expect(isAllowedNoticeLink(ok)).toBe(true)
    }
    for (const bad of [
      '//evil.com',
      '//evil.com/x',
      // Browsers read a backslash as a slash (the first two open evil.com),
      // and drop a tab (making the fourth //evil.com).
      '/\\evil.com',
      'https://\\evil.com',
      '/help\\x',
      '/\t/evil.com',
      'http://detlio.com',
      'javascript:alert(1)',
      'https:///x',
      'bookings',
      '/book ings',
    ]) {
      expect(isAllowedNoticeLink(bad)).toBe(false)
    }
  })
})

describe('a notice as a whole', () => {
  const fields = (overrides: Partial<NoticeFields> = {}): NoticeFields => ({
    title: 'Slot may move: rain',
    body: 'Heavy rain on Thursday.',
    linkUrl: null,
    linkLabel: null,
    audience: 'all',
    vendorId: null,
    bookingFrom: null,
    bookingTo: null,
    startsAt: ago(HOUR),
    endsAt: ahead(HOUR),
    ...overrides,
  })

  test('fine as it is', () => {
    expect(noticeProblem(fields())).toBeNull()
    expect(noticeProblem(fields({ audience: 'with_booking_between', vendorId: 'v1', bookingFrom: NOW, bookingTo: ahead(HOUR) }))).toBeNull()
  })

  test('the problems the CHECKs would refuse', () => {
    expect(noticeProblem(fields({ endsAt: ago(HOUR) }))?.field).toBe('endsAt')
    expect(noticeProblem(fields({ vendorId: 'v1' }))?.field).toBe('audience')
    // A null end of the window would pass a plain `to > from`.
    expect(noticeProblem(fields({ audience: 'with_booking_between', bookingFrom: NOW, bookingTo: null }))?.field).toBe('bookingTo')
    expect(noticeProblem(fields({ audience: 'with_booking_between', bookingFrom: NOW, bookingTo: NOW }))?.field).toBe('bookingTo')
    expect(noticeProblem(fields({ linkUrl: '/bookings' }))?.field).toBe('linkLabel')
    expect(noticeProblem(fields({ linkUrl: '//evil.com', linkLabel: 'Open' }))?.field).toBe('linkUrl')
  })
})

describe('notice validation', () => {
  test('create defaults to active and refuses a protocol-relative link', () => {
    const parsed = createNoticeSchema.parse({
      title: 'Slot may move: rain',
      body: 'Heavy rain on Thursday.',
      audience: 'all',
      endsAt: '2026-10-20T00:00:00+05:30',
    })
    expect(parsed.isActive).toBe(true)
    expect(
      createNoticeSchema.safeParse({
        title: 'Slot may move: rain',
        body: 'Heavy rain on Thursday.',
        audience: 'all',
        endsAt: '2026-10-20T00:00:00+05:30',
        linkUrl: '//evil.com',
        linkLabel: 'Open',
      }).success
    ).toBe(false)
    expect(createNoticeSchema.safeParse({ title: 'x'.repeat(61), body: 'ok body', audience: 'all', endsAt: '2026-10-20' }).success).toBe(false)
  })

  test('a PATCH stays partial: it never switches a notice back on', () => {
    expect(updateNoticeSchema.parse({ title: 'New title here' })).toEqual({ title: 'New title here' })
    expect(updateNoticeSchema.safeParse({}).success).toBe(false)
  })
})
