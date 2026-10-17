import { describe, expect, test } from 'bun:test'
import { DEFAULT_CENTER } from './map'
import {
  SERVICE_CITY,
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
