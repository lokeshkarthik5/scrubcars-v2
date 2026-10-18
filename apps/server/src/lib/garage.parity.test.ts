import { describe, expect, test } from 'bun:test'
import * as server from './garage.js'

// The apps' twin (packages/core/src/garage.ts), loaded by path at run time
// like rewards.parity.test.ts: the rarities, their names, the defaults and
// the limits the admin form and the album show must be the API's.
const coreUrl = new URL('../../../../packages/core/src/garage.ts', import.meta.url).href

type Core = {
  GARAGE_RARITIES: readonly string[]
  RARITY_LABELS: Record<string, string>
  DEFAULT_GARAGE_SETTINGS: unknown
  GARAGE_LIMITS: unknown
  CAR_LIMITS: unknown
  AI_IMAGE_COST_INR: number
  ROW_SIZE: number
  PULL_SOURCE_LABELS: Record<string, string>
  garageSettings: (s: unknown) => unknown
  rowOf: (n: number) => number
}

describe('garage parity', () => {
  test('rarities, defaults, limits, costs and rows match', async () => {
    const core = (await import(coreUrl)) as Core
    expect([...core.GARAGE_RARITIES]).toEqual([...server.GARAGE_RARITIES])
    expect(core.RARITY_LABELS).toEqual(server.RARITY_LABELS)
    expect(core.DEFAULT_GARAGE_SETTINGS).toEqual(server.DEFAULT_GARAGE_SETTINGS)
    expect(core.GARAGE_LIMITS).toEqual(server.GARAGE_LIMITS)
    expect(core.CAR_LIMITS).toEqual(server.CAR_LIMITS)
    expect(core.AI_IMAGE_COST_INR).toBe(server.AI_IMAGE_COST_INR)
    expect(core.ROW_SIZE).toBe(server.ROW_SIZE)
    expect(core.PULL_SOURCE_LABELS).toEqual(server.PULL_SOURCE_LABELS)
    const stored = { garage: { enabled: true, rarityWeights: { common: 50, rare: 35, epic: 12, legendary: 3 } } }
    expect(core.garageSettings(stored)).toEqual(server.garageSettings(stored))
    for (const n of [1, 5, 6, 40]) expect(core.rowOf(n)).toBe(server.rowOf(n))
  })
})
