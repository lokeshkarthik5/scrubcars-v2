import { describe, expect, test } from 'bun:test'
import { DEFAULT_REWARDS_SETTINGS } from '@repo/core/rewards'
import { ledgerCsv, monthLabel, parseRewardsTab, percentOf, recentMonths, settingsFormProblems, weightTotal } from './rewards'

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
