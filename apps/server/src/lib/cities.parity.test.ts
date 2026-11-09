import { describe, expect, test } from 'bun:test'
import * as server from './cities.js'

// The twin the panel and the garage apps read lives in packages/core, which
// the server does not depend on. Loaded by path at run time (a computed
// specifier, so the server's TypeScript build never tries to compile a file
// outside src/).
const coreUrl = new URL('../../../../packages/core/src/cities.ts', import.meta.url).href

type Core = {
  CITY_REACH_MIN_KM: number
  CITY_REACH_MAX_KM: number
  DEFAULT_CITY_REACH_KM: number
  CITY_NAME_MIN: number
  CITY_NAME_MAX: number
  OTHER_TOWNS_LABEL: string
  WHOLE_CITY_NEEDS_CITY: string
  cityNameKey: (name: string | null | undefined) => string
  cityOffReason: (name: string | null) => string
  branchName: (garage: string, city: string) => string
  insideReachCity: (city: { name: string; lat: number; lng: number; reachKm: number }, point: { lat: number; lng: number }) => boolean
  cityOfPin: <C extends server.CityPlace>(pin: { lat: number; lng: number } | null, cities: readonly C[]) => C | null
}

describe('cities: the server and the apps', () => {
  test('name the same limits and words', async () => {
    const core = (await import(coreUrl)) as Core
    expect(core.CITY_REACH_MIN_KM).toBe(server.CITY_REACH_MIN_KM)
    expect(core.CITY_REACH_MAX_KM).toBe(server.CITY_REACH_MAX_KM)
    expect(core.DEFAULT_CITY_REACH_KM).toBe(server.DEFAULT_CITY_REACH_KM)
    expect(core.CITY_NAME_MIN).toBe(server.CITY_NAME_MIN)
    expect(core.CITY_NAME_MAX).toBe(server.CITY_NAME_MAX)
    expect(core.OTHER_TOWNS_LABEL).toBe(server.OTHER_TOWNS_LABEL)
    expect(core.WHOLE_CITY_NEEDS_CITY).toBe(server.WHOLE_CITY_NEEDS_CITY)
    for (const name of ['Chennai', ' madras ', 'Tirupur', '', null]) {
      expect(core.cityNameKey(name)).toBe(server.cityNameKey(name))
    }
    for (const name of ['Tirupur', null]) expect(core.cityOffReason(name)).toBe(server.cityOffReason(name))
    expect(core.branchName('Spark', 'Tirupur')).toBe(server.branchName('Spark', 'Tirupur'))
  })

  test('the app’s early check agrees with the server inside the city', async () => {
    const core = (await import(coreUrl)) as Core
    const chennai = { id: 'c', name: 'Chennai', lat: 13.0827, lng: 80.2707, reachKm: 50 }
    for (const point of [
      { lat: 12.9249, lng: 80.1 },
      { lat: 13.3378, lng: 80.1947 },
      { lat: 13.62, lng: 80.2 },
      { lat: 9.4533, lng: 77.8024 },
    ]) {
      // The app allows a hair of slack; it must never refuse what the server takes.
      if (server.cityCoversPoint(chennai, point)) expect(core.insideReachCity(chennai, point)).toBe(true)
    }
  })

  test('name the same city for a pin as the server does', async () => {
    const core = (await import(coreUrl)) as Core
    const cities = [
      { id: 'c', name: 'Chennai', lat: 13.0827, lng: 80.2707, reachKm: 50 },
      { id: 'z', name: 'Zed Nagar', lat: 13.0, lng: 80.25, reachKm: 30 },
      { id: 't', name: 'Tirupur', lat: 11.1085, lng: 77.3411, reachKm: 25 },
    ]
    for (const pin of [
      { lat: 13.0067, lng: 80.2573 },
      { lat: 13.3378, lng: 80.1947 },
      { lat: 11.12, lng: 77.35 },
      { lat: 9.4533, lng: 77.8024 },
    ]) {
      expect(core.cityOfPin(pin, cities)?.id ?? null).toBe(server.wholeCityOf({ ...pin, city: null }, cities)?.id ?? null)
    }
    expect(core.cityOfPin(null, cities)).toBeNull()
  })
})
