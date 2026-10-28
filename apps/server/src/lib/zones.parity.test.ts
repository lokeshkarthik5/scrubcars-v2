import { describe, expect, test } from 'bun:test'
import { CHENNAI_ZONES, ZONE_RADIUS_KM } from './zones.js'

// The customer app's seeded copy lives in packages/core, which the server
// does not depend on. Loaded by path at run time (a computed specifier, so
// the server's TypeScript build never tries to compile a file outside src/).
const coreUrl = new URL('../../../../packages/core/src/zones.ts', import.meta.url).href

type CoreZone = { slug: string; name: string; lat: number; lng: number; priority: boolean }

describe('zones', () => {
  test('the app’s seeded zones are the server’s, field for field', async () => {
    const core = (await import(coreUrl)) as {
      CHENNAI_ZONES: readonly CoreZone[]
      ZONE_RADIUS_KM: number
      orderZones: (zones: readonly CoreZone[]) => CoreZone[]
    }
    expect(core.ZONE_RADIUS_KM).toBe(ZONE_RADIUS_KM)
    expect(core.CHENNAI_ZONES.map(({ slug, name, lat, lng, priority }) => ({ slug, name, lat, lng, priority }))).toEqual(
      CHENNAI_ZONES.map(({ slug, name, lat, lng, priority }) => ({ slug, name, lat, lng, priority }))
    )
  })

  test('the app orders zones as GET /zones does: priority first, each group A–Z', async () => {
    const core = (await import(coreUrl)) as { orderZones: (zones: readonly CoreZone[]) => CoreZone[] }
    const ordered = core.orderZones(CHENNAI_ZONES).map((z) => z.name)
    expect(ordered.slice(0, 7)).toEqual(['Adyar', 'Anna Nagar', 'Guindy', 'Navalur', 'Nungambakkam', 'Sholinganallur', 'T Nagar'])
    expect(ordered.slice(7)).toEqual([...ordered.slice(7)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })
})
