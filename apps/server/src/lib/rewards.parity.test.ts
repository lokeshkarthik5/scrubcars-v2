import { describe, expect, test } from 'bun:test'
import * as server from './rewards.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never compiles a file outside src/). The defaults the
// apps show before the config loads, and admin's "Reset to defaults", must
// be the API's version 1.
const coreUrl = new URL('../../../../packages/core/src/rewards.ts', import.meta.url).href

type Core = {
  DEFAULT_REWARDS_SETTINGS: unknown
  LEVELS: readonly string[]
  SCRATCH_OUTCOMES: readonly string[]
  scratchPrizeLabel: (outcome: server.ScratchOutcome, amount: number | string | null) => string
}

describe('rewards parity', () => {
  test('the defaults, levels and prizes are the same', async () => {
    const core = (await import(coreUrl)) as Core
    expect(core.DEFAULT_REWARDS_SETTINGS).toEqual(server.DEFAULT_REWARDS_SETTINGS)
    expect([...core.LEVELS]).toEqual([...server.LEVELS])
    expect([...core.SCRATCH_OUTCOMES]).toEqual([...server.SCRATCH_OUTCOMES])
    for (const outcome of server.SCRATCH_OUTCOMES) {
      for (const amount of [null, 20, '299.00']) {
        expect(core.scratchPrizeLabel(outcome, amount)).toBe(server.scratchPrizeLabel(outcome, amount))
      }
    }
  })
})
