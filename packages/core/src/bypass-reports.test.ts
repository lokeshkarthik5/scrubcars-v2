import { describe, expect, test } from 'bun:test'
import { bannedPhraseIn } from './copy-rules'
import {
  BYPASS_ANONYMITY_LINE,
  BYPASS_KINDS,
  BYPASS_KIND_LABELS,
  BYPASS_QUESTION,
  BYPASS_THANKS_BODY,
  GARAGE_NON_SOLICITATION_LINE,
  bypassReportStatusLine,
  bypassRewardLine,
  strikesHighlighted,
  strikesLabel,
} from './bypass-reports'

describe('bypass report words', () => {
  test('the customer-facing lines pass the copy rules', () => {
    const lines = [
      BYPASS_QUESTION,
      BYPASS_ANONYMITY_LINE,
      BYPASS_THANKS_BODY,
      bypassRewardLine(),
      GARAGE_NON_SOLICITATION_LINE,
      ...BYPASS_KINDS.map((kind) => BYPASS_KIND_LABELS[kind]),
    ]
    for (const line of lines) expect({ line, banned: bannedPhraseIn(line) }).toEqual({ line, banned: null })
  })

  test('the reward line says the amount and once per garage', () => {
    expect(bypassRewardLine(100)).toBe('If we confirm it, we add ₹100 to your Detlio credit (once per garage).')
  })

  test('where a report stands, never why it was dismissed', () => {
    expect(bypassReportStatusLine({ status: 'new', reward: 'none' })).toContain('looking into it')
    expect(bypassReportStatusLine({ status: 'confirmed', reward: 'granted' })).toContain('₹100 added to your Detlio credit')
    expect(bypassReportStatusLine({ status: 'confirmed', reward: 'owed' })).toContain('on its way')
    expect(bypassReportStatusLine({ status: 'confirmed', reward: 'none' })).toBe(
      'We confirmed your report. Thank you for telling us.'
    )
    expect(bypassReportStatusLine({ status: 'dismissed', reward: 'none' })).toContain('We looked into it')
  })

  test("the garage's line is the agreed wording", () => {
    expect(GARAGE_NON_SOLICITATION_LINE).toBe(
      'Asking Detlio customers to book directly breaks your agreement and can lead to suspension.'
    )
  })

  test('strikes', () => {
    expect(strikesLabel(1)).toBe('1 strike')
    expect(strikesLabel(3)).toBe('3 strikes')
    expect(strikesHighlighted(1)).toBe(false)
    expect(strikesHighlighted(2)).toBe(true)
  })
})
