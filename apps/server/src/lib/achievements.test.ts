import { describe, expect, test } from 'bun:test'
import {
  BADGES,
  badgeCheckDayStart,
  badgeEarnedWords,
  badgeProgress,
  badgesToAward,
  inMonsoon,
  isCelebrationHour,
  longestMonthRun,
  type BadgeBooking,
  type BadgeFacts,
} from './achievements.js'
import { achievementSettings, BADGE_KEYS, DEFAULT_ACHIEVEMENT_SETTINGS, DEFAULT_REWARDS_SETTINGS, settingsProblems, type BadgeKey } from './rewards.js'

/** An IST wall-clock time as an instant. */
function ist(local: string): Date {
  return new Date(`${local}+05:30`)
}

let n = 0
function booking(over: Partial<BadgeBooking> = {}): BadgeBooking {
  n += 1
  return {
    rootBookingId: `b${n}`,
    startAt: ist('2026-10-10T10:00:00'),
    completedAt: ist('2026-10-10T11:00:00'),
    vendorId: 'g1',
    bookingType: 'dropin',
    categories: ['car_wash'],
    ...over,
  }
}

function facts(bookings: BadgeBooking[], over: Partial<Omit<BadgeFacts, 'bookings'>> = {}): BadgeFacts {
  return { bookings, reviews: 0, rewardedInvites: 0, ...over }
}

function times(count: number, make: (i: number) => Partial<BadgeBooking>): BadgeBooking[] {
  return Array.from({ length: count }, (_, i) => booking(make(i)))
}

const ALL_ON = achievementSettings(DEFAULT_REWARDS_SETTINGS)

/** Which badges facts reach, with nothing earned yet. */
function reached(f: BadgeFacts): BadgeKey[] {
  return badgesToAward(f, new Set(), ALL_ON).map((b) => b.key)
}

