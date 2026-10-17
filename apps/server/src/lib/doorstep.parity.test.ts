import { describe, expect, test } from 'bun:test'
import { DEFAULT_DOORSTEP_RADIUS_KM } from './doorstep.js'

// The twin the radius inputs read lives in packages/core, which the server
// does not depend on. Loaded by path at run time (a computed specifier, so the
// server's TypeScript build never tries to compile a file outside src/).
const coreUrl = new URL('../../../../packages/core/src/doorstep.ts', import.meta.url).href

describe('default doorstep radius', () => {
  test('the server and the radius inputs name the same distance', async () => {
    const core = (await import(coreUrl)) as {
      DEFAULT_DOORSTEP_RADIUS_KM: number
      DOORSTEP_RADIUS_PLACEHOLDER: string
    }
    expect(core.DEFAULT_DOORSTEP_RADIUS_KM).toBe(DEFAULT_DOORSTEP_RADIUS_KM)
    expect(core.DOORSTEP_RADIUS_PLACEHOLDER).toBe(`Default ${DEFAULT_DOORSTEP_RADIUS_KM} km`)
  })

  test('is 10 km, the owner’s number', () => {
    expect(DEFAULT_DOORSTEP_RADIUS_KM).toBe(10)
  })
})
