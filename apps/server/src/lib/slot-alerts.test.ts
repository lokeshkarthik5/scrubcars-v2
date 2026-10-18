import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules.js'
import {
  alertDateProblem,
  alertDay,
  alertExpiresAt,
  alertLimitRefusal,
  askRefusal,
  datesHeld,
  firstOpening,
  inWindow,
  isAlertActive,
  MAX_ACTIVE_SLOT_ALERTS,
  SLOT_ALERT_MAX_DAYS_AHEAD,
  slotAlertPath,
  slotOpenedWords,
  takesBookingType,
  type AlertJob,
} from './slot-alerts.js'
import type { BusyInterval, DayFacts } from './slots.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const at = (time: string) => IST(`2026-10-24T${time}:00`)
const iso = (time: string) => at(time).toISOString()

// Saturday 24 Oct 2026, open 09:00–18:00, hour slots, one bay.
const DAY: DayFacts = {
  date: '2026-10-24',
  pausedAt: null,
  isHoliday: false,
  hours: { openTime: '09:00:00', closeTime: '18:00:00', isClosed: false },
  intervalMins: 60,
  bays: 1,
  jobsPerDay: null,
  busy: [],
}

// The evening before: every time that day has enough notice.
const EVENING_BEFORE = IST('2026-10-23T18:00:00').getTime()

/** One booking per hour from 09:00 to 17:00: the day is full at one bay. */
function fullDay(except: string[] = []): BusyInterval[] {
  return ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
    .filter((time) => !except.includes(time))
    .map((time) => ({ start: at(time), durationMins: 60 }))
}

const JOB: AlertJob = { durationMins: 60, bookingType: 'dropin', window: 'any' }

describe('windows', () => {
  test('a start counts in its window: start included, end not, in IST', () => {
    expect(inWindow(iso('06:00'), 'morning')).toBe(true)
    expect(inWindow(iso('11:30'), 'morning')).toBe(true)
    expect(inWindow(iso('12:00'), 'morning')).toBe(false)
    expect(inWindow(iso('12:00'), 'afternoon')).toBe(true)
    expect(inWindow(iso('16:59'), 'afternoon')).toBe(true)
    expect(inWindow(iso('17:00'), 'afternoon')).toBe(false)
    expect(inWindow(iso('17:00'), 'evening')).toBe(true)
    expect(inWindow(iso('21:30'), 'evening')).toBe(true)
    expect(inWindow(iso('22:00'), 'evening')).toBe(false)
    expect(inWindow(iso('05:30'), 'any')).toBe(true)
  })
})

