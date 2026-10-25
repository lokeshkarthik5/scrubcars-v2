import { describe, expect, test } from 'bun:test'
import { levelLine, lifetimeLine, scratchPrizeLabel, stampsToGoLine, streakLine } from './rewards'

describe('rewards words', () => {
  test('stamps to go', () => {
    expect(stampsToGoLine(2)).toBe('2 more washes to your reward')
    expect(stampsToGoLine(1)).toBe('1 more wash to your reward')
    expect(stampsToGoLine(0)).toBe('Your reward is ready')
  })

  test('streak', () => {
    expect(streakLine({ months: 2, thisMonthDone: false, toBonus: 1 })).toBe('2-month streak — book this month to keep it')
    expect(streakLine({ months: 2, thisMonthDone: true, toBonus: 1 })).toBe('2-month streak — book next month for a bonus stamp')
    expect(streakLine({ months: 3, thisMonthDone: true, toBonus: 3 })).toBe('3-month streak — 3 more months for a bonus stamp')
    expect(streakLine({ months: 0, thisMonthDone: false, toBonus: 3 })).toBe('Book this month to start a streak')
  })

  test('level progress: keep beats reach', () => {
    expect(levelLine({ label: 'Gold', nextLabel: 'Platinum', toNext: 3, keep: { needed: 2, by: '2026-11-17' } })).toBe('2 more washes by 17 Nov to keep Gold')
    expect(levelLine({ label: 'Gold', nextLabel: 'Platinum', toNext: 1, keep: null })).toBe('1 more wash to reach Platinum')
    expect(levelLine({ label: 'Detlio Icon', nextLabel: null, toNext: null, keep: null })).toBe("You're at the top: Detlio Icon")
  })

  test('lifetime', () => {
    expect(lifetimeLine({ saved: '1240.00', washes: 14, since: 'Oct 2026' })).toBe("You've saved ₹1,240 with Detlio Rewards · 14 washes · since Oct 2026")
    expect(lifetimeLine({ saved: '0.00', washes: 1, since: null })).toBe("You've saved ₹0 with Detlio Rewards · 1 wash")
  })

  test('prizes', () => {
    expect(scratchPrizeLabel('big_off', '100.00')).toBe('₹100 off')
  })
})
