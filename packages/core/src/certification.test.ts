import { describe, expect, test } from 'bun:test'
import { CERTIFICATION_THRESHOLDS, dateKeyLabel, garageCheckLine } from './certification'
import { TIER_THRESHOLDS } from './tiers'

describe('Gold (Detlio Certified) in the apps', () => {
  test("the customer words' Gold numbers are Gold's (tiers.ts reads them, certification.ts keeps them)", () => {
    for (const [key, value] of Object.entries(TIER_THRESHOLDS.gold)) {
      const thresholds: Record<string, number> = CERTIFICATION_THRESHOLDS
      expect<unknown>({ key, value }).toEqual({ key, value: thresholds[key] })
    }
  })

  test('a date key reads as a date', () => {
    expect(dateKeyLabel('2026-10-31')).toBe('31 Oct 2026')
    expect(dateKeyLabel('2026-01-05')).toBe('5 Jan 2026')
    expect(dateKeyLabel('soon')).toBe('soon')
  })

  test("the garage's check line never names the checker or the notes", () => {
    expect(garageCheckLine({ status: 'passed', passedOn: '2026-09-01' })).toBe(
      'Passed Detlio’s quality check on 1 Sep 2026'
    )
    expect(garageCheckLine({ status: 'none', passedOn: null })).toContain('once you meet the standards')
    expect(garageCheckLine({ status: 'failed', passedOn: null })).toContain('did not pass')
    expect(garageCheckLine({ status: 'expired', passedOn: null })).toContain('due again')
  })
})
