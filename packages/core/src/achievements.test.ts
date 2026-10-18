import { describe, expect, test } from 'bun:test'
import { achievementSettings, badgeProgressLine, BADGE_CATALOG, BADGE_KEYS, bonusStampsLine, DEFAULT_ACHIEVEMENT_SETTINGS } from './achievements'

describe('achievements words', () => {
  test('the catalog covers every badge, in order', () => {
    expect(BADGE_CATALOG.map((b) => b.key)).toEqual([...BADGE_KEYS])
  })

  test('settings: stored over the defaults', () => {
    expect(achievementSettings(null)).toEqual(DEFAULT_ACHIEVEMENT_SETTINGS)
    expect(achievementSettings({ achievements: { reviewer: { enabled: false, bonusStamps: 0 } } }).reviewer).toEqual({ enabled: false, bonusStamps: 0 })
  })

  test('lines', () => {
    expect(bonusStampsLine(0)).toBeNull()
    expect(bonusStampsLine(1)).toBe('A bonus stamp')
    expect(bonusStampsLine(3)).toBe('3 bonus stamps')
    expect(badgeProgressLine({ current: 7, goal: 5 })).toBe('5 of 5')
  })
})
