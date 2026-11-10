import { describe, expect, it } from 'bun:test'
import {
  NEXT_FREE_DAYS,
  nextFreeDayLabel,
  nextFreeTimes,
  nextFreeWindow,
  type GarageWeek,
} from './next-free.js'

// Monday 9 November 2026, 10:00 IST (04:30 UTC). Every test runs on this clock.
const MON_10AM = Date.parse('2026-11-09T04:30:00.000Z')

const everyDay = (openTime: string, closeTime: string) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, openTime, closeTime, isClosed: false }))

function garage(overrides: Partial<GarageWeek> = {}): GarageWeek {
  return {
    pausedAt: null,
    slotIntervalMins: 30,
    bays: 1,
    jobsPerDay: null,
    hours: everyDay('09:00:00', '18:00:00'),
    closures: new Set(),
    busy: [],
    ...overrides,
  }
}

const ist = (date: string, time: string) => new Date(`${date}T${time}+05:30`)

describe('nextFreeDayLabel', () => {
  it('names today and tomorrow, and dates anything later', () => {
    expect(nextFreeDayLabel('2026-11-09', '2026-11-09')).toBe('today')
    expect(nextFreeDayLabel('2026-11-10', '2026-11-09')).toBe('tomorrow')
    expect(nextFreeDayLabel('2026-11-12', '2026-11-09')).toBe('2026-11-12')
  })

  it('crosses a month end', () => {
    expect(nextFreeDayLabel('2026-12-01', '2026-11-30')).toBe('tomorrow')
  })
})

describe('nextFreeTimes', () => {
  it('today, after the notice: the first three starts at the garage', () => {
    // At the garage the notice is an hour: 10:00 now, so 11:00 is the first.
    const free = nextFreeTimes(garage(), { durationMins: 60, bookingType: 'dropin' }, MON_10AM)
    expect(free).toEqual({
      day: 'today',
      times: [ist('2026-11-09', '11:00:00'), ist('2026-11-09', '11:30:00'), ist('2026-11-09', '12:00:00')].map((d) =>
        d.toISOString()
      ),
    })
  })

  it('doorstep asks three hours of notice', () => {
    const free = nextFreeTimes(garage(), { durationMins: 60, bookingType: 'doorstep' }, MON_10AM)
    expect(free?.times[0]).toBe(ist('2026-11-09', '13:00:00').toISOString())
  })

  it('tomorrow, once today has no time left for the job', () => {
    // 18:00 close, 17:30 now: nothing today with an hour's notice.
    const late = Date.parse('2026-11-09T12:00:00.000Z')
    const free = nextFreeTimes(garage(), { durationMins: 60, bookingType: 'dropin' }, late)
    expect(free?.day).toBe('tomorrow')
    expect(free?.times[0]).toBe(ist('2026-11-10', '09:00:00').toISOString())
  })

  it('skips a holiday and a weekly off day, and says the date', () => {
    const hours = everyDay('09:00:00', '18:00:00').map((row) =>
      row.dayOfWeek === 3 ? { ...row, isClosed: true } : row
    )
    const late = Date.parse('2026-11-09T12:00:00.000Z')
    // Tuesday a holiday, Wednesday the weekly off day: Thursday 12 November.
    const free = nextFreeTimes(
      garage({ hours, closures: new Set(['2026-11-10']) }),
      { durationMins: 60, bookingType: 'dropin' },
      late
    )
    expect(free?.day).toBe('2026-11-12')
  })

  it('leaves out a time the one bay is busy at, as the picker does', () => {
    // A 90-minute job already at 11:00 holds 11:00–12:30.
    const busy = [{ start: ist('2026-11-09', '11:00:00'), durationMins: 90 }]
    const free = nextFreeTimes(garage({ busy }), { durationMins: 60, bookingType: 'dropin' }, MON_10AM)
    expect(free?.times).toEqual(
      ['12:30:00', '13:00:00', '13:30:00'].map((t) => ist('2026-11-09', t).toISOString())
    )
  })

  it("counts a job from the day before only on the day it overlaps", () => {
    // Started last night and still running at today's opening? Not here: it
    // ended at midnight, so today is untouched.
    const busy = [{ start: ist('2026-11-08', '22:00:00'), durationMins: 120 }]
    const free = nextFreeTimes(garage({ busy }), { durationMins: 60, bookingType: 'dropin' }, MON_10AM)
    expect(free?.day).toBe('today')
  })

  it('a full day cap moves it on to tomorrow', () => {
    const busy = [{ start: ist('2026-11-09', '09:00:00'), durationMins: 30 }]
    const free = nextFreeTimes(garage({ busy, jobsPerDay: 1 }), { durationMins: 60, bookingType: 'dropin' }, MON_10AM)
    expect(free?.day).toBe('tomorrow')
  })

  it('a paused garage has nothing, and neither does one shut all week', () => {
    expect(
      nextFreeTimes(garage({ pausedAt: new Date(MON_10AM) }), { durationMins: 60, bookingType: 'dropin' }, MON_10AM)
    ).toBeNull()
    expect(nextFreeTimes(garage({ hours: [] }), { durationMins: 60, bookingType: 'dropin' }, MON_10AM)).toBeNull()
  })

  it('a job longer than the day never fits', () => {
    expect(nextFreeTimes(garage(), { durationMins: 600, bookingType: 'dropin' }, MON_10AM)).toBeNull()
  })
})

describe('nextFreeWindow', () => {
  it('reads from the day before today to the end of the last day looked at', () => {
    const window = nextFreeWindow(MON_10AM)
    expect(window.first).toBe('2026-11-09')
    expect(window.last).toBe('2026-11-15')
    expect(window.from.toISOString()).toBe(ist('2026-11-08', '00:00:00').toISOString())
    expect(window.to.toISOString()).toBe(ist('2026-11-16', '00:00:00').toISOString())
    expect(NEXT_FREE_DAYS).toBe(7)
  })
})
