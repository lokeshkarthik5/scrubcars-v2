import { describe, expect, test } from 'bun:test'
import { DEFAULT_REWARDS_SETTINGS } from '@repo/core/rewards'
import {
  challengeFormProblems,
  challengePayload,
  challengeResultsCsv,
  emptyChallenge,
  ledgerCsv,
  monthLabel,
  parseRewardsTab,
  percentOf,
  recentMonths,
  settingsFormProblems,
  weightTotal,
  wrappedYearOptions,
} from './rewards'

describe('admin rewards helpers', () => {
  test('tabs and months', () => {
    expect(parseRewardsTab('settings')).toBe('settings')
    expect(parseRewardsTab('nope')).toBe('overview')
    expect(recentMonths(new Date('2026-01-15T00:00:00Z'), 3)).toEqual(['2026-01', '2025-12', '2025-11'])
    expect(monthLabel('2026-10')).toBe('October 2026')
    expect(percentOf(1, 4)).toBe('25%')
    expect(percentOf(1, 0)).toBe('—')
  })

  test('the settings form checks what the API checks', () => {
    expect(weightTotal(DEFAULT_REWARDS_SETTINGS.scratchWeights)).toBe(100)
    expect(settingsFormProblems(DEFAULT_REWARDS_SETTINGS)).toEqual([])
    const s = structuredClone(DEFAULT_REWARDS_SETTINGS)
    s.scratchWeights.small_off = 10
    s.levels[2].minBookings = 2
    expect(settingsFormProblems(s)).toEqual(['Scratch odds add up to 70, not 100', 'Gold must need more bookings than Silver'])
  })

  test('the ledger CSV: IST times, a header, formulas defused', () => {
    const csv = ledgerCsv({
      month: '2026-10',
      rows: [{ at: '2026-10-18T06:30:00Z', type: 'voucher', detail: 'shine · gold', amount: '349.00', userId: 'u1', name: '=Meena', phone: '••••••1234', bookingId: 'b1', state: 'unspent' }],
    })
    const [header, row] = csv.trim().split('\r\n')
    expect(header).toStartWith('When (IST),Type')
    expect(row).toStartWith('2026-10-18 12:00,voucher,shine · gold,349.00,unspent,\'=Meena')
  })
})

describe('challenges and Wrapped (0054)', () => {
  test('tabs', () => {
    expect(parseRewardsTab('challenges')).toBe('challenges')
    expect(parseRewardsTab('achievements')).toBe('achievements')
    expect(parseRewardsTab('wrapped')).toBe('wrapped')
  })

  test('a new challenge starts valid but for its title', () => {
    const blank = emptyChallenge(new Date('2026-10-18T06:30:00Z'))
    expect(blank).toMatchObject({ startDate: '2026-10-19', endDate: '2026-10-25', rewardKind: 'multiplier', rewardMultiplier: 2 })
    expect(challengeFormProblems(blank)).toEqual(['The title is 3–60 characters'])
    expect(challengeFormProblems({ ...blank, title: 'Diwali Shine' })).toEqual([])
  })

  test('a ₹ prize needs a winners cap; only the kind’s own field is sent', () => {
    const v = { ...emptyChallenge(), title: 'Monsoon Care', rewardKind: 'voucher' as const, rewardAmount: 100, maxWinners: null }
    expect(challengeFormProblems(v)).toEqual(['A ₹ prize needs a limit on winners'])
    expect(challengePayload({ ...v, maxWinners: 200 })).toMatchObject({ rewardAmount: 100, rewardMultiplier: null, rewardStamps: null })
  })

  test('results CSV: IST times, masked phones as given, formulas defused', () => {
    const csv = challengeResultsCsv([
      { userId: 'u1', name: '=Meena', phone: '••••••1234', counted: 3, firstCountedAt: '2026-11-05T04:30:00Z', wonAt: '2026-11-07T06:30:00Z', bonusStamps: 3, voucherAmount: null, voucherCode: null, voucherUsed: null },
    ])
    const [header, row] = csv.trim().split('\r\n')
    expect(header).toStartWith('Customer,Phone')
    expect(row).toBe("'=Meena,••••••1234,u1,3,2026-11-05 10:00,2026-11-07 12:00,3,,,")
  })

  test('Wrapped years from 2026', () => {
    expect(wrappedYearOptions(new Date('2027-03-01T00:00:00Z'))).toEqual([2027, 2026])
  })
})
