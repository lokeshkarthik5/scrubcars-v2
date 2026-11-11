import { describe, expect, test } from 'bun:test'
import { DEFAULT_CENTER, cityCenter } from './map'
import { SERVICE_CITY, outsideServiceCityTag } from './service-city'

// The garage signs moved to ./customer-city with cities (0070), relative to
// the customer's own city; they are tested in customer-city.test.ts.

describe('the service city', () => {
  test('the map opens on it before the customer’s city is known', () => {
    expect(DEFAULT_CENTER).toEqual([SERVICE_CITY.centre.lng, SERVICE_CITY.centre.lat])
  })

  test('and on the customer’s city once it is', () => {
    expect(cityCenter({ centre: { lat: 11.0168, lng: 76.9558 } })).toEqual([76.9558, 11.0168])
  })
})

describe('admin’s Outside Chennai chip', () => {
  test('ops still read it against Chennai, with the town when there is one', () => {
    expect(outsideServiceCityTag({ town: 'Sivakasi', km: 485 })).toBe('Outside Chennai · Sivakasi')
    expect(outsideServiceCityTag({ town: null, km: 55 })).toBe('Outside Chennai')
  })
})
