import { describe, expect, test } from 'bun:test'
import { CITY_REACH_KM } from './discovery.js'
import { SERVICE_CITY, straightLineKm } from './service-city.js'

// The twins the customer app reads live in packages/core, which the server
// does not depend on. Loaded by path at run time (a computed specifier, so the
// server's TypeScript build never tries to compile a file outside src/).
const cityUrl = new URL(
  '../../../../packages/core/src/service-city.ts',
  import.meta.url
).href
const mapUrl = new URL('../../../../packages/core/src/map.ts', import.meta.url)
  .href

type Point = { lat: number; lng: number }

describe('service city', () => {
  test('the server, the sign and the map name the same city, centre and reach', async () => {
    const core = (await import(cityUrl)) as {
      SERVICE_CITY: { name: string; centre: Point; radiusKm: number }
    }
    const map = (await import(mapUrl)) as { DEFAULT_CENTER: [number, number] }

    expect(core.SERVICE_CITY.name).toBe(SERVICE_CITY.name)
    expect(core.SERVICE_CITY.centre).toEqual(SERVICE_CITY.centre)
    expect(core.SERVICE_CITY.radiusKm).toBe(SERVICE_CITY.radiusKm)
    expect(core.SERVICE_CITY.radiusKm).toBe(CITY_REACH_KM)
    // The map opens on, and its city mode measures from, the same point.
    expect(map.DEFAULT_CENTER).toEqual([
      SERVICE_CITY.centre.lng,
      SERVICE_CITY.centre.lat,
    ])
  })

  test('the map’s city mode and the server measure distance the same way', async () => {
    const map = (await import(mapUrl)) as {
      straightLineKm: (from: Point, to: Point) => number
    }
    for (const point of [
      { lat: 12.9165, lng: 79.1325 },
      { lat: 9.4533, lng: 77.8024 },
      { lat: 13.5, lng: 80.2707 },
      { lat: 12.6327, lng: 80.1207 },
    ]) {
      expect(map.straightLineKm(SERVICE_CITY.centre, point)).toBe(
        straightLineKm(SERVICE_CITY.centre, point)
      )
    }
  })
})
