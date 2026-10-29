import { describe, expect, test } from 'bun:test'
import { CHENNAI_ZONES, ZONE_RADIUS_KM, zoneFor } from './zones.js'

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

  test('the app puts a point in the same zone as the server (part 2)', async () => {
    const core = (await import(coreUrl)) as {
      zoneFor: (point: { lat: number; lng: number }, zones: readonly CoreZone[]) => CoreZone | null
    }
    const points = [
      { lat: 12.9815, lng: 80.218 },
      { lat: 13.0, lng: 80.24 },
      { lat: 12.95, lng: 80.2 },
      { lat: 13.3, lng: 80.3 },
      { lat: 10.5, lng: 79.5 },
      { lat: 13.0418, lng: 80.2341 },
    ]
    for (const point of points) {
      expect(core.zoneFor(point, CHENNAI_ZONES)?.slug ?? null).toBe(zoneFor(point, CHENNAI_ZONES)?.slug ?? null)
    }
  })
})
