import { describe, expect, it } from 'bun:test'
import type { GarageWeek } from './next-free.js'
import {
  NO_RECORD,
  RESCUE_RULES,
  garageRecord,
  rankRescue,
  rescueApplies,
  rescueDays,
  rescueReason,
  rescueScore,
  rescueTimes,
  usualAnswerMins,
  type RecordRow,
  type RescueCandidate,
} from './rescue-garages.js'

// Monday 9 November 2026, 08:00 IST. Every test runs on this clock.
const NOW = new Date('2026-11-09T08:00:00+05:30')
const ist = (date: string, time: string) => new Date(`${date}T${time}+05:30`)
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000)

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

function row(overrides: Partial<RecordRow> = {}): RecordRow {
  return {
    createdAt: daysAgo(5),
    paidAt: daysAgo(5),
    acceptedAt: null,
    acceptedBy: null,
    status: 'completed',
    cancelledBy: null,
    cancelledOnBehalfOf: null,
    noShow: null,
    cancelledAt: null,
    garageCancelledAt: null,
    ...overrides,
  }
}

/** A booking paid `at` and accepted `mins` later. */
function acceptedIn(mins: number, at: Date = daysAgo(3)): RecordRow {
  return row({ createdAt: at, paidAt: at, acceptedAt: new Date(at.getTime() + mins * 60_000), acceptedBy: 'u' })
}

describe('garageRecord', () => {
  it('the median answer time over its accepts, and how often it says yes', () => {
    const rows = [
      acceptedIn(4),
      acceptedIn(8),
      acceptedIn(12),
      row({ status: 'cancelled', cancelledBy: 'vendor', cancelledAt: daysAgo(2) }),
    ]
    const record = garageRecord(rows, NOW)
    expect(record.medianAnswerMins).toBe(8)
    expect(record.acceptRate).toBe(0.75)
    expect(record.recentCancels).toBe(0)
  })

  it('too little history says nothing rather than a guess', () => {
    const record = garageRecord([acceptedIn(5), acceptedIn(6)], NOW)
    expect(record.medianAnswerMins).toBeNull()
    expect(record.acceptRate).toBeNull()
  })

  it('a booking the customer cancelled before an answer, or never paid, is not an answer', () => {
    const rows = [
      acceptedIn(5),
      acceptedIn(5),
      acceptedIn(5),
      row({ status: 'cancelled', cancelledBy: 'user', cancelledAt: daysAgo(1) }),
      row({ status: 'cancelled', cancelledBy: 'vendor', paidAt: null }),
    ]
    expect(garageRecord(rows, NOW).acceptRate).toBe(1)
  })

  it('counts cancellations after accepting and garage no-shows in the last 30 days only', () => {
    const rows = [
      row({ status: 'cancelled', cancelledBy: 'vendor', acceptedAt: daysAgo(10), garageCancelledAt: daysAgo(9) }),
      row({ status: 'cancelled', cancelledBy: 'admin', noShow: 'garage', cancelledAt: daysAgo(3) }),
      row({ status: 'cancelled', cancelledBy: 'vendor', acceptedAt: daysAgo(60), garageCancelledAt: daysAgo(45) }),
    ]
    expect(garageRecord(rows, NOW).recentCancels).toBe(2)
  })
})

describe('usualAnswerMins', () => {
  it('rounds up to 5 minutes, never 0', () => {
    expect(usualAnswerMins({ medianAnswerMins: 0 })).toBe(5)
    expect(usualAnswerMins({ medianAnswerMins: 8 })).toBe(10)
    expect(usualAnswerMins({ medianAnswerMins: 10 })).toBe(10)
    expect(usualAnswerMins({ medianAnswerMins: 41 })).toBe(45)
  })

  it('says nothing when slower than an hour, or without history', () => {
    expect(usualAnswerMins({ medianAnswerMins: 61 })).toBeNull()
    expect(usualAnswerMins({ medianAnswerMins: null })).toBeNull()
  })
})

describe('rescueScore', () => {
  const base = { distanceKm: 2, record: NO_RECORD, rating: null }

  it('a fast, reliable, well-rated, near garage scores near the top', () => {
    const score = rescueScore({
      distanceKm: 0,
      record: { medianAnswerMins: 0, acceptRate: 1, recentCancels: 0 },
      rating: 5,
      nearness: 'near',
    })
    expect(score).toBe(100)
  })

  it('a quick answerer beats a slightly nearer slow one', () => {
    const quick = rescueScore({ ...base, distanceKm: 3, record: { medianAnswerMins: 5, acceptRate: 0.9, recentCancels: 0 } })
    const slow = rescueScore({ ...base, distanceKm: 2, record: { medianAnswerMins: 55, acceptRate: 0.5, recentCancels: 0 } })
    expect(quick).toBeGreaterThan(slow)
  })

  it('recent cancellations by the garage cost it, up to a cap', () => {
    const clean = rescueScore({ ...base })
    const one = rescueScore({ ...base, record: { ...NO_RECORD, recentCancels: 1 } })
    const many = rescueScore({ ...base, record: { ...NO_RECORD, recentCancels: 10 } })
    expect(clean - one).toBe(RESCUE_RULES.cancelPenalty)
    expect(clean - many).toBe(RESCUE_RULES.maxCancelPenalty)
  })

  it('no nearness (Request-a-visit) leaves the order to the rest', () => {
    const a = rescueScore({ ...base, distanceKm: 1 })
    const b = rescueScore({ ...base, distanceKm: 4 })
    expect(a).toBeGreaterThan(b)
  })

  it('a garage new on Detlio gets the middle mark, not zero', () => {
    const fresh = rescueScore({ ...base, rating: null })
    const poor = rescueScore({ ...base, rating: 3 })
    expect(fresh).toBeGreaterThan(poor)
  })
})

