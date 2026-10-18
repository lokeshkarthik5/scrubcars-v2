import { describe, expect, test } from 'bun:test'
import {
  bypassFilterHint,
  bypassListHref,
  dropOffRulesLine,
  parseBypassFilter,
  quietLine,
  ratePercent,
} from './bypass-reports'

describe('the chips', () => {
  test('New unless the URL names another', () => {
    expect(parseBypassFilter(null)).toBe('new')
    expect(parseBypassFilter('confirmed')).toBe('confirmed')
    expect(parseBypassFilter('dismissed')).toBe('dismissed')
    expect(parseBypassFilter('all')).toBe('new')
  })

  test('the default chip has the bare path', () => {
    expect(bypassListHref('new')).toBe('/bypass-reports')
    expect(bypassListHref('confirmed')).toBe('/bypass-reports?show=confirmed')
  })

  test('the New hint says what confirming does, and when the reward waits', () => {
    const on = bypassFilterHint('new', { rewardAmount: '100.00', strikeWindowDays: 180, creditOn: true })
    expect(on).toContain('₹100')
    expect(on).not.toContain('owed')
    expect(bypassFilterHint('new', { rewardAmount: '100.00', strikeWindowDays: 180, creditOn: false })).toContain(
      'owed until credit is on'
    )
    expect(bypassFilterHint('confirmed', undefined)).toContain('180 days')
  })
})

describe('drop-off words', () => {
  test('rates are whole percent, rounded down', () => {
    expect(ratePercent(0.3)).toBe('30%')
    expect(ratePercent(1 / 3)).toBe('33%')
    expect(ratePercent(0.299)).toBe('29%')
  })

  test('the rules read from the numbers sent', () => {
    expect(
      dropOffRulesLine({
        regularMinCompleted: 3,
        regularWindowDays: 180,
        historyDays: 365,
        quietMultiplier: 2,
        minQuietDays: 30,
        flagRate: 0.3,
        flagMinRegulars: 3,
      })
    ).toBe(
      'A regular completed 3+ bookings at the garage in the last 180 days. They went quiet when they have booked nothing anywhere on Detlio for over 2× their usual gap (at least 30 days). Flagged: 30% or more of 3+ regulars.'
    )
  })

  test('a quiet regular’s line', () => {
    expect(quietLine({ usualGapDays: 14, quietDays: 62, thresholdDays: 30 })).toBe('Usually every 14 days · quiet 62 days (over 30)')
    expect(quietLine({ usualGapDays: 12.5, quietDays: 40, thresholdDays: 30 })).toBe('Usually every 12.5 days · quiet 40 days (over 30)')
  })
})
