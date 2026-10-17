import { describe, expect, test } from 'bun:test'
import { previousRange, rangeDays } from './stats.js'

// The admin page's twin lives in packages/core, which the server does not
// depend on. Loaded by path at run time, as copy-rules.parity.test.ts does.
const coreUrl = new URL('../../../../packages/core/src/stats-range.ts', import.meta.url).href

describe('statistics range rules', () => {
  test('the server and the admin page compare every range with the same period', async () => {
    const core = (await import(coreUrl)) as {
      previousStatsRange: (range: { from: string; to: string }) => { from: string; to: string }
      rangeDays: (range: { from: string; to: string }) => number
    }
    for (const range of [
      { from: '2026-09-17', to: '2026-10-16' },
      { from: '2026-10-10', to: '2026-10-16' },
      { from: '2026-07-19', to: '2026-10-16' },
      { from: '2026-10-01', to: '2026-10-16' },
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-09-01', to: '2026-09-30' },
      { from: '2026-03-01', to: '2026-03-31' },
      { from: '2027-01-01', to: '2027-01-31' },
      { from: '2024-02-01', to: '2024-02-29' },
      { from: '2026-02-01', to: '2026-03-31' },
      { from: '2026-10-16', to: '2026-10-16' },
    ]) {
      expect(core.previousStatsRange(range)).toEqual(previousRange(range))
      expect(core.rangeDays(range)).toBe(rangeDays(range))
    }
  })
})
