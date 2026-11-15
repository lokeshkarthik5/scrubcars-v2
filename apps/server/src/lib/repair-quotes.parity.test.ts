import { describe, expect, test } from 'bun:test'
import { REPAIR_QUOTE_RULES, daysLabel, priceRangeLabel } from './repair-quotes.js'

// The apps' copy lives in packages/core, which the server does not depend on:
// loaded by path at run time, as the other parity tests do.
const coreUrl = new URL('../../../../packages/core/src/repair-quotes.ts', import.meta.url).href

describe('repair quotes: the apps say the server’s numbers and words', () => {
  test('every number the apps show or check', async () => {
    const core = (await import(coreUrl)) as {
      REPAIR_QUOTE_RULES: Record<string, unknown>
      priceRangeLabel: typeof priceRangeLabel
      daysLabel: typeof daysLabel
    }
    for (const [key, value] of Object.entries(core.REPAIR_QUOTE_RULES)) {
      expect([key, value]).toEqual([key, REPAIR_QUOTE_RULES[key as keyof typeof REPAIR_QUOTE_RULES]])
    }
    for (const [from, to] of [[4000, 5500], [5000, 5000], [150000, 200000]] as const) {
      expect(core.priceRangeLabel(from, to)).toBe(priceRangeLabel(from, to))
    }
    expect(core.daysLabel(1)).toBe(daysLabel(1))
    expect(core.daysLabel(4)).toBe(daysLabel(4))
  })
})
