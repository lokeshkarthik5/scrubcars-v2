import { describe, expect, it } from 'bun:test'
import {
  addDaysToDateKey,
  closureDateProblem,
  computeAvailableSlots,
  dayStatus,
  effectiveBays,
  effectiveDailyCap,
  filterByCapacity,
  filterByMinNotice,
  generateSlotStartTimes,
  hasCapacity,
  istDayBounds,
  meetsMinNotice,
  minNoticeMessage,
  peakOverlap,
  todayDateKey,
  type BusyInterval,
} from './slots.js'

// With several services in one booking, `serviceDurationMins` is their sum —
// which makes "does this booking fit the day at all?" a question the picker
// can now answer no to. These pin that behaviour down.

const OPEN_DAY = {
  date: '2026-09-01',
  openTime: '09:00:00',
  closeTime: '18:00:00',
  intervalMins: 60,
  isClosed: false,
}

describe('generateSlotStartTimes', () => {
  it('stops early enough that a full interval fits before closing', () => {
    const starts = generateSlotStartTimes('09:00:00', '12:00:00', 60)
    expect(starts).toEqual(['09:00:00', '10:00:00', '11:00:00'])
  })
})

describe('computeAvailableSlots', () => {
  it('offers every slot whose job finishes before closing', () => {
    const slots = computeAvailableSlots({ ...OPEN_DAY, serviceDurationMins: 60 })
    // 09:00 through 17:00 — a 60-minute job started at 17:00 ends exactly at
    // close, which counts.
    expect(slots).toHaveLength(9)
    expect(slots[0]).toBe(new Date('2026-09-01T09:00:00+05:30').toISOString())
  })

  it('drops the late slots a longer combined booking cannot finish', () => {
    // Three services at 90 minutes each: the last start that still fits a
    // 4h30m job in a 9am–6pm day is 13:30, and slots are hourly.
    const slots = computeAvailableSlots({
      ...OPEN_DAY,
      serviceDurationMins: 270,
    })
    expect(slots).toHaveLength(5)
    expect(slots.at(-1)).toBe(new Date('2026-09-01T13:00:00+05:30').toISOString())
  })

  it('offers nothing when the services cannot fit the day at all', () => {
    // This is the case that used to render an empty picker with no
    // explanation: the customer can retry all afternoon and never succeed.
    expect(
      computeAvailableSlots({ ...OPEN_DAY, serviceDurationMins: 600 })
    ).toEqual([])
  })

  it('offers nothing on a closed day', () => {
    expect(
      computeAvailableSlots({
        ...OPEN_DAY,
        isClosed: true,
        serviceDurationMins: 60,
      })
    ).toEqual([])
  })
})

describe('minimum notice', () => {
  // 10:15 IST on the open day, fixed so the tests do not read the clock.
  const NOW = new Date('2026-09-01T10:15:00+05:30').getTime()
  const day = computeAvailableSlots({ ...OPEN_DAY, intervalMins: 30, serviceDurationMins: 60 })
  const ist = (time: string) => new Date(`2026-09-01T${time}+05:30`).toISOString()

  it('offers at-garage slots from an hour out', () => {
    const slots = filterByMinNotice(day, 'dropin', NOW)
    expect(slots[0]).toBe(ist('11:30:00'))
  })

  it('offers doorstep slots from three hours out', () => {
    const slots = filterByMinNotice(day, 'doorstep', NOW)
    expect(slots[0]).toBe(ist('13:30:00'))
  })

  it('counts a start exactly on the line as enough notice', () => {
    expect(meetsMinNotice(new Date(NOW + 3_600_000), 'dropin', NOW)).toBe(true)
    expect(meetsMinNotice(new Date(NOW + 3_600_000 - 1), 'dropin', NOW)).toBe(false)
  })

  it('leaves a later day untouched', () => {
    const tomorrow = computeAvailableSlots({
      ...OPEN_DAY,
      date: '2026-09-02',
      serviceDurationMins: 60,
    })
    expect(filterByMinNotice(tomorrow, 'doorstep', NOW)).toEqual(tomorrow)
  })

  it('can empty a day whose job still fits, which is not "too long for the day"', () => {
    const lateEvening = new Date('2026-09-01T16:30:00+05:30').getTime()
    expect(day.length).toBeGreaterThan(0)
    expect(filterByMinNotice(day, 'dropin', lateEvening)).toEqual([])
  })

  it('reaches across midnight for a garage open early', () => {
    const late = new Date('2026-09-01T23:00:00+05:30').getTime()
    const early = computeAvailableSlots({
      date: '2026-09-02',
      openTime: '00:00:00',
      closeTime: '06:00:00',
      intervalMins: 60,
      isClosed: false,
      serviceDurationMins: 60,
    })
    const slots = filterByMinNotice(early, 'doorstep', late)
    expect(slots[0]).toBe(new Date('2026-09-02T02:00:00+05:30').toISOString())
  })

  it('says how much notice each kind of booking needs', () => {
    expect(minNoticeMessage('dropin')).toContain("at least 1 hour's notice")
    expect(minNoticeMessage('doorstep')).toContain('3 hours')
  })
})