describe('matching: the slot list’s own rule, then the window', () => {
  test('nothing free on a full day; one cancellation frees exactly its hour', () => {
    expect(firstOpening({ ...DAY, busy: fullDay() }, JOB, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, busy: fullDay(['14:00']) }, JOB, EVENING_BEFORE)).toBe(iso('14:00'))
  })

  test('the window: an afternoon opening does not answer a morning alert', () => {
    const facts = { ...DAY, busy: fullDay(['14:00']) }
    expect(firstOpening(facts, { ...JOB, window: 'morning' }, EVENING_BEFORE)).toBeNull()
    expect(firstOpening(facts, { ...JOB, window: 'afternoon' }, EVENING_BEFORE)).toBe(iso('14:00'))
    expect(firstOpening(facts, { ...JOB, window: 'evening' }, EVENING_BEFORE)).toBeNull()
  })

  test('the job’s length: a one-hour gap does not fit a two-hour job', () => {
    const facts = { ...DAY, busy: fullDay(['14:00']) }
    expect(firstOpening(facts, { ...JOB, durationMins: 120 }, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, busy: fullDay(['14:00', '15:00']) }, { ...JOB, durationMins: 120 }, EVENING_BEFORE)).toBe(
      iso('14:00')
    )
  })

  test('the notice per booking type: doorstep needs 3 hours, at the garage 1', () => {
    const facts = { ...DAY, busy: fullDay(['11:00']) }
    const tenAm = at('10:00').getTime() - 1
    // 11:00 is an hour away: fine at the garage, too soon for a doorstep crew.
    expect(firstOpening(facts, JOB, at('10:00').getTime())).toBe(iso('11:00'))
    expect(firstOpening(facts, { ...JOB, bookingType: 'doorstep' }, tenAm)).toBeNull()
    expect(firstOpening(facts, { ...JOB, bookingType: 'pickup' }, tenAm)).toBeNull()
    expect(firstOpening(facts, { ...JOB, bookingType: 'doorstep' }, at('08:00').getTime())).toBe(iso('11:00'))
  })

  test('the bays: a second bay frees every hour one car holds', () => {
    const busy = fullDay()
    expect(firstOpening({ ...DAY, busy, bays: 1 }, JOB, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, busy, bays: 2 }, JOB, EVENING_BEFORE)).toBe(iso('09:00'))
  })

  test("the day's cap: under it again after a cancellation", () => {
    const busy = [{ start: at('09:00'), durationMins: 60 }, { start: at('10:00'), durationMins: 60 }]
    expect(firstOpening({ ...DAY, busy, bays: 3, jobsPerDay: 2 }, JOB, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, busy: busy.slice(1), bays: 3, jobsPerDay: 2 }, JOB, EVENING_BEFORE)).toBe(iso('09:00'))
  })

  test('a holiday, a weekly off day or a pause offers nothing', () => {
    expect(firstOpening({ ...DAY, isHoliday: true }, JOB, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, hours: { ...DAY.hours!, isClosed: true } }, JOB, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, hours: null }, JOB, EVENING_BEFORE)).toBeNull()
    expect(firstOpening({ ...DAY, pausedAt: new Date() }, JOB, EVENING_BEFORE)).toBeNull()
  })

  test('the earliest of several openings is the one told', () => {
    expect(firstOpening({ ...DAY, busy: fullDay(['15:00', '10:00']) }, JOB, EVENING_BEFORE)).toBe(iso('10:00'))
  })
})

describe('whether an alert can be set', () => {
  const ask = (facts: DayFacts, job: AlertJob = JOB, now = EVENING_BEFORE) => askRefusal(alertDay(facts, job, now))

  test('a full day takes one', () => {
    expect(ask({ ...DAY, busy: fullDay() })).toBeNull()
  })

  test('a day with a time free in the window says book it instead', () => {
    expect(ask({ ...DAY, busy: fullDay(['14:00']) })).toBe('slot_free')
    // The free time is in the afternoon: a morning alert is still useful.
    expect(ask({ ...DAY, busy: fullDay(['14:00']) }, { ...JOB, window: 'morning' })).toBeNull()
  })

  test('a closed or paused day, or a job longer than the day, cannot open up', () => {
    expect(ask({ ...DAY, isHoliday: true })).toBe('closed')
    expect(ask({ ...DAY, hours: null })).toBe('closed')
    expect(ask({ ...DAY, pausedAt: new Date() })).toBe('paused')
    expect(ask(DAY, { ...JOB, durationMins: 600 })).toBe('too_long')
  })

  test('a window with no time left to give notice for cannot either', () => {
    // 16:30 on the day: only 17:00 has notice at the garage, and it is evening.
    const late = at('16:00').getTime()
    expect(ask({ ...DAY, busy: fullDay() }, { ...JOB, window: 'morning' }, late)).toBe('no_times')
    expect(ask({ ...DAY, busy: fullDay() }, { ...JOB, window: 'any' }, late)).toBeNull()
    // The garage shuts at 18:00: nothing starts in the evening window there.
    expect(ask({ ...DAY, busy: fullDay() }, { ...JOB, window: 'evening' })).toBeNull()
    expect(
      ask({ ...DAY, hours: { ...DAY.hours!, closeTime: '17:00:00' }, busy: fullDay() }, { ...JOB, window: 'evening' })
    ).toBe('no_times')
  })
})

