import { describe, expect, test } from 'bun:test'
import { FREE_WASH_RULES, REFERRAL_CREDIT } from './area-signups.js'

const coreUrl = new URL('../../../../packages/core/src/area-signups.ts', import.meta.url).href

describe('area sign-ups: the apps say the server’s numbers', () => {
  test('the free wash, the honest count, the card’s closes and the referral credit', async () => {
    const core = (await import(coreUrl)) as {
      FREE_WASH_RULES: Record<string, number>
      REFERRAL_CREDIT: Record<string, number>
    }
    for (const key of ['perZone', 'maxRupees', 'validDays', 'honestCountFrom', 'closedForDays', 'maxCloses'] as const) {
      expect(core.FREE_WASH_RULES[key]).toBe(FREE_WASH_RULES[key])
    }
    expect(core.REFERRAL_CREDIT).toEqual({ ...REFERRAL_CREDIT })
  })
})
