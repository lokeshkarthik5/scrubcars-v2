import { describe, expect, test } from 'bun:test'
import {
  BYPASS_KINDS,
  BYPASS_KIND_LABELS,
  BYPASS_RULES,
  REWARD_PAISE,
  isStrike,
  reachedStrikeAlert,
  reportWindowEndsAt,
  reportWindowRefusal,
  reportsLeft,
  rewardDecision,
  rewardReason,
  strikeWindowStart,
  strikesHighlighted,
  strikesOf,
  submitRefusal,
  yearStart,
  type ReportableBooking,
} from './bypass-reports.js'

const NOW = new Date('2026-10-18T06:30:00.000Z') // 12:00 IST, Sun 18 Oct 2026
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

const booking = (over: Partial<ReportableBooking>): ReportableBooking => ({
  status: 'confirmed',
  acceptedAt: daysAgo(2),
  completedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  scheduledAt: daysAgo(1),
  ...over,
})

describe('which bookings can be reported', () => {
  test('not before the garage accepted it', () => {
    expect(reportWindowRefusal(booking({ status: 'pending', acceptedAt: null }), NOW)).toBe('not_accepted')
  })

  test('from acceptance onwards, while the job is on', () => {
    expect(reportWindowRefusal(booking({ status: 'confirmed' }), NOW)).toBeNull()
    expect(reportWindowRefusal(booking({ status: 'in_progress' }), NOW)).toBeNull()
    // A row from before accepted_at was kept: the status says it.
    expect(reportWindowRefusal(booking({ status: 'confirmed', acceptedAt: null }), NOW)).toBeNull()
  })

  test('until 30 days after completion, then closed', () => {
    expect(reportWindowRefusal(booking({ status: 'completed', completedAt: daysAgo(29) }), NOW)).toBeNull()
    expect(reportWindowRefusal(booking({ status: 'completed', completedAt: daysAgo(30) }), NOW)).toBeNull()
    expect(reportWindowRefusal(booking({ status: 'completed', completedAt: daysAgo(31) }), NOW)).toBe('window_closed')
  })

  test('a pickup job counts from its delivery, an old row from its slot', () => {
    expect(
      reportWindowEndsAt(booking({ status: 'completed', completedAt: null, deliveredAt: daysAgo(5) }))
    ).toEqual(new Date(daysAgo(5).getTime() + 30 * DAY))
    expect(
      reportWindowRefusal(booking({ status: 'completed', completedAt: null, scheduledAt: daysAgo(40) }), NOW)
    ).toBe('window_closed')
  })

  test('cancelled after the garage accepted: 30 days from the cancellation', () => {
    expect(reportWindowRefusal(booking({ status: 'cancelled', cancelledAt: daysAgo(10) }), NOW)).toBeNull()
    expect(reportWindowRefusal(booking({ status: 'cancelled', cancelledAt: daysAgo(31) }), NOW)).toBe('window_closed')
  })

  test('declined, or cancelled before the garage accepted: never', () => {
    expect(
      reportWindowRefusal(booking({ status: 'cancelled', acceptedAt: null, cancelledAt: daysAgo(1) }), NOW)
    ).toBe('not_accepted')
    expect(reportWindowRefusal(booking({ status: 'something_else' }), NOW)).toBe('not_accepted')
  })
})

describe('report limits', () => {
  test('one per booking', () => {
    expect(submitRefusal({ window: null, alreadyReported: true, inLastYear: 0 })).toBe('already_reported')
  })

  test('at most 5 in any 365 days', () => {
    expect(submitRefusal({ window: null, alreadyReported: false, inLastYear: 4 })).toBeNull()
    expect(submitRefusal({ window: null, alreadyReported: false, inLastYear: 5 })).toBe('limit_reached')
    expect(submitRefusal({ window: null, alreadyReported: false, inLastYear: 9 })).toBe('limit_reached')
    expect(reportsLeft(3)).toBe(2)
    expect(reportsLeft(7)).toBe(0)
    expect(yearStart(NOW)).toEqual(daysAgo(365))
  })

  test("the booking's window is said first", () => {
    expect(submitRefusal({ window: 'window_closed', alreadyReported: true, inLastYear: 5 })).toBe('window_closed')
    expect(submitRefusal({ window: null, alreadyReported: true, inLastYear: 5 })).toBe('already_reported')
  })

  test('every kind has a label', () => {
    for (const kind of BYPASS_KINDS) expect(BYPASS_KIND_LABELS[kind].length).toBeGreaterThan(5)
  })
})