describe('expiry, dates and the cap', () => {
  test('an alert lasts until its IST day is over', () => {
    expect(alertExpiresAt('2026-10-24').toISOString()).toBe(IST('2026-10-25T00:00:00').toISOString())
    const alert = { notifiedAt: null, expiresAt: alertExpiresAt('2026-10-24') }
    expect(isAlertActive(alert, IST('2026-10-24T23:59:59'))).toBe(true)
    expect(isAlertActive(alert, IST('2026-10-25T00:00:00'))).toBe(false)
    expect(isAlertActive({ ...alert, notifiedAt: new Date() }, IST('2026-10-24T09:00:00'))).toBe(false)
  })

  test('today up to SLOT_ALERT_MAX_DAYS_AHEAD days ahead, in IST', () => {
    // 00:30 IST on the 24th is still the 23rd in UTC.
    const now = IST('2026-10-24T00:30:00')
    expect(alertDateProblem('2026-10-23', now)).toBe('in_the_past')
    expect(alertDateProblem('2026-10-24', now)).toBeNull()
    expect(alertDateProblem('2026-12-23', now)).toBeNull()
    expect(SLOT_ALERT_MAX_DAYS_AHEAD).toBe(60)
    expect(alertDateProblem('2026-12-24', now)).toBe('too_far_ahead')
  })

  test(`at most ${MAX_ACTIVE_SLOT_ALERTS} waiting; changing the one for the same garage and day is not another`, () => {
    expect(alertLimitRefusal({ activeCount: MAX_ACTIVE_SLOT_ALERTS - 1, replacing: false })).toBeNull()
    expect(alertLimitRefusal({ activeCount: MAX_ACTIVE_SLOT_ALERTS, replacing: false })).toBe('limit')
    expect(alertLimitRefusal({ activeCount: MAX_ACTIVE_SLOT_ALERTS, replacing: true })).toBeNull()
  })
})

describe('the rest', () => {
  test('booking types the garage takes, pickup only with its terms', () => {
    const garage = { dropinEnabled: true, doorstepEnabled: false, pickup: 'yes' as const, pickupRadiusKm: null, pickupTermsAcceptedAt: null }
    expect(takesBookingType(garage, 'dropin')).toBe(true)
    expect(takesBookingType(garage, 'doorstep')).toBe(false)
    expect(takesBookingType(garage, 'pickup')).toBe(false)
    expect(takesBookingType({ ...garage, pickupTermsAcceptedAt: new Date() }, 'pickup')).toBe(true)
  })

  test('a booking frees its start’s day, and the next when it ran past midnight', () => {
    expect(datesHeld(IST('2026-10-24T10:00:00'), 60)).toEqual(['2026-10-24'])
    expect(datesHeld(IST('2026-10-24T23:00:00'), 60)).toEqual(['2026-10-24'])
    expect(datesHeld(IST('2026-10-24T23:00:00'), 90)).toEqual(['2026-10-24', '2026-10-25'])
    expect(datesHeld(IST('2026-10-24T23:00:00'), null)).toEqual(['2026-10-24'])
  })

  test('the link opens checkout with the same services, that day and that mode', () => {
    const alert = { vendorId: 'v1', date: '2026-10-24', bookingType: 'pickup' as const, serviceIds: ['s1', 's2'] }
    expect(slotAlertPath(alert)).toBe('/book/v1?service=s1%2Cs2&date=2026-10-24&mode=pickup')
    expect(slotAlertPath({ ...alert, bookingType: 'dropin' })).toBe('/book/v1?service=s1%2Cs2&date=2026-10-24')
  })

  test('the words: garage, day and time; no promise, nothing about the customer', () => {
    const words = slotOpenedWords('Marina Auto Spa', at('10:30'))
    expect(words).toEqual({ title: 'A slot opened at Marina Auto Spa', body: 'Sat 24 Oct — 10:30 AM. Book before it goes.' })
    expect(bannedPhraseIn(`${words.title} ${words.body}`)).toBeNull()
  })
})
