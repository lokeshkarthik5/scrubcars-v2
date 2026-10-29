import { describe, expect, test } from 'bun:test'
import type { AdminVendor, ReadinessItem } from '@repo/core/api/admin'
import {
  addedByWeek,
  dayText,
  isAlmostReady,
  istWeekStart,
  liveByArea,
  notLiveFigures,
  onlyNeedsPhotosOrLogo,
  targetFigures,
  targetLine,
  weekCompareText,
} from './garage-target'

// Wed 28 Oct 2026, 3:00 pm in Chennai. The week began Mon 26 Oct.
const NOW = Date.parse('2026-10-28T09:30:00.000Z')

const item = (
  severity: ReadinessItem['severity'],
  key = severity
): ReadinessItem => ({
  key,
  severity,
  label: key,
  short: key,
  tab: 'details',
})

let n = 0
const garage = (patch: Partial<AdminVendor> = {}): AdminVendor =>
  ({
    id: `g${++n}`,
    businessName: `Garage ${n}`,
    status: 'active',
    isVerified: true,
    live: true,
    deletedAt: null,
    bookingsPausedAt: null,
    createdAt: '2026-09-01T05:00:00.000Z',
    readiness: [],
    missing: [],
    city: 'Chennai',
    lat: 13.085,
    lng: 80.2101, // Anna Nagar
    ...patch,
  }) as AdminVendor

const pending = (patch: Partial<AdminVendor> = {}) =>
  garage({ status: 'pending', isVerified: false, live: false, ...patch })

describe('the target', () => {
  const list = [
    garage(),
    garage(),
    pending({ readiness: [item('optional')] }),
    pending({ readiness: [item('blocking')] }),
    garage({ status: 'archived', live: false }),
    garage({ deletedAt: '2026-10-01T00:00:00.000Z', live: false }),
  ]

  test('live garages against the target, with the almost ready after them', () => {
    const figures = targetFigures(list, {
      target: 10,
      endsOn: null,
      counts: 'live',
    })
    expect(figures).toMatchObject({
      count: 2,
      target: 10,
      almostReady: 1,
      percent: 20,
      toGo: 8,
    })
    expect(figures.doneWidth).toBe(20)
    expect(figures.almostWidth).toBe(10)
    expect(targetLine(figures, '2026-12-31', NOW)).toBe(
      '20% there · 1 almost ready · 8 to go by 31 Dec'
    )
  })

  test('all onboarded counts every garage not archived or in the Bin, with no amber part', () => {
    const figures = targetFigures(list, {
      target: 4,
      endsOn: null,
      counts: 'onboarded',
    })
    expect(figures).toMatchObject({
      count: 4,
      almostReady: 0,
      percent: 100,
      toGo: 0,
      almostWidth: 0,
    })
    expect(targetLine(figures, null, NOW)).toBe('100% there · target reached')
  })

  test('over the target, the bar stops at full', () => {
    const figures = targetFigures([garage(), garage(), garage()], {
      target: 2,
      endsOn: null,
      counts: 'live',
    })
    expect(figures.doneWidth).toBe(100)
    expect(figures.percent).toBe(100)
  })

  test('a day in another year says the year', () => {
    expect(dayText('2027-03-31', NOW)).toBe('31 Mar 2027')
    expect(dayText('2026-12-31', NOW)).toBe('31 Dec')
  })
})

describe('added this week', () => {
  test('the IST week starts on Monday at midnight in Chennai', () => {
    expect(new Date(istWeekStart(NOW)).toISOString()).toBe(
      '2026-10-25T18:30:00.000Z'
    )
  })

  test('this week against last; the Bin is left out', () => {
    const list = [
      garage({ createdAt: '2026-10-26T00:00:00.000Z' }), // Mon 5:30 am IST: this week
      garage({ createdAt: '2026-10-28T08:00:00.000Z' }),
      garage({ createdAt: '2026-10-25T18:00:00.000Z' }), // Sun 11:30 pm IST: last week
      garage({
        createdAt: '2026-10-28T08:00:00.000Z',
        deletedAt: '2026-10-28T09:00:00.000Z',
      }),
      garage({ createdAt: '2026-10-10T08:00:00.000Z' }),
    ]
    const weeks = addedByWeek(list, NOW)
    expect(weeks).toEqual({ thisWeek: 2, lastWeek: 1 })
    expect(weekCompareText(weeks)).toBe('1 more than last week')
    expect(weekCompareText({ thisWeek: 1, lastWeek: 3 })).toBe(
      '2 fewer than last week'
    )
    expect(weekCompareText({ thisWeek: 0, lastWeek: 0 })).toBe(
      'Same as last week'
    )
  })
})

describe('not live yet', () => {
  test('counts those not live, and the ones that only need photos or a logo', () => {
    const photosOnly = pending({
      readiness: [item('optional')],
      missing: ['photos', 'logo'],
    })
    const needsMore = pending({
      readiness: [item('optional')],
      missing: ['photos', 'payout'],
    })
    const blocked = pending({ readiness: [item('fix')], missing: ['logo'] })
    const list = [
      garage(),
      photosOnly,
      needsMore,
      blocked,
      garage({ status: 'archived', live: false }),
    ]
    expect(notLiveFigures(list)).toEqual({ count: 3, onlyPhotosOrLogo: 1 })
    expect(onlyNeedsPhotosOrLogo(photosOnly)).toBe(true)
    expect(onlyNeedsPhotosOrLogo(blocked)).toBe(false)
    expect(isAlmostReady(needsMore)).toBe(true)
    expect(isAlmostReady(blocked)).toBe(false)
    // A live garage is never almost ready.
    expect(isAlmostReady(garage())).toBe(false)
  })
})

describe('live by area', () => {
  test('live garages by the area their pin is near, most first, the top few', () => {
    const adyar = { lat: 13.0067, lng: 80.257 }
    const list = [
      garage(),
      garage(),
      garage(adyar),
      garage({ lat: null, lng: null, city: 'Vellore' }),
      pending(adyar),
      garage({ ...adyar, deletedAt: '2026-10-01T00:00:00.000Z' }),
    ]
    expect(liveByArea(list)).toEqual([
      { area: 'Anna Nagar', count: 2 },
      { area: 'Adyar', count: 1 },
      { area: 'Vellore', count: 1 },
    ])
    expect(liveByArea(list, 1)).toEqual([{ area: 'Anna Nagar', count: 2 }])
  })
})
