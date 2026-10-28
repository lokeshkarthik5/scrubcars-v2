import { describe, expect, test } from 'bun:test'
import * as server from './tiers.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The garage
// page's "What this means" sheet, the portal's "Your tier" card and admin say
// these numbers and words, so they must be the ones the server decides by.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

type Numbers = Record<string, number>

describe('tiers parity', () => {
  test('the tiers, their names and every threshold are the same', async () => {
    const core = (await import(coreUrl('tiers.ts'))) as {
      TIERS: readonly string[]
      TIER_LABELS: Record<string, string>
      TIER_THRESHOLDS: {
        agreementGraceDays: number
        graceDays: number
        silver: Numbers
        gold: Numbers
      }
      progressLine: (progress: server.TierProgress) => string
    }
    expect([...core.TIERS]).toEqual([...server.TIERS])
    expect(core.TIER_LABELS).toEqual(server.TIER_LABELS)
    expect(core.TIER_THRESHOLDS.agreementGraceDays).toBe(server.TIER_RULES.bronze.agreementGraceDays)
    expect(core.TIER_THRESHOLDS.graceDays).toBe(server.TIER_RULES.graceDays)
    expect(core.TIER_THRESHOLDS.silver).toEqual({ ...server.TIER_RULES.silver })
    for (const [key, value] of Object.entries(core.TIER_THRESHOLDS.gold)) {
      expect({ key, value }).toEqual({ key, value: (server.TIER_RULES.gold as unknown as Numbers)[key]! })
    }
  })

  test('the progress line reads the same', async () => {
    const core = (await import(coreUrl('tiers.ts'))) as { progressLine: (p: server.TierProgress) => string }
    const cases: server.TierProgress[] = [
      { tier: null, silverEligible: false, next: { tier: 'bronze', steps: [], done: 0, total: 1 }, keep: [] },
      { tier: 'bronze', silverEligible: false, next: { tier: 'silver', steps: [], done: 3, total: 5 }, keep: [] },
      { tier: 'gold', silverEligible: true, next: null, keep: [] },
    ]
    for (const progress of cases) expect(core.progressLine(progress)).toBe(server.progressLine(progress))
  })
})
