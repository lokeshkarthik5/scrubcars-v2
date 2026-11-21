import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as server from './pickup-fee-maths.js'

// The apps' copy lives in packages/core, which the server does not depend
// on: read and loaded by path (a computed specifier, so the server's build
// never compiles a file outside src/).
const coreUrl = new URL('../../../../packages/core/src/pickup-fee-maths.ts', import.meta.url)
const serverUrl = new URL('./pickup-fee-maths.ts', import.meta.url)
const MARKER = '// ── shared below'

function sharedPart(url: URL): string {
  const text = readFileSync(fileURLToPath(url), 'utf8')
  const at = text.indexOf(MARKER)
  expect(at).toBeGreaterThan(0)
  return text.slice(at)
}

describe('pickup fee maths: one copy of the rules', () => {
  test('the server’s file is the apps’ file, byte for byte below the marker', () => {
    expect(sharedPart(serverUrl)).toBe(sharedPart(coreUrl))
  })

  test('and both price every distance the same', async () => {
    const core = (await import(coreUrl.href)) as typeof server
    const S = server.DEFAULT_PICKUP_FEE_SETTINGS
    const fees: server.GaragePickupFee[] = [
      server.FREE_PICKUP_FEE,
      { ...server.FREE_PICKUP_FEE, mode: 'fixed', fixed: 150 },
      { ...server.FREE_PICKUP_FEE, mode: 'distance' },
      { ...server.FREE_PICKUP_FEE, mode: 'distance', freeKm: 0, perKm: 30, minCharge: 149, maxCharge: 599 },
    ]
    for (const fee of fees) {
      const a = server.garagePlan(fee, S)
      const b = core.garagePlan(fee, S)
      expect(b).toEqual(a)
      for (let km = 0; km <= 60; km += 0.7) {
        expect(core.tripFee(b, km, 450)).toEqual(server.tripFee(a, km, 450))
      }
      expect(core.isAboveSuggestion(fee, S)).toBe(server.isAboveSuggestion(fee, S))
    }
    expect(core.askMaxFee(120, S)).toBe(server.askMaxFee(120, S))
  })
})
