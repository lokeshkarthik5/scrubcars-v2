import { describe, expect, test } from 'bun:test'
import { LIST_RADIUS_KM } from './discovery.js'
import {
  SERVICE_CITY,
  outsideServiceCity,
  straightLineKm,
  townName,
} from './service-city.js'

const CENTRE = SERVICE_CITY.centre
// One degree of latitude on a 6371 km sphere. Moving due north by km / this
// lands exactly km from the centre, whatever the longitude.
const KM_PER_DEG_LAT = (6371 * Math.PI) / 180
const north = (km: number) => ({
  lat: CENTRE.lat + km / KM_PER_DEG_LAT,
  lng: CENTRE.lng,
})

describe('SERVICE_CITY', () => {
  test('is Chennai, with the list’s 50 km', () => {
    expect(SERVICE_CITY.name).toBe('Chennai')
    expect(SERVICE_CITY.centre).toEqual({ lat: 13.0827, lng: 80.2707 })
    expect(SERVICE_CITY.radiusKm).toBe(LIST_RADIUS_KM)
    expect(SERVICE_CITY.radiusKm).toBe(50)
  })
})

describe('outsideServiceCity', () => {
  test('a garage in the city carries no sign', () => {
    expect(outsideServiceCity({ ...CENTRE, city: 'Chennai' })).toBeNull()
    expect(outsideServiceCity({ ...north(20), city: 'Chennai' })).toBeNull()
  })

  test('the boundary: 50 km is still in, anything past it is out', () => {
    expect(outsideServiceCity({ ...north(49.9), city: 'Chennai' })).toBeNull()
    expect(outsideServiceCity({ ...north(49.999), city: 'Chennai' })).toBeNull()
    expect(outsideServiceCity({ ...north(50.01), city: 'Chennai' })).toEqual({
      town: null,
      km: 50,
    })
    expect(outsideServiceCity({ ...north(50.6), city: 'Chennai' })).toEqual({
      town: null,
      km: 51,
    })
  })

  test('judged before rounding: 50.4 km is outside though it reads 50', () => {
    expect(
      outsideServiceCity({ ...north(50.4), city: 'Gummidipoondi' })
    ).toEqual({
      town: 'Gummidipoondi',
      km: 50,
    })
  })

  test('the pilot’s other towns, with their distance rounded to a whole km', () => {
    expect(
      outsideServiceCity({ lat: 9.4533, lng: 77.8024, city: 'Sivakasi' })
    ).toEqual({
      town: 'Sivakasi',
      km: 485,
    })
    expect(
      outsideServiceCity({ lat: 9.451, lng: 77.5536, city: 'Rajapalayam' })
    ).toEqual({
      town: 'Rajapalayam',
      km: 501,
    })
    expect(
      outsideServiceCity({ lat: 11.1085, lng: 77.3411, city: 'Tirupur' })
    ).toEqual({
      town: 'Tirupur',
      km: 387,
    })
  })

  test('the seeded Vellore garage (VENDORS.homePromo) is about 125 km out', () => {
    expect(
      outsideServiceCity({ lat: 12.9165, lng: 79.1325, city: 'Vellore' })
    ).toEqual({
      town: 'Vellore',
      km: 125,
    })
  })

  test('a garage that says Chennai but is pinned far out names no town', () => {
    // The 2026-10-14 production check found a Chennai garage pinned at a
    // longitude of 70.468: the sign then says "Outside Chennai", which is
    // also how ops spots the wrong pin.
    const misPinned = outsideServiceCity({
      lat: 13.05,
      lng: 70.468,
      city: 'Chennai',
    })
    expect(misPinned?.town).toBeNull()
    expect(misPinned!.km).toBeGreaterThan(1000)
  })

  test('no pin, and a city field naming another town: outside, with no km', () => {
    // Listed after the pinned garages even to a customer in Chennai, so it
    // must carry the sign; with nothing to measure from, it gives no distance.
    const sivakasi = { town: 'Sivakasi', km: null }
    expect(
      outsideServiceCity({
        lat: null,
        lng: null,
        city: 'Sivakasi',
        pincode: '626123',
      })
    ).toEqual(sivakasi)
    expect(
      outsideServiceCity({ lat: 9.45, lng: null, city: 'Sivakasi' })
    ).toEqual(sivakasi)
    expect(
      outsideServiceCity({ lat: null, lng: 77.8, city: 'SIVAKASI' })
    ).toEqual(sivakasi)
    expect(
      outsideServiceCity({ lat: Number.NaN, lng: 77.8, city: 'Sivakasi' })
    ).toEqual(sivakasi)
  })

  test('no pin, and a city field saying Chennai or nothing: unknown, so no sign', () => {
    for (const city of [
      'Chennai',
      'Chennai - Tambaram',
      'Madras',
      '',
      '  ',
      null,
    ]) {
      expect(outsideServiceCity({ lat: null, lng: null, city })).toBeNull()
    }
  })

  test('no pin, a suburb typed as its own town, but a Chennai pincode: no sign', () => {
    expect(
      outsideServiceCity({
        lat: null,
        lng: null,
        city: 'Tambaram',
        pincode: '600045',
      })
    ).toBeNull()
    expect(
      outsideServiceCity({
        lat: null,
        lng: null,
        city: 'Avadi',
        pincode: ' 600054 ',
      })
    ).toBeNull()
    // Only a whole 600 code counts: 6001 or 6000451 is not one.
    expect(
      outsideServiceCity({
        lat: null,
        lng: null,
        city: 'Vellore',
        pincode: '6001',
      })
    ).toEqual({ town: 'Vellore', km: null })
  })

  test('with a pin, the pin decides, whatever the pincode says', () => {
    expect(
      outsideServiceCity({ ...CENTRE, city: 'Sivakasi', pincode: '626123' })
    ).toBeNull()
    expect(
      outsideServiceCity({
        lat: 12.9165,
        lng: 79.1325,
        city: 'Vellore',
        pincode: '600001',
      })
    ).toEqual({ town: 'Vellore', km: 125 })
  })
})