describe('the reward', () => {
  test('₹100, granted while Detlio credit is on', () => {
    expect(REWARD_PAISE).toBe(10_000)
    expect(rewardDecision({ hasAccount: true, hasGarage: true, alreadyRewarded: false, creditOn: true })).toEqual({ kind: 'grant' })
  })

  test('owed while credit is off', () => {
    expect(rewardDecision({ hasAccount: true, hasGarage: true, alreadyRewarded: false, creditOn: false })).toEqual({ kind: 'owe' })
  })

  test('once per customer per garage', () => {
    expect(rewardDecision({ hasAccount: true, hasGarage: true, alreadyRewarded: true, creditOn: true })).toEqual({
      kind: 'none',
      why: 'already_rewarded',
    })
    expect(rewardDecision({ hasAccount: true, hasGarage: true, alreadyRewarded: true, creditOn: false })).toEqual({
      kind: 'none',
      why: 'already_rewarded',
    })
  })

  test('nothing for a deleted account', () => {
    expect(rewardDecision({ hasAccount: false, hasGarage: true, alreadyRewarded: false, creditOn: true })).toEqual({
      kind: 'none',
      why: 'no_account',
    })
  })

  test('nothing once the garage was deleted forever (once per garage can no longer be told)', () => {
    expect(rewardDecision({ hasAccount: true, hasGarage: false, alreadyRewarded: false, creditOn: true })).toEqual({
      kind: 'none',
      why: 'no_garage',
    })
  })

  test("the ledger's reason names the booking, never the garage or the customer", () => {
    expect(rewardReason('3f2a9c1b')).toBe('Report about booking #3f2a9c1b confirmed by Detlio')
    expect(rewardReason(null)).toBe('Report confirmed by Detlio')
  })
})

describe('strikes', () => {
  const confirmed = (days: number, extra: { bookingMarkedTest?: boolean } = {}) => ({
    status: 'confirmed' as const,
    confirmedAt: daysAgo(days),
    ...extra,
  })

  test('the window is 180 IST days, today included', () => {
    // 18 Oct 2026 IST, 179 days back: 22 Apr 2026, from 00:00 IST.
    expect(strikeWindowStart(NOW).toISOString()).toBe('2026-04-21T18:30:00.000Z')
  })

  test('confirmed reports in the window count; older ones, new and dismissed ones do not', () => {
    expect(isStrike(confirmed(0), NOW)).toBe(true)
    expect(isStrike(confirmed(179), NOW)).toBe(true)
    expect(isStrike(confirmed(181), NOW)).toBe(false)
    expect(isStrike({ status: 'new', confirmedAt: null }, NOW)).toBe(false)
    expect(isStrike({ status: 'dismissed', confirmedAt: null }, NOW)).toBe(false)
  })

  test('a Test-marked booking is left out', () => {
    expect(isStrike(confirmed(3, { bookingMarkedTest: true }), NOW)).toBe(false)
    expect(strikesOf([confirmed(1), confirmed(2, { bookingMarkedTest: true }), confirmed(200)], NOW)).toBe(1)
  })

  test('two or more are highlighted, and reaching two is told once', () => {
    expect(strikesHighlighted(1)).toBe(false)
    expect(strikesHighlighted(BYPASS_RULES.strikeAlertAt)).toBe(true)
    expect(reachedStrikeAlert(1, 2)).toBe(true)
    expect(reachedStrikeAlert(0, 1)).toBe(false)
    expect(reachedStrikeAlert(2, 3)).toBe(false)
  })
})
