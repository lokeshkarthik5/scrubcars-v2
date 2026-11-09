import { describe, expect, test } from 'bun:test'
import {
  branchName,
  cityCoversPoint,
  cityLetsCustomersSee,
  cityNameKey,
  cityOfGarage,
  cityOffReason,
  garageCityStanding,
  parseOtherTownsVisible,
  placeShown,
  reachesPoint,
  wholeCityOf,
  type City,
} from './cities.js'
import { straightLineKm } from './service-city.js'

// Chennai as 0069 seeds it, and two towns with garages in the pilot.
const CHENNAI: City = { id: 'c-chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707, reachKm: 50, customersSee: true }
const TIRUPUR: City = { id: 'c-tirupur', name: 'Tirupur', lat: 11.1085, lng: 77.3411, reachKm: 25, customersSee: false }
const VELLORE: City = { id: 'c-vellore', name: 'Vellore', lat: 12.9165, lng: 79.1325, reachKm: 40, customersSee: true }
const CITIES = [CHENNAI, TIRUPUR, VELLORE]

const ADYAR = { lat: 13.0067, lng: 80.2573 }
const TIRUPUR_GARAGE = { lat: 11.12, lng: 77.35 }
const SIVAKASI = { lat: 9.4533, lng: 77.8024 }

describe('cityNameKey', () => {
  test('trimmed, any case, and Madras is Chennai', () => {
    expect(cityNameKey('  Chennai ')).toBe('chennai')
    expect(cityNameKey('CHENNAI')).toBe('chennai')
    expect(cityNameKey('Madras')).toBe('chennai')
    expect(cityNameKey(' madras ')).toBe('chennai')
    expect(cityNameKey('Tirupur')).toBe('tirupur')
    expect(cityNameKey(null)).toBe('')
    // Only the whole name: a town with Madras in it is not Chennai.
    expect(cityNameKey('Madras Road')).toBe('madras road')
  })
})

describe('cityOfGarage', () => {
  test('a pin inside a city’s reach is in that city', () => {
    expect(cityOfGarage({ ...ADYAR, city: 'Chennai' }, CITIES)?.name).toBe('Chennai')
    expect(cityOfGarage({ ...TIRUPUR_GARAGE, city: 'Tirupur' }, CITIES)?.name).toBe('Tirupur')
  })

  test('a pin outside every city is in none, whatever its city field says', () => {
    expect(cityOfGarage({ ...SIVAKASI, city: 'Chennai' }, CITIES)).toBeNull()
  })

  test('between two cities whose reaches overlap, the nearest centre wins', () => {
    const near = { id: 'c-near', name: 'Zed Nagar', lat: 13.0, lng: 80.25, reachKm: 30, customersSee: true }
    // Adyar is ~1.3 km from this made-up centre and ~9 km from Chennai's.
    expect(cityOfGarage({ ...ADYAR, city: 'Chennai' }, [CHENNAI, near])?.id).toBe('c-near')
    expect(cityOfGarage({ ...ADYAR, city: 'Chennai' }, [near, CHENNAI])?.id).toBe('c-near')
  })

  test('two cities at the same centre: the name first in the alphabet', () => {
    const twin = { ...CHENNAI, id: 'c-twin', name: 'Anna Nagar' }
    expect(cityOfGarage({ ...ADYAR, city: null }, [CHENNAI, twin])?.id).toBe('c-twin')
  })

  test('exactly on the edge is inside; just past it is outside', () => {
    const edge = { lat: 13.0827 + 50 / 111.2, lng: 80.2707 }
    const km = straightLineKm(CHENNAI, edge)
    expect(cityOfGarage({ ...edge, city: null }, [{ ...CHENNAI, reachKm: Math.ceil(km) }])?.name).toBe('Chennai')
    expect(cityOfGarage({ ...edge, city: null }, [{ ...CHENNAI, reachKm: Math.floor(km) }])).toBeNull()
  })

  test('with no pin, the city its own city field names (trimmed, any case, Madras as Chennai)', () => {
    expect(cityOfGarage({ lat: null, lng: null, city: ' chennai ' }, CITIES)?.name).toBe('Chennai')
    expect(cityOfGarage({ lat: null, lng: null, city: 'Madras' }, CITIES)?.name).toBe('Chennai')
    expect(cityOfGarage({ lat: null, lng: null, city: 'TIRUPUR' }, CITIES)?.name).toBe('Tirupur')
  })

  test('with no pin and a town that is no city, or nothing typed: none (Other towns)', () => {
    expect(cityOfGarage({ lat: null, lng: null, city: 'Sivakasi' }, CITIES)).toBeNull()
    expect(cityOfGarage({ lat: null, lng: null, city: '' }, CITIES)).toBeNull()
    expect(cityOfGarage({ lat: null, lng: null, city: null }, CITIES)).toBeNull()
  })

  test('no cities at all: every garage is in Other towns', () => {
    expect(cityOfGarage({ ...ADYAR, city: 'Chennai' }, [])).toBeNull()
  })
})

describe('who customers see', () => {
  test('every combination of the city switch, Other towns and "Show this garage anyway"', () => {
    const rows: Array<[City | null, boolean, boolean, boolean]> = [
      // city, other towns visible, show anyway → city lets customers see
      [CHENNAI, true, false, true],
      [CHENNAI, false, false, true],
      [TIRUPUR, true, false, false],
      [TIRUPUR, true, true, true],
      [TIRUPUR, false, true, true],
      [null, true, false, true],
      [null, false, false, false],
      [null, false, true, true],
    ]
    for (const [city, otherTownsVisible, showWhenCityOff, expected] of rows) {
      const cityShown = placeShown(city, otherTownsVisible)
      expect(cityLetsCustomersSee({ showWhenCityOff, cityShown })).toBe(expected)
    }
  })

  test('with Chennai on and Other towns never set, no garage is hidden (the default changes nothing)', () => {
    const otherTowns = parseOtherTownsVisible(undefined)
    for (const garage of [
      { ...ADYAR, city: 'Chennai' },
      { ...SIVAKASI, city: 'Sivakasi' },
      { lat: null, lng: null, city: 'Rajapalayam' },
      { lat: null, lng: null, city: 'Chennai' },
    ]) {
      const standing = garageCityStanding({ ...garage, showWhenCityOff: false }, [CHENNAI], otherTowns)
      expect(standing.cityShown).toBe(true)
      expect(standing.hiddenReason).toBeNull()
    }
  })

  test('admin is told why: the city by name, or Other towns', () => {
    expect(garageCityStanding({ ...TIRUPUR_GARAGE, city: 'Tirupur', showWhenCityOff: false }, CITIES, true)).toEqual({
      city: { id: 'c-tirupur', name: 'Tirupur' },
      cityShown: false,
      hiddenReason: 'Its city, Tirupur, is off for customers',
    })
    expect(garageCityStanding({ ...SIVAKASI, city: 'Sivakasi', showWhenCityOff: false }, CITIES, false)).toEqual({
      city: null,
      cityShown: false,
      hiddenReason: 'Other towns are off for customers',
    })
    // Shown anyway: the city is still off, but nothing hides the garage.
    expect(
      garageCityStanding({ ...TIRUPUR_GARAGE, city: 'Tirupur', showWhenCityOff: true }, CITIES, true).hiddenReason
    ).toBeNull()
    expect(cityOffReason(null)).toBe('Other towns are off for customers')
  })

  test('Other towns as stored: only `visible: false` hides', () => {
    expect(parseOtherTownsVisible(undefined)).toBe(true)
    expect(parseOtherTownsVisible(null)).toBe(true)
    expect(parseOtherTownsVisible({})).toBe(true)
    expect(parseOtherTownsVisible({ visible: true })).toBe(true)
    expect(parseOtherTownsVisible({ visible: 'no' })).toBe(true)
    expect(parseOtherTownsVisible({ visible: false })).toBe(false)
  })
})

describe('All over the city', () => {
  // A doorstep garage on Chennai's edge, ~40 km from a customer across the city.
  const PONNERI = { lat: 13.3378, lng: 80.1947, city: 'Chennai' }
  const TAMBARAM = { lat: 12.9249, lng: 80.1 }

  test('only a pinned garage inside a city can offer it', () => {
    expect(wholeCityOf(PONNERI, CITIES)?.name).toBe('Chennai')
    expect(wholeCityOf({ ...SIVAKASI, city: 'Sivakasi' }, CITIES)).toBeNull()
    // No pin: its city field names Chennai, but there is nothing to travel from.
    expect(wholeCityOf({ lat: null, lng: null, city: 'Chennai' }, CITIES)).toBeNull()
  })

  test('reaches any point inside the city, measured from the city’s centre, however far from the garage', () => {
    expect(straightLineKm(PONNERI, TAMBARAM)).toBeGreaterThan(40)
    const garage = { ...PONNERI, radiusKm: 10, defaultKm: 10, wholeCity: true }
    expect(reachesPoint(garage, CITIES, TAMBARAM)).toBe(true)
    expect(cityCoversPoint(CHENNAI, TAMBARAM)).toBe(true)
    // Outside the city it does not, even close to the garage's own radius.
    expect(reachesPoint(garage, CITIES, { lat: 13.62, lng: 80.2 })).toBe(false)
  })

  test('off, the radius from the pin decides as before', () => {
    const garage = { ...PONNERI, radiusKm: 10, defaultKm: 10, wholeCity: false }
    expect(reachesPoint(garage, CITIES, TAMBARAM)).toBe(false)
    expect(reachesPoint(garage, CITIES, { lat: 13.3, lng: 80.2 })).toBe(true)
    // An empty radius is the default.
    expect(reachesPoint({ ...garage, radiusKm: null }, CITIES, { lat: 13.3, lng: 80.2 })).toBe(true)
  })

  test('on, but its city is gone: it keeps to its radius rather than covering nothing', () => {
    const garage = { ...PONNERI, radiusKm: 10, defaultKm: 10, wholeCity: true }
    expect(reachesPoint(garage, [], TAMBARAM)).toBe(false)
    expect(reachesPoint(garage, [], { lat: 13.3, lng: 80.2 })).toBe(true)
  })

  test('a garage with no pin reaches nowhere', () => {
    expect(reachesPoint({ lat: null, lng: null, city: 'Chennai', radiusKm: 10, defaultKm: 10, wholeCity: true }, CITIES, ADYAR)).toBe(false)
  })
})

describe('branches', () => {
  test('a branch is named after the garage and its city', () => {
    expect(branchName('Spark Car Care', 'Tirupur')).toBe('Spark Car Care – Tirupur')
    expect(branchName(' Spark Car Care ', ' ')).toBe('Spark Car Care')
  })
})
