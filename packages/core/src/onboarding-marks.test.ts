import { describe, expect, test } from 'bun:test'
import {
  collectionProgress,
  isMarkKind,
  isMissingKey,
  MARK_LIMITS,
  MARK_PRESETS,
  markLabel,
  MISSING_ASKS,
  MISSING_KEYS,
  MISSING_LABELS,
  MISSING_TABS,
} from './onboarding-marks'

describe('missing keys', () => {
  test('every key has a label, a tab and an ask', () => {
    for (const key of MISSING_KEYS) {
      expect(MISSING_LABELS[key].length).toBeGreaterThan(0)
      expect(MISSING_TABS[key]).toBeDefined()
      expect(MISSING_ASKS[key].length).toBeGreaterThan(0)
    }
    expect(MISSING_TABS.payout).toBe('team')
    expect(MISSING_TABS.documents).toBe('documents')
  })

  test('only known keys pass, as from a ?missing= link', () => {
    expect(isMissingKey('photos')).toBe(true)
    expect(isMissingKey('custom')).toBe(false)
    expect(isMissingKey('PHOTOS')).toBe(false)
    expect(isMissingKey(undefined)).toBe(false)
    expect(isMarkKind('custom')).toBe(true)
    expect(isMarkKind('payout')).toBe(true)
    expect(isMarkKind('call_back')).toBe(false)
  })
})

describe('markLabel', () => {
  test('its own label first, else the missing key’s', () => {
    expect(markLabel('radius_default', ' Ask for radius ')).toBe('Ask for radius')
    expect(markLabel('photos', null)).toBe('Photos')
    expect(markLabel('custom', 'Call back')).toBe('Call back')
    expect(markLabel('custom', '  ')).toBe('Mark')
  })

  test('the presets fit the label column', () => {
    for (const preset of MARK_PRESETS) {
      expect(preset.label.length).toBeLessThanOrEqual(MARK_LIMITS.labelMax)
      expect(isMarkKind(preset.kind)).toBe(true)
    }
  })
})

describe('collectionProgress', () => {
  test('collected or cleared counts as done', () => {
    expect(
      collectionProgress([
        { status: 'collected', cleared: false },
        { status: 'to_collect', cleared: true },
        { status: 'to_collect', cleared: false },
      ])
    ).toEqual({ done: 2, total: 3 })
    expect(collectionProgress([])).toEqual({ done: 0, total: 0 })
  })
})
