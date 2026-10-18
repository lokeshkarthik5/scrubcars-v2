import { describe, expect, test } from 'bun:test'
import { CERTIFIED_STANDARDS, dateKeyLabel, garageCheckLine } from './certification'

describe('Detlio Certified words', () => {
  test('the standards say the numbers, and never claim photos before they are measured', () => {
    const text = CERTIFIED_STANDARDS.join(' ')
    for (const figure of ['4.5', '10 customers', '20 jobs', '90 days', '90%', '3 in 100', '6 months']) {
      expect(text).toContain(figure)
    }
    expect(text).not.toMatch(/photo/i)
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
