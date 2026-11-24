import { describe, expect, test } from 'bun:test'
import type { GeoPlace } from './api/geo'
import { FALLBACK_CITY } from './customer-city'
import { PLACE_SEARCH_MAX, areaPlaceOf, areaPlacesIn } from './area-place'

function place(label: string, lat: number | null = 13.0, lng: number | null = 80.27, id: string | null = null): GeoPlace {
  return { providerPlaceId: id, provider: 'ola', label, formatted: label, lat, lng, city: null, pincode: null, confidence: null }
}

describe('areaPlaceOf', () => {
  test('first part is the name, without the city, state, country or pincode', () => {
    expect(areaPlaceOf(place('Besant Nagar, Chennai, Tamil Nadu, India'), 'Chennai')).toMatchObject({
      name: 'Besant Nagar',
      detail: '',
    })
  })

  test('the next two parts without door numbers are the detail line', () => {
    const p = areaPlaceOf(
      place("Besant Nagar Beach, 34, Elliot's Promenade, Odaimanagar, Besant Nagar, Chennai, Tamil Nadu, 600090, India"),
      'Chennai'
    )
    expect(p?.name).toBe('Besant Nagar Beach')
    expect(p?.detail).toBe("Elliot's Promenade, Odaimanagar")
  })

  test('a suggestion without coordinates cannot be picked', () => {
    expect(areaPlaceOf(place('Mogappair, Chennai', null, null), 'Chennai')).toBeNull()
  })

  test('the provider id is the key when there is one', () => {
    expect(areaPlaceOf(place('Kolathur, Chennai', 13.12, 80.21, 'ola:1'), 'Chennai')?.id).toBe('ola:1')
  })
})

describe('areaPlacesIn', () => {
  test('keeps places inside the city and drops ones far away', () => {
    const list = areaPlacesIn(
      [place('Besant Nagar, Chennai', 12.997, 80.267), place('Besant Nagar, Puducherry', 11.93, 79.83)],
      FALLBACK_CITY,
      []
    )
    expect(list.map((p) => p.name)).toEqual(['Besant Nagar'])
  })

  test('a bare zone name already listed above is not listed again', () => {
    const list = areaPlacesIn(
      [place('Velachery, Chennai', 12.98, 80.22), place('Velachery MRTS, Bhuvaneswary Nagar, Chennai', 12.97, 80.22)],
      FALLBACK_CITY,
      [],
      ['Velachery']
    )
    expect(list.map((p) => p.name)).toEqual(['Velachery MRTS'])
  })

  test('each place once, at most the maximum', () => {
    const many = Array.from({ length: 10 }, (_, i) => place(`Place ${i}, Chennai`, 13.0 + i / 1000, 80.25))
    expect(areaPlacesIn([...many, many[0]!], FALLBACK_CITY, []).length).toBe(PLACE_SEARCH_MAX)
  })
})