describe('rescueDays', () => {
  it('the original day and the next, or today and tomorrow once it has passed', () => {
    expect(rescueDays(ist('2026-11-12', '10:30:00'), NOW.getTime())).toEqual(['2026-11-12', '2026-11-13'])
    expect(rescueDays(ist('2026-11-07', '10:30:00'), NOW.getTime())).toEqual(['2026-11-09', '2026-11-10'])
  })
})

describe('rescueTimes', () => {
  const job = { durationMins: 60, bookingType: 'dropin' as const }

  it('the three free starts closest to the original time, earliest first', () => {
    const target = ist('2026-11-09', '13:00:00')
    const times = rescueTimes(garage(), job, target, NOW.getTime())
    expect(times).toEqual({
      day: 'today',
      times: ['12:30:00', '13:00:00', '13:30:00'].map((t) => ist('2026-11-09', t).toISOString()),
      near: target.toISOString(),
      nearness: 'near',
    })
  })

  it('a busy middle of the day still finds the closest room the same day', () => {
    const target = ist('2026-11-09', '13:00:00')
    const busy = [{ start: ist('2026-11-09', '10:00:00'), durationMins: 6 * 60 }]
    const times = rescueTimes(garage({ busy }), job, target, NOW.getTime())
    // 16:00 and 16:30 are 3 and 3.5 hours off, 9:00 is 4: the three closest.
    expect(times?.times).toEqual(['09:00:00', '16:00:00', '16:30:00'].map((t) => ist('2026-11-09', t).toISOString()))
    expect(times?.nearness).toBe('same_day')
  })

  it('the next day, at the same time of day, when the original day is full', () => {
    const target = ist('2026-11-09', '10:30:00')
    const closed = rescueTimes(garage({ closures: new Set(['2026-11-09']) }), job, target, NOW.getTime())
    expect(closed).toEqual({
      day: 'tomorrow',
      times: ['10:00:00', '10:30:00', '11:00:00'].map((t) => ist('2026-11-10', t).toISOString()),
      near: null,
      nearness: 'later',
    })
  })

  it('nothing from a paused garage, or one shut both days', () => {
    const target = ist('2026-11-09', '10:30:00')
    expect(rescueTimes(garage({ pausedAt: daysAgo(1) }), job, target, NOW.getTime())).toBeNull()
    const shut = garage({ closures: new Set(['2026-11-09', '2026-11-10']) })
    expect(rescueTimes(shut, job, target, NOW.getTime())).toBeNull()
  })

  it('times far from the original on its day are "same day", not near', () => {
    const target = ist('2026-11-09', '17:00:00')
    const busy = [{ start: ist('2026-11-09', '12:00:00'), durationMins: 6 * 60 }]
    const times = rescueTimes(garage({ busy }), job, target, NOW.getTime())
    expect(times?.nearness).toBe('same_day')
  })
})

describe('rankRescue', () => {
  const times = {
    day: 'today',
    times: [ist('2026-11-09', '11:00:00').toISOString()],
    near: null,
    nearness: 'near' as const,
  }
  const lines = [{ serviceId: 's', name: 'Wash', category: 'car_wash', amount: '499.00', durationMins: 60 }]
  const candidate = (vendorId: string, overrides: Partial<RescueCandidate> = {}): RescueCandidate => ({
    vendorId,
    distanceKm: 2,
    rating: 4.5,
    lines,
    times,
    record: NO_RECORD,
    ...overrides,
  })

  it('leaves out a garage without the job, without a time, or excluded', () => {
    const ranked = rankRescue(
      [candidate('a'), candidate('b', { lines: null }), candidate('c', { times: null }), candidate('d')],
      new Set(['d'])
    )
    expect(ranked.map((r) => r.vendorId)).toEqual(['a'])
  })

  it('at most three, best first; ties go to the nearer, then by id', () => {
    const ranked = rankRescue([
      candidate('far', { distanceKm: 9 }),
      candidate('b'),
      candidate('a'),
      candidate('near', { distanceKm: 1 }),
      candidate('fast', { distanceKm: 3, record: { medianAnswerMins: 2, acceptRate: 1, recentCancels: 0 } }),
    ])
    expect(ranked.map((r) => r.vendorId)).toEqual(['fast', 'near', 'a'])
  })
})

describe('rescueApplies', () => {
  const cancelled = { status: 'cancelled', cancelledBy: null, responseMissedAt: null }

  it('a garage that let its time run out, declined, cancelled or did not show', () => {
    expect(rescueApplies({ ...cancelled, cancelledBy: 'vendor', responseMissedAt: NOW })).toBe(true)
    expect(rescueApplies({ ...cancelled, cancelledBy: 'vendor' })).toBe(true)
    expect(rescueApplies({ ...cancelled, cancelledBy: 'admin', noShow: 'garage' })).toBe(true)
    expect(rescueApplies({ ...cancelled, cancelledBy: 'admin', cancelledOnBehalfOf: 'garage' })).toBe(true)
  })

  it('never the customer’s own cancellation, theirs through Detlio, or their no-show', () => {
    expect(rescueApplies({ ...cancelled, cancelledBy: 'user' })).toBe(false)
    expect(rescueApplies({ ...cancelled, cancelledBy: 'admin', cancelledOnBehalfOf: 'customer' })).toBe(false)
    expect(rescueApplies({ ...cancelled, cancelledBy: 'admin', noShow: 'customer' })).toBe(false)
    expect(rescueApplies({ status: 'confirmed', cancelledBy: null, responseMissedAt: null })).toBe(false)
  })

  it('names why', () => {
    expect(rescueReason({ responseMissedAt: NOW })).toBe('not_accepted')
    expect(rescueReason({ responseMissedAt: null })).toBe('declined')
  })
})
