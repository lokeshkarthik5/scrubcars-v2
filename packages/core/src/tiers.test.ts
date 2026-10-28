import { describe, expect, test } from 'bun:test'
import {
  SILVER_FILTER_LABEL,
  TIERS,
  TIER_KEPT_LINE,
  TIER_STANDARDS,
  TIER_STEP_LINKS,
  progressLine,
  tierMedalName,
  tierStandards,
} from './tiers'

describe('tiers in the apps', () => {
  test('a medal is named for screen readers and tooltips', () => {
    expect(TIERS.map(tierMedalName)).toEqual(['Bronze garage', 'Silver garage', 'Gold garage'])
    expect(SILVER_FILTER_LABEL).toBe('Silver & above')
  })

  test('"What this means" says the numbers the server checks, and nothing it does not', () => {
    const silver = TIER_STANDARDS.silver.join(' ')
    for (const figure of ['4.2', '5 customers', '10 jobs', '90 days', '85%']) expect(silver).toContain(figure)
    const gold = TIER_STANDARDS.gold.join(' ')
    for (const figure of ['4.5', '10 customers', '20 jobs', '90%', '3 in 100', '180 days', '6 months']) {
      expect(gold).toContain(figure)
    }
    for (const line of Object.values(TIER_STANDARDS).flat()) {
      expect(line.toLowerCase()).not.toMatch(/certified|verified|guarantee/)
    }
    expect(TIER_KEPT_LINE).toContain('14 days')
  })

  test('a tier lists its own standards first, then every one below it', () => {
    expect(tierStandards('bronze').map((g) => g.tier)).toEqual(['bronze'])
    expect(tierStandards('gold').map((g) => g.tier)).toEqual(['gold', 'silver', 'bronze'])
  })

  test("the garage's progress line", () => {
    expect(progressLine({ tier: 'bronze', next: { tier: 'silver', done: 3, total: 5 } })).toBe(
      "You're Bronze. Next: Silver, 3 of 5 done."
    )
    expect(progressLine({ tier: null, next: { tier: 'bronze', done: 0, total: 1 } })).toBe(
      'No tier yet. Next: Bronze, 0 of 1 done.'
    )
    expect(progressLine({ tier: 'gold', next: null })).toBe("You're Gold. That's the top tier.")
  })

  test("each step's link goes where the garage can act", () => {
    expect(TIER_STEP_LINKS.agreement.href).toBe('/agreement')
    expect(TIER_STEP_LINKS.documents.href).toBe('/settings/documents')
  })
})