/** The month key of the Nth month after Jan 2026. */
function month(i: number): string {
  const index = 2026 * 12 + i
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

describe('the badge set', () => {
  test('every badge in the settings has a rule, in the same order, and nothing else', () => {
    expect(BADGES.map((b) => b.key)).toEqual([...BADGE_KEYS])
    expect(Object.keys(DEFAULT_ACHIEVEMENT_SETTINGS)).toEqual([...BADGE_KEYS])
  })

  test('nothing is reached with no bookings', () => {
    expect(reached(facts([]))).toEqual([])
  })
})

describe('First Shine and the Washes Clubs (lifetime eligible bookings)', () => {
  test('First Shine at the first booking', () => {
    expect(reached(facts([booking()]))).toContain('first_shine')
  })

  test.each([
    ['washes_5', 5],
    ['washes_25', 25],
    ['washes_50', 50],
    ['washes_100', 100],
  ] as const)('%s at %i, not one before', (key, goal) => {
    // Spread over days and garages so no other rule matters.
    const make = (i: number) => ({ completedAt: new Date(ist('2026-01-01T10:00:00').getTime() + i * 86400000) })
    expect(reached(facts(times(goal - 1, make)))).not.toContain(key)
    expect(reached(facts(times(goal, make)))).toContain(key)
  })
})

describe('Streaks: consecutive IST calendar months with a booking', () => {
  test('longestMonthRun counts the longest run, across a year end, ignoring repeats', () => {
    expect(longestMonthRun([])).toBe(0)
    expect(longestMonthRun(['2026-10'])).toBe(1)
    expect(longestMonthRun(['2026-11', '2026-12', '2027-01', '2027-01'])).toBe(3)
    expect(longestMonthRun(['2026-01', '2026-02', '2026-04', '2026-05', '2026-06'])).toBe(3)
  })

  test.each([
    ['streak_3', 3],
    ['streak_6', 6],
    ['streak_12', 12],
  ] as const)('%s at %i months in a row', (key, months) => {
    const run = (count: number) => times(count, (i) => ({ completedAt: ist(`${month(i)}-15T10:00:00`) }))
    expect(reached(facts(run(months - 1)))).not.toContain(key)
    expect(reached(facts(run(months)))).toContain(key)
  })

  test('a gap month breaks the run', () => {
    const gappy = ['2026-01', '2026-02', '2026-04', '2026-05'].map((m) => booking({ completedAt: ist(`${m}-15T10:00:00`) }))
    expect(reached(facts(gappy))).not.toContain('streak_3')
  })

  test('the month is the IST month of completion (31 Oct 23:00 IST is October)', () => {
    const edge = [
      booking({ completedAt: ist('2026-09-10T10:00:00') }),
      booking({ completedAt: ist('2026-10-31T23:00:00') }),
      booking({ completedAt: ist('2026-11-01T00:30:00') }),
    ]
    expect(reached(facts(edge))).toContain('streak_3')
  })
})

describe('Monsoon Shine: 2 washes between 1 June and 30 September (IST slot date), the same year', () => {
  test('the season by the slot IST date', () => {
    expect(inMonsoon(ist('2026-06-01T00:00:00'))).toBe(true)
    expect(inMonsoon(ist('2026-09-30T23:59:00'))).toBe(true)
    expect(inMonsoon(ist('2026-05-31T23:59:00'))).toBe(false)
    expect(inMonsoon(ist('2026-10-01T00:00:00'))).toBe(false)
  })

  test('two in one monsoon earns it; one in each of two years does not', () => {
    expect(reached(facts([booking({ startAt: ist('2026-07-01T10:00:00') }), booking({ startAt: ist('2026-09-30T18:00:00') })]))).toContain('monsoon_shine')
    expect(reached(facts([booking({ startAt: ist('2026-07-01T10:00:00') }), booking({ startAt: ist('2027-07-01T10:00:00') })]))).not.toContain('monsoon_shine')
    expect(reached(facts([booking({ startAt: ist('2026-07-01T10:00:00') }), booking({ startAt: ist('2026-10-01T10:00:00') })]))).not.toContain('monsoon_shine')
  })
})

describe('Early Bird and Night Owl: 5 washes by the slot start time (IST)', () => {
  test('Early Bird: starts before 8 am; 8:00 sharp does not count', () => {
    expect(reached(facts(times(5, () => ({ startAt: ist('2026-10-10T07:59:00') }))))).toContain('early_bird')
    expect(reached(facts(times(4, () => ({ startAt: ist('2026-10-10T07:00:00') }))))).not.toContain('early_bird')
    expect(reached(facts(times(5, () => ({ startAt: ist('2026-10-10T08:00:00') }))))).not.toContain('early_bird')
  })

  test('Night Owl: starts at 7 pm or later; 6:59 pm does not count', () => {
    expect(reached(facts(times(5, () => ({ startAt: ist('2026-10-10T19:00:00') }))))).toContain('night_owl')
    expect(reached(facts(times(5, () => ({ startAt: ist('2026-10-10T18:59:00') }))))).not.toContain('night_owl')
  })

  test('the clock is IST, not UTC (06:30 IST is 01:00 UTC)', () => {
    expect(reached(facts(times(5, () => ({ startAt: new Date('2026-10-10T01:00:00Z') }))))).toContain('early_bird')
  })
})

describe('garages', () => {
  test('Explorer: 3 different garages', () => {
    expect(reached(facts([booking({ vendorId: 'a' }), booking({ vendorId: 'b' }), booking({ vendorId: 'a' })]))).not.toContain('explorer')
    expect(reached(facts([booking({ vendorId: 'a' }), booking({ vendorId: 'b' }), booking({ vendorId: 'c' })]))).toContain('explorer')
  })

  test('Loyal Regular: 10 at the same garage (not 10 spread over two)', () => {
    expect(reached(facts(times(10, () => ({ vendorId: 'a' }))))).toContain('loyal_regular')
    expect(reached(facts(times(10, (i) => ({ vendorId: i % 2 ? 'a' : 'b' }))))).not.toContain('loyal_regular')
  })
})

describe('booking types and categories', () => {
  test('Pickup Pro: 3 pickup & drop', () => {
    expect(reached(facts(times(3, () => ({ bookingType: 'pickup' }))))).toContain('pickup_pro')
    expect(reached(facts(times(2, () => ({ bookingType: 'pickup' }))))).not.toContain('pickup_pro')
  })

  test('Doorstep Devotee: 5 doorstep', () => {
    expect(reached(facts(times(5, () => ({ bookingType: 'doorstep' }))))).toContain('doorstep_devotee')
    expect(reached(facts(times(4, () => ({ bookingType: 'doorstep' }))))).not.toContain('doorstep_devotee')
  })

  test("Detailing Devotee: 3 jobs with detailing (a package's members count)", () => {
    expect(reached(facts(times(3, () => ({ categories: ['package', 'detailing'] }))))).toContain('detailing_devotee')
    expect(reached(facts(times(2, () => ({ categories: ['detailing'] }))))).not.toContain('detailing_devotee')
  })

  test('Coating Club: one coating job', () => {
    expect(reached(facts([booking({ categories: ['coating'] })]))).toContain('coating_club')
    expect(reached(facts([booking({ categories: ['car_wash'] })]))).not.toContain('coating_club')
  })
})

describe('reviews and invites', () => {
  test('Reviewer: 5 reviews', () => {
    expect(reached(facts([], { reviews: 5 }))).toContain('reviewer')
    expect(reached(facts([], { reviews: 4 }))).not.toContain('reviewer')
  })

  test('Ambassador: 3 rewarded invites', () => {
    expect(reached(facts([], { rewardedInvites: 3 }))).toContain('ambassador')
    expect(reached(facts([], { rewardedInvites: 2 }))).not.toContain('ambassador')
  })
})

describe('awarding', () => {
  test('a badge earned is never awarded again (once per customer)', () => {
    const f = facts(times(5, () => ({})))
    const first = badgesToAward(f, new Set(), ALL_ON).map((b) => b.key)
    expect(first).toEqual(expect.arrayContaining(['first_shine', 'washes_5']))
    const again = badgesToAward(f, new Set(first), ALL_ON)
    expect(again).toEqual([])
  })

  test('a badge switched off is not awarded; switched back on, it is', () => {
    const off = achievementSettings({ achievements: { first_shine: { enabled: false, bonusStamps: 1 } } })
    expect(badgesToAward(facts([booking()]), new Set(), off).map((b) => b.key)).not.toContain('first_shine')
    expect(badgesToAward(facts([booking()]), new Set(), ALL_ON).map((b) => b.key)).toContain('first_shine')
  })

  test('each award carries the bonus stamps the settings give', () => {
    const custom = achievementSettings({ achievements: { first_shine: { enabled: true, bonusStamps: 3 } } })
    expect(badgesToAward(facts([booking()]), new Set(), custom)).toEqual([{ key: 'first_shine', bonusStamps: 3 }])
  })

  test('progress is capped at the goal', () => {
    expect(badgeProgress('washes_5', facts(times(7, () => ({}))))).toEqual({ current: 5, goal: 5 })
    expect(badgeProgress('explorer', facts([booking({ vendorId: 'a' })]))).toEqual({ current: 1, goal: 3 })
  })
})

describe('settings', () => {
  test('a badge left out reads as its default; stored values win', () => {
    const s = achievementSettings({ achievements: { reviewer: { enabled: false, bonusStamps: 0 } } })
    expect(s.reviewer).toEqual({ enabled: false, bonusStamps: 0 })
    expect(s.first_shine).toEqual(DEFAULT_ACHIEVEMENT_SETTINGS.first_shine)
    expect(achievementSettings({})).toEqual(DEFAULT_ACHIEVEMENT_SETTINGS)
  })

  test('version 1 (no achievements) still passes; bonus stamps are 0 to 5', () => {
    expect(settingsProblems(DEFAULT_REWARDS_SETTINGS)).toEqual([])
    expect(settingsProblems({ ...DEFAULT_REWARDS_SETTINGS, achievements: DEFAULT_ACHIEVEMENT_SETTINGS })).toEqual([])
    const bad = settingsProblems({ ...DEFAULT_REWARDS_SETTINGS, achievements: { washes_5: { enabled: true, bonusStamps: 6 } } })
    expect(bad.join()).toContain('bonus stamps')
  })
})

describe('celebrations', () => {
  test('words name the badge and the bonus, nothing about the customer', () => {
    expect(badgeEarnedWords('First Shine', 1)).toEqual({ title: 'Badge earned: First Shine', body: 'Nice one. A bonus stamp is on your Shine Card.' })
    expect(badgeEarnedWords('Explorer', 0).body).toBe('Nice one.')
    expect(badgeEarnedWords('100 Washes Club', 5).body).toContain('5 bonus stamps')
  })

  test('pushed 08:00–20:59 IST; at night it waits', () => {
    expect(isCelebrationHour(ist('2026-10-10T08:00:00'))).toBe(true)
    expect(isCelebrationHour(ist('2026-10-10T20:59:00'))).toBe(true)
    expect(isCelebrationHour(ist('2026-10-10T21:00:00'))).toBe(false)
    expect(isCelebrationHour(ist('2026-10-10T07:59:00'))).toBe(false)
  })

  test("the nightly pass's day starts at 02:00 IST", () => {
    expect(badgeCheckDayStart(ist('2026-10-10T09:00:00'))).toEqual(ist('2026-10-10T02:00:00'))
    expect(badgeCheckDayStart(ist('2026-10-10T01:30:00'))).toEqual(ist('2026-10-09T02:00:00'))
  })
})
