import { describe, expect, test } from 'bun:test'
import { BADGES } from './achievements.js'
import { BADGE_KEYS, DEFAULT_ACHIEVEMENT_SETTINGS, SETTINGS_LIMITS } from './rewards.js'

// The apps' twin (packages/core/src/achievements.ts), loaded by path at run
// time like rewards.parity.test.ts: the badge names, how each is earned,
// the goals, the defaults and the bonus limits must be the API's.
const coreUrl = new URL('../../../../packages/core/src/achievements.ts', import.meta.url).href

type Core = {
  BADGE_KEYS: readonly string[]
  BADGE_CATALOG: ReadonlyArray<{ key: string; label: string; howTo: string; goal: number }>
  DEFAULT_ACHIEVEMENT_SETTINGS: unknown
  BADGE_BONUS_LIMITS: { min: number; max: number }
}

describe('achievements parity', () => {
  test('keys, names, how to earn, goals, defaults and limits match', async () => {
    const core = (await import(coreUrl)) as Core
    expect([...core.BADGE_KEYS]).toEqual([...BADGE_KEYS])
    expect(core.BADGE_CATALOG).toEqual(BADGES.map(({ key, label, howTo, goal }) => ({ key, label, howTo, goal })))
    expect(core.DEFAULT_ACHIEVEMENT_SETTINGS).toEqual(DEFAULT_ACHIEVEMENT_SETTINGS)
    expect(core.BADGE_BONUS_LIMITS).toEqual({ ...SETTINGS_LIMITS.badgeBonusStamps })
  })
})