// ─── Capacity ───────────────────────────────────────────────────────────────
//
// Every time here is IST on one fixed day, so nothing reads the clock.

const at = (time: string, date = '2026-09-01') => new Date(`${date}T${time}:00+05:30`)
const job = (time: string, durationMins: number, date?: string): BusyInterval => ({
  start: at(time, date),
  durationMins,
})

describe('effectiveBays and effectiveDailyCap', () => {
  it('reads an unset or zero bay count as one bay', () => {
    expect(effectiveBays(null)).toBe(1)
    expect(effectiveBays(undefined)).toBe(1)
    expect(effectiveBays(0)).toBe(1)
    expect(effectiveBays(3)).toBe(3)
  })

  it('reads an unset or zero daily cap as no cap at all', () => {
    expect(effectiveDailyCap(null)).toBeNull()
    expect(effectiveDailyCap(0)).toBeNull()
    expect(effectiveDailyCap(8)).toBe(8)
  })
})

describe('peakOverlap', () => {
  const window = (from: string, to: string) =>
    [at(from).getTime(), at(to).getTime()] as const

  it('does not count back-to-back jobs as overlapping', () => {
    // 9–10 then 10–11 touch a 9–11 window but use one bay between them.
    const busy = [job('09:00', 60), job('10:00', 60)]
    expect(peakOverlap(...window('09:00', '11:00'), busy)).toBe(1)
  })

  it('does not count a job that ends exactly when the window starts', () => {
    expect(peakOverlap(...window('10:00', '11:00'), [job('09:00', 60)])).toBe(0)
  })

  it('does not count a job that starts exactly when the window ends', () => {
    expect(peakOverlap(...window('09:00', '10:00'), [job('10:00', 60)])).toBe(0)
  })

  it('counts a partial overlap from either side', () => {
    expect(peakOverlap(...window('10:00', '11:00'), [job('09:30', 60)])).toBe(1)
    expect(peakOverlap(...window('10:00', '11:00'), [job('10:45', 60)])).toBe(1)
  })

  it('finds the peak where jobs pile up inside the window', () => {
    // One long job all morning, two short ones that overlap it at 10:30.
    const busy = [job('09:00', 180), job('10:00', 60), job('10:30', 30)]
    expect(peakOverlap(...window('09:00', '12:00'), busy)).toBe(3)
  })
})

describe('hasCapacity', () => {
  const rule = (busy: BusyInterval[], bays: number | null, jobsPerDay: number | null = null) => ({
    durationMins: 60,
    busy,
    bays,
    jobsPerDay,
  })

  it('lets a one-bay garage take the next job straight after the last', () => {
    expect(hasCapacity(at('10:00'), rule([job('09:00', 60)], 1))).toBe(true)
  })

  it('refuses a one-bay garage a job that overlaps one it already has', () => {
    expect(hasCapacity(at('09:30'), rule([job('09:00', 60)], 1))).toBe(false)
  })

  it('treats an unset bay count as one bay', () => {
    expect(hasCapacity(at('09:00'), rule([job('09:00', 30)], null))).toBe(false)
  })

  it('fills every bay before refusing', () => {
    const busy = [job('09:00', 60), job('09:00', 60)]
    expect(hasCapacity(at('09:00'), rule(busy, 3))).toBe(true)
    expect(hasCapacity(at('09:00'), rule(busy, 2))).toBe(false)
  })

  it('needs room for the whole length of a multi-service job', () => {
    // Free at 09:00, but a three-hour job runs into the 11:00 one.
    const busy = [job('11:00', 60)]
    expect(hasCapacity(at('09:00'), { ...rule(busy, 1), durationMins: 120 })).toBe(true)
    expect(hasCapacity(at('09:00'), { ...rule(busy, 1), durationMins: 180 })).toBe(false)
  })

  it('stops at the daily cap even with bays free', () => {
    const busy = [job('09:00', 30), job('12:00', 30)]
    expect(hasCapacity(at('15:00'), rule(busy, 5, 3))).toBe(true)
    expect(hasCapacity(at('15:00'), rule(busy, 5, 2))).toBe(false)
  })

  it('counts only that IST day towards the daily cap', () => {
    // 23:30 the night before overlaps nothing tomorrow morning and is on
    // another day, so it does not use up today's single job.
    const busy = [job('23:30', 30, '2026-08-31')]
    expect(hasCapacity(at('09:00'), rule(busy, 1, 1))).toBe(true)
  })

  it('still sees a late job from the day before that runs into this one', () => {
    // 23:00 on the 31st for three hours is in the bay until 02:00 on the 1st.
    const busy = [job('23:00', 180, '2026-08-31')]
    expect(hasCapacity(at('01:00'), rule(busy, 1))).toBe(false)
    expect(hasCapacity(at('02:00'), rule(busy, 1))).toBe(true)
  })
})

