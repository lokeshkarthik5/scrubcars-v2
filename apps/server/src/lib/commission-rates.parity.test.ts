import { describe, expect, test } from 'bun:test'
import { COMMISSION_RATES, MECHANICAL_AND_BODY_RATE } from './commission.js'

const coreUrl = new URL('../../../../packages/core/src/commission-rates.ts', import.meta.url).href

describe('commission rates parity', () => {
  test('the admin editor quotes the rates the server charges', async () => {
    const core = (await import(coreUrl)) as {
      CATEGORY_COMMISSION_PERCENT: Record<string, number>
      MECHANICAL_AND_BODY_PERCENT: number
    }
    expect(core.MECHANICAL_AND_BODY_PERCENT / 100).toBeCloseTo(MECHANICAL_AND_BODY_RATE, 10)
    expect(Object.keys(core.CATEGORY_COMMISSION_PERCENT).sort()).toEqual(Object.keys(COMMISSION_RATES).sort())
    for (const [category, rate] of Object.entries(COMMISSION_RATES)) {
      expect(core.CATEGORY_COMMISSION_PERCENT[category] / 100).toBeCloseTo(rate, 10)
    }
  })
})