describe('townName', () => {
  test('Chennai, however it is written, names no town', () => {
    for (const city of [
      'Chennai',
      'chennai',
      ' CHENNAI ',
      'Chennai - Tambaram',
      'Madras',
      'Greater Chennai',
    ]) {
      expect(townName(city)).toBeNull()
    }
  })

  test('empty is no town', () => {
    expect(townName('')).toBeNull()
    expect(townName('   ')).toBeNull()
    expect(townName(null)).toBeNull()
    expect(townName(undefined)).toBeNull()
  })

  test('a town is kept as written, with the spacing tidied', () => {
    expect(townName('Sivakasi')).toBe('Sivakasi')
    expect(townName('  Tirupur ')).toBe('Tirupur')
    expect(townName('Kanchipuram  Town')).toBe('Kanchipuram Town')
    expect(townName('McLeod Ganj')).toBe('McLeod Ganj')
  })

  test('all capitals or all lowercase is put in title case', () => {
    expect(townName('SIVAKASI')).toBe('Sivakasi')
    expect(townName('rajapalayam')).toBe('Rajapalayam')
    expect(townName('ranipet-arcot')).toBe('Ranipet-Arcot')
  })

  test('a name that only contains the letters is not Chennai', () => {
    expect(townName('Chennaipattinam')).toBe('Chennaipattinam')
  })
})

describe('straightLineKm', () => {
  test('is zero at the centre and symmetric', () => {
    expect(straightLineKm(CENTRE, CENTRE)).toBe(0)
    const vellore = { lat: 12.9165, lng: 79.1325 }
    expect(straightLineKm(CENTRE, vellore)).toBeCloseTo(
      straightLineKm(vellore, CENTRE),
      9
    )
  })

  test('a degree of latitude is about 111.2 km', () => {
    expect(straightLineKm(CENTRE, north(KM_PER_DEG_LAT))).toBeCloseTo(111.19, 1)
  })
})