describe('filterByCapacity', () => {
  const day = computeAvailableSlots({ ...OPEN_DAY, intervalMins: 30, serviceDurationMins: 60 })
  const ist = (time: string) => at(time).toISOString()

  it('drops only the slots a one-bay garage is busy for', () => {
    const slots = filterByCapacity(day, {
      durationMins: 60,
      busy: [job('10:00', 60)],
      bays: 1,
      jobsPerDay: null,
    })
    // 09:30 would run into 10:00, and 10:00/10:30 overlap it; 09:00 ends at
    // 10:00 and 11:00 starts as it ends, so both stay.
    expect(slots).toContain(ist('09:00'))
    expect(slots).not.toContain(ist('09:30'))
    expect(slots).not.toContain(ist('10:00'))
    expect(slots).not.toContain(ist('10:30'))
    expect(slots).toContain(ist('11:00'))
    expect(slots).toHaveLength(day.length - 3)
  })

  it('empties the day once the daily cap is reached', () => {
    const slots = filterByCapacity(day, {
      durationMins: 60,
      busy: [job('09:00', 30), job('17:00', 30)],
      bays: 4,
      jobsPerDay: 2,
    })
    expect(slots).toEqual([])
  })

  it('leaves every slot when nothing is booked', () => {
    expect(
      filterByCapacity(day, { durationMins: 60, busy: [], bays: 1, jobsPerDay: 1 })
    ).toEqual(day)
  })
})

// ─── Holidays and pausing ───────────────────────────────────────────────────

describe('dayStatus', () => {
  const OPEN = { isClosed: false }

  it('is open on a working day', () => {
    expect(dayStatus({ pausedAt: null, isHoliday: false, hours: OPEN })).toEqual({ open: true })
  })

  it('closes a holiday even when the weekly hours say open', () => {
    expect(dayStatus({ pausedAt: null, isHoliday: true, hours: OPEN })).toEqual({
      open: false,
      reason: 'holiday',
    })
  })

  it('reads a closed or missing weekday as the weekly off day', () => {
    expect(dayStatus({ pausedAt: null, isHoliday: false, hours: { isClosed: true } })).toEqual({
      open: false,
      reason: 'weekly_off',
    })
    expect(dayStatus({ pausedAt: null, isHoliday: false, hours: null })).toEqual({
      open: false,
      reason: 'weekly_off',
    })
  })

  it('puts a pause ahead of everything else', () => {
    expect(
      dayStatus({ pausedAt: new Date('2026-09-01T00:00:00Z'), isHoliday: true, hours: OPEN })
    ).toEqual({ open: false, reason: 'paused' })
  })
})

describe('IST date keys', () => {
  it('adds days across a month and a year end', () => {
    expect(addDaysToDateKey('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('takes today in IST, not UTC', () => {
    // 20:00 UTC on the 1st is 01:30 on the 2nd in Chennai.
    expect(todayDateKey(new Date('2026-09-01T20:00:00Z').getTime())).toBe('2026-09-02')
  })

  it('bounds an IST day from its midnight to the next', () => {
    const { start, end } = istDayBounds('2026-09-01')
    expect(start.toISOString()).toBe('2026-08-31T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-09-01T18:30:00.000Z')
  })
})

describe('closureDateProblem', () => {
  const NOW = new Date('2026-09-01T10:00:00+05:30').getTime()

  it('accepts today and any day up to a year ahead', () => {
    expect(closureDateProblem('2026-09-01', NOW)).toBeNull()
    expect(closureDateProblem('2027-09-01', NOW)).toBeNull()
  })

  it('refuses a day already gone', () => {
    expect(closureDateProblem('2026-08-31', NOW)).toBe('in_the_past')
  })

  it('refuses a day more than a year out', () => {
    expect(closureDateProblem('2027-09-02', NOW)).toBe('too_far_ahead')
  })
})
