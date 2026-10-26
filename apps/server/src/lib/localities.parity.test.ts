import { describe, expect, test } from 'bun:test'
import * as server from './localities.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The Garages
// list and a collection list's Telegram post name a garage's area; a drift
// would send a collector to "Adyar" while the panel says "Besant Nagar".
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

type Core = typeof server & {
  nearestLocality: (lat: number, lng: number) => string | null
}

describe('localities parity', () => {
  test('the same areas at the same centres', async () => {
    const core = (await import(coreUrl('localities.ts'))) as Core
    expect(server.CHENNAI_LOCALITIES).toEqual(core.CHENNAI_LOCALITIES)
  })

  test('every garage gets the same area name', async () => {
    const core = (await import(coreUrl('localities.ts'))) as Core
    const garages = [
      // At each area's centre, and a short way off it.
      ...server.CHENNAI_LOCALITIES.flatMap((place) => [
        { city: 'Chennai', lat: place.lat, lng: place.lng },
        { city: 'Chennai', lat: place.lat + 0.015, lng: place.lng - 0.01 },
      ]),
      // Between areas and further out: the city.
      { city: 'Chennai', lat: 13.2, lng: 80.05 },
      { city: 'Chennai', lat: 12.7, lng: 80.3 },
      // No pin, or outside the service city: the city.
      { city: 'Chennai', lat: null, lng: null },
      {
        city: 'Sivakasi',
        lat: 13.0067,
        lng: 80.257,
        outsideServiceCity: { town: 'Sivakasi', km: 500 },
      },
    ]
    for (const garage of garages) {
      expect(server.garageAreaName(garage)).toBe(core.garageAreaName(garage))
    }
    // The server's "near" is core's "Near X", exactly.
    for (const garage of garages) {
      if (garage.lat === null || garage.lng === null) continue
      const near = core.nearestLocality(garage.lat, garage.lng)
      expect(server.nearLocality(garage.lat, garage.lng)).toBe(
        near?.startsWith('Near ') ? near.slice('Near '.length) : null
      )
    }
  })

  test('a pin near Adyar is in Adyar; no pin is the city', () => {
    expect(
      server.garageAreaName({ city: 'Chennai', lat: 13.0067, lng: 80.257 })
    ).toBe('Adyar')
    expect(
      server.garageAreaName({ city: 'Chennai', lat: null, lng: null })
    ).toBe('Chennai')
  })
})
