import { describe, expect, test } from 'bun:test'
import {
  challengeWinsLine,
  levelLine,
  lifetimeLine,
  rewardDate,
  rewardRupees,
  scratchPrizeLabel,
  stampsToGoLine,
  streakLine,
} from './rewards'

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
    // "since Oct 2026" is held together with no-break spaces, so "Oct 2026" never wraps alone.
    expect(lifetimeLine({ saved: '1240.00', washes: 14, since: 'Oct 2026' })).toBe(
      "You've saved ₹1,240 with Detlio Rewards · 14 washes · since\u00a0Oct\u00a02026"
    )
    expect(lifetimeLine({ saved: '0.00', washes: 1, since: null })).toBe("You've saved ₹0 with Detlio Rewards · 1 wash")
  })

  test('prizes', () => {
    expect(scratchPrizeLabel('big_off', '100.00')).toBe('₹100 off')
    expect(scratchPrizeLabel('free_wash', '1500.00')).toBe('A free wash (up to ₹1,500)')
  })

  test('rupees are grouped the Indian way, whole', () => {
    expect(rewardRupees(1500)).toBe('₹1,500')
    expect(rewardRupees('125000.00')).toBe('₹1,25,000')
    expect(rewardRupees('299.40')).toBe('₹299')
    expect(rewardRupees(null)).toBe('₹0')
  })

  test('dates say "Sep", in India time', () => {
    expect(rewardDate('2026-09-14T06:00:00Z')).toBe('14 Sep 2026')
    // 20:00 UTC on 30 Sep is already 1 Oct in India.
    expect(rewardDate('2026-09-30T20:00:00Z')).toBe('1 Oct 2026')
  })

  test('a challenge: the verb agrees with the count', () => {
    expect(challengeWinsLine({ counts: '3 washes', goal: 3, reward: 'double stamps' })).toBe('3 washes win double stamps')
    expect(challengeWinsLine({ counts: '1 coating job', goal: 1, reward: '₹1,500 off' })).toBe('1 coating job wins ₹1,500 off')
  })
})
