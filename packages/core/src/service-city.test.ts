import { describe, expect, test } from 'bun:test'
import { DEFAULT_CENTER } from './map'
import {
  SERVICE_CITY,
  firstFarIndex,
  isNearCustomer,
  nearGarageCount,
  outsideCityCheckoutLine,
  outsideCityLine,
  outsideCityTag,
} from './service-city'

// The words are the owner's (2026-10-16), so they are pinned here word for
// word. Which garages get them is the server's call, tested in
// apps/server/src/lib/service-city.test.ts.

const SIVAKASI = { town: 'Sivakasi', km: 485 }
const UNNAMED = { town: null, km: 55 }
// No pin, but its city field names another town.
const UNPINNED = { town: 'Sivakasi', km: null }

describe('the Outside Chennai sign', () => {
  test('the card chip names the town when there is one', () => {
    expect(outsideCityTag(SIVAKASI)).toBe('Outside Chennai · Sivakasi')
    expect(outsideCityTag(UNPINNED)).toBe('Outside Chennai · Sivakasi')
    expect(outsideCityTag(UNNAMED)).toBe('Outside Chennai')
  })

  test('the garage page says where and roughly how far', () => {
    expect(outsideCityLine(SIVAKASI)).toBe(
      'This garage is in Sivakasi, about 485 km from Chennai.'
    )
    // No pin: where, but no distance.
    expect(outsideCityLine(UNPINNED)).toBe('This garage is in Sivakasi.')
    // No town: the garage's own city field says Chennai, and the page shows
    // that just above, so no figure to set against it.
    expect(outsideCityLine(UNNAMED)).toBe('This garage is outside Chennai.')
    expect(outsideCityLine({ town: null, km: 1063 })).toBe(
      'This garage is outside Chennai.'
    )
    // Grouped the Indian way past a thousand.
    expect(outsideCityLine({ town: 'Delhi', km: 1760 })).toBe(
      'This garage is in Delhi, about 1,760 km from Chennai.'
    )
  })

  test('checkout says it once more, beside Pay', () => {
    expect(outsideCityCheckoutLine(SIVAKASI)).toBe(
      'This garage is in Sivakasi, not Chennai.'
    )
    expect(outsideCityCheckoutLine(UNPINNED)).toBe(
      'This garage is in Sivakasi, not Chennai.'
    )
    expect(outsideCityCheckoutLine(UNNAMED)).toBe(
      'This garage is outside Chennai.'
    )
  })

  test('the map opens on the service city', () => {
    expect(DEFAULT_CENTER).toEqual([
      SERVICE_CITY.centre.lng,
      SERVICE_CITY.centre.lat,
    ])
  })
})

// The live list near Adyar on 10 Nov 2026: two Chennai garages, then three in
// Tirupur and near Rajapalayam that the count used to call "near you".
const ADYAR = [
  { distanceKm: 2.4, outsideServiceCity: null },
  { distanceKm: 13.5, outsideServiceCity: null },
  { distanceKm: 387.3, outsideServiceCity: { town: 'Tirupur', km: 393 } },
  { distanceKm: 474.8, outsideServiceCity: { town: 'Rajapalayam', km: 480 } },
  { distanceKm: 491.2, outsideServiceCity: { town: 'Rajapalayam', km: 497 } },
]

describe('garages near you', () => {
  test('only garages within the city reach count, far towns never do', () => {
    expect(nearGarageCount(ADYAR, { located: true, hasMore: false, nearestFirst: true })).toEqual({
      count: 2,
      more: false,
    })
  })

  test('the edge of the reach is near, just past it is not', () => {
    expect(isNearCustomer({ distanceKm: 50 }, true)).toBe(true)
    expect(isNearCustomer({ distanceKm: 50.1 }, true)).toBe(false)
    // Located, but no pin: not known to be near.
    expect(isNearCustomer({ distanceKm: null }, true)).toBe(false)
  })

  test('without a location, garages inside the city count', () => {
    const noOrigin = ADYAR.map((g) => ({ ...g, distanceKm: null }))
    expect(nearGarageCount(noOrigin, { located: false, hasMore: true, nearestFirst: false })).toEqual({
      count: 2,
      more: true,
    })
  })

  test('no "+" once a nearest-first list has passed the reach', () => {
    expect(nearGarageCount(ADYAR, { located: true, hasMore: true, nearestFirst: true }).more).toBe(false)
    expect(nearGarageCount(ADYAR.slice(0, 2), { located: true, hasMore: true, nearestFirst: true }).more).toBe(true)
    // The unpinned tail comes after every located garage.
    expect(
      nearGarageCount([...ADYAR.slice(0, 2), { distanceKm: null }], { located: true, hasMore: true, nearestFirst: true })
        .more
    ).toBe(false)
    // Another sort cannot vouch for what later pages hold.
    expect(nearGarageCount(ADYAR, { located: true, hasMore: true, nearestFirst: false }).more).toBe(true)
  })

  test('the Further away line sits above the first far garage', () => {
    expect(firstFarIndex(ADYAR, { located: true, nearestFirst: true })).toBe(2)
    expect(firstFarIndex(ADYAR.slice(0, 2), { located: true, nearestFirst: true })).toBe(-1)
    expect(firstFarIndex(ADYAR, { located: false, nearestFirst: true })).toBe(-1)
    expect(firstFarIndex(ADYAR, { located: true, nearestFirst: false })).toBe(-1)
  })
})
