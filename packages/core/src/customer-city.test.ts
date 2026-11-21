import { describe, expect, test } from 'bun:test'
import {
  FALLBACK_CITY,
  FAR_LIMIT_KM,
  SMALL_CITY_GARAGES,
  cityChipName,
  cityGaragesLine,
  customerCityOf,
  customerPoint,
  detlioInLine,
  farEmptyLine,
  firstFarIndex,
  garageInCity,
  inCityHeading,
  isNearCustomer,
  isSmallCity,
  nearGarageCount,
  driveNearCount,
  mapPeekCount,
  mapPeekWords,
  NEAR_DRIVE_MINUTES,
  outsideCityLine,
  outsideCityTag,
  recommendRowText,
  zoneInCity,
  type CustomerCity,
  type CustomerPlace,
} from './customer-city'

// The words are the owner's (mockup "customer cities", 10 Nov 2026), so they
// are pinned here word for word. Which city holds a point is the server's
// rule, checked against it in apps/server/src/lib/cities.parity.test.ts.

const CHENNAI: CustomerCity = {
  id: 'c-chennai', name: 'Chennai', centre: { lat: 13.0827, lng: 80.2707 }, reachKm: 50, growing: true, garageCount: 42,
}
const COIMBATORE: CustomerCity = {
  id: 'c-cbe', name: 'Coimbatore', centre: { lat: 11.0168, lng: 76.9558 }, reachKm: 30, growing: false, garageCount: 6,
}
const MADURAI: CustomerCity = {
  id: 'c-madurai', name: 'Madurai', centre: { lat: 9.9252, lng: 78.1198 }, reachKm: 30, growing: false, garageCount: 1,
}
const CITIES = [CHENNAI, COIMBATORE, MADURAI]

// Places the customer may be.
const ADYAR = { lat: 13.0067, lng: 80.2573, source: 'gps' as const }
const RS_PURAM = { lat: 11.0089, lng: 76.9497, source: 'area' as const }
const BENGALURU = { lat: 12.9716, lng: 77.5946, source: 'gps' as const }

// Garages, as the API sends them.
const CHENNAI_GARAGE = { lat: 13.05, lng: 80.25, area: 'Chennai', garageCity: { id: 'c-chennai', name: 'Chennai' } }
const VELLORE_GARAGE = { lat: 12.9165, lng: 79.1325, area: 'VELLORE', garageCity: null }
const KOVAI_GARAGE = { lat: 11.02, lng: 76.96, area: 'Coimbatore', garageCity: { id: 'c-cbe', name: 'Coimbatore' } }

const at = (city: CustomerCity, where: { lat: number; lng: number } | null = null): CustomerPlace => ({ city, at: where })

describe('the customer’s city', () => {
  test('no place yet: the first city, Chennai, as today', () => {
    expect(customerCityOf(null, CITIES).id).toBe('c-chennai')
    // Before GET /cities answers, the stand-in is Chennai too.
    expect(customerCityOf(null, []).name).toBe('Chennai')
    expect(customerCityOf(null, undefined)).toBe(FALLBACK_CITY)
  })

  test('a phone fix or an area picks the city whose reach holds it', () => {
    expect(customerCityOf(ADYAR, CITIES).id).toBe('c-chennai')
    expect(customerCityOf(RS_PURAM, CITIES).id).toBe('c-cbe')
    // Outside every city: the first one.
    expect(customerCityOf(BENGALURU, CITIES).id).toBe('c-chennai')
  })

  test('a whole city picked in the sheet is that city; an old “All of Chennai” still means Chennai', () => {
    expect(customerCityOf({ ...COIMBATORE.centre, source: 'manual', cityId: 'c-cbe' }, CITIES).id).toBe('c-cbe')
    expect(customerCityOf({ ...CHENNAI.centre, source: 'manual' }, [COIMBATORE, CHENNAI]).id).toBe('c-chennai')
    // A city switched off since: the point decides, then the first city.
    expect(customerCityOf({ ...MADURAI.centre, source: 'manual', cityId: 'c-gone' }, CITIES).id).toBe('c-madurai')
  })

  test('distances are from the customer’s own place, never from a city they picked', () => {
    expect(customerPoint(ADYAR)).toEqual({ lat: 13.0067, lng: 80.2573 })
    expect(customerPoint({ ...COIMBATORE.centre, source: 'manual', cityId: 'c-cbe' })).toBeNull()
    expect(customerPoint(null)).toBeNull()
  })

  test('the sheet lists only the areas inside the chosen city', () => {
    const annaNagar = { lat: 13.085, lng: 80.2101 }
    expect(zoneInCity(annaNagar, CHENNAI, CITIES)).toBe(true)
    expect(zoneInCity(annaNagar, COIMBATORE, CITIES)).toBe(false)
    expect(zoneInCity(RS_PURAM, COIMBATORE, CITIES)).toBe(true)
  })
})

describe('the city chip and the sheet', () => {
  test('the chip’s name says the city, and the area when one is picked', () => {
    expect(cityChipName(COIMBATORE, null)).toBe('Your city: Coimbatore. Change')
    expect(cityChipName(COIMBATORE, 'RS Puram')).toBe('Your area: RS Puram, Coimbatore. Change')
  })

  test('the city switch counts garages, but never a small city’s', () => {
    expect(cityGaragesLine(CHENNAI)).toBe('42 garages')
    expect(cityGaragesLine(COIMBATORE)).toBe('6 garages')
    expect(cityGaragesLine(MADURAI)).toBeNull()
    expect(cityGaragesLine({ ...MADURAI, garageCount: 0 })).toBeNull()
    expect(cityGaragesLine(FALLBACK_CITY)).toBeNull()
  })
})

describe('a small city (fewer than 3 garages, mockup D)', () => {
  test('small below three, normal from three up; an unknown count is never small', () => {
    expect(SMALL_CITY_GARAGES).toBe(3)
    expect(isSmallCity({ ...MADURAI, garageCount: 0 })).toBe(true)
    expect(isSmallCity({ ...MADURAI, garageCount: 2 })).toBe(true)
    expect(isSmallCity({ ...MADURAI, garageCount: 3 })).toBe(false)
    expect(isSmallCity(FALLBACK_CITY)).toBe(false)
  })

  test('no counts, no promises: just where, and one way to recommend', () => {
    expect(detlioInLine(MADURAI)).toBe('Detlio in Madurai')
    expect(inCityHeading(MADURAI)).toBe('In Madurai')
    expect(recommendRowText(MADURAI)).toEqual({ ask: 'Know a great garage in Madurai?', action: 'Recommend it' })
  })

  test('growing is the owner’s switch alone: Chennai on, a partner-garage city off', () => {
    expect(FALLBACK_CITY.growing).toBe(true)
    expect(MADURAI.growing).toBe(false)
  })

  test('the far-garage limit is 150 km (the server applies it), and an empty list says so', () => {
    expect(FAR_LIMIT_KM).toBe(150)
    expect(farEmptyLine(at(MADURAI, RS_PURAM))).toBe(
      'No garages within 150 km of you yet. Search finds a garage by its name, wherever it is.'
    )
    expect(farEmptyLine(at(MADURAI))).toBe(
      'No garages within 150 km of Madurai yet. Search finds a garage by its name, wherever it is.'
    )
  })
})

describe('a garage in another town', () => {
  test('a garage in the customer’s city carries no sign at all', () => {
    expect(garageInCity(CHENNAI_GARAGE, CHENNAI)).toBe(true)
    expect(outsideCityTag(CHENNAI_GARAGE, at(CHENNAI, ADYAR))).toBeNull()
    expect(outsideCityLine(CHENNAI_GARAGE, at(CHENNAI, ADYAR))).toBeNull()
    expect(outsideCityTag(KOVAI_GARAGE, at(COIMBATORE))).toBeNull()
  })

  test('elsewhere, the card says the town and how far (from the city’s centre with no place)', () => {
    // Vellore is 125 km from Chennai's centre; no city of its own, so its own town, tidied.
    expect(outsideCityTag(VELLORE_GARAGE, at(CHENNAI))).toBe('Vellore · 125 km')
    expect(outsideCityTag(CHENNAI_GARAGE, at(COIMBATORE))).toBe('Chennai · 424 km')
    // From the customer's own place when they shared one.
    expect(outsideCityTag(VELLORE_GARAGE, at(CHENNAI, ADYAR))).toBe('Vellore · 122 km')
  })

  test('the page and checkout: “about N km from you”, or from their city', () => {
    expect(outsideCityLine(VELLORE_GARAGE, at(CHENNAI, ADYAR))).toBe('This garage is in Vellore, about 122 km from you.')
    expect(outsideCityLine(VELLORE_GARAGE, at(CHENNAI))).toBe('This garage is in Vellore, about 125 km from Chennai.')
  })

  test('no pin: just the town; no town: just the distance; nothing known: nothing said', () => {
    const unpinned = { lat: null, lng: null, area: 'Sivakasi', garageCity: null }
    expect(outsideCityTag(unpinned, at(CHENNAI))).toBe('Sivakasi')
    expect(outsideCityLine(unpinned, at(CHENNAI))).toBe('This garage is in Sivakasi.')
    // Pinned just past Chennai's reach, but it typed "Chennai": no "Chennai · 60 km" to a Chennai customer.
    const edge = { lat: 13.62, lng: 80.2, area: 'Chennai', garageCity: null }
    expect(outsideCityTag(edge, at(CHENNAI))).toBe('60 km away')
    expect(outsideCityLine(edge, at(CHENNAI))).toBe('This garage is about 60 km from Chennai.')
    expect(outsideCityTag({ lat: null, lng: null, area: '', garageCity: null }, at(CHENNAI))).toBeNull()
  })

  test('from an API before garageCity: a pin inside the city’s reach is in it', () => {
    expect(garageInCity({ lat: 13.05, lng: 80.25, area: 'Chennai' }, CHENNAI)).toBe(true)
    expect(garageInCity({ lat: 12.9165, lng: 79.1325, area: 'Vellore' }, CHENNAI)).toBe(false)
    expect(garageInCity({ lat: null, lng: null, area: 'Chennai', outsideServiceCity: null }, CHENNAI)).toBe(true)
    // The stand-in city before GET /cities answers matches by name.
    expect(garageInCity(CHENNAI_GARAGE, FALLBACK_CITY)).toBe(true)
  })
})

// The live list near Adyar on 10 Nov 2026: two Chennai garages, then three in
// Tirupur and near Rajapalayam that the count used to call "near you".
const ADYAR_LIST = [
  { ...CHENNAI_GARAGE, distanceKm: 2.4 },
  { ...CHENNAI_GARAGE, distanceKm: 13.5 },
  { lat: 11.1085, lng: 77.3411, garageCity: null, distanceKm: 387.3 },
  { lat: 9.45, lng: 77.55, garageCity: null, distanceKm: 474.8 },
  { lat: 9.46, lng: 77.56, garageCity: null, distanceKm: 491.2 },
]

describe('garages near you', () => {
  test('only garages within the customer’s city’s reach count, far towns never do', () => {
    expect(nearGarageCount(ADYAR_LIST, { located: true, hasMore: false, nearestFirst: true, city: CHENNAI })).toEqual({
      count: 2,
      more: false,
    })
    expect(isNearCustomer({ ...KOVAI_GARAGE, distanceKm: 31 }, { located: true, city: COIMBATORE })).toBe(false)
    expect(isNearCustomer({ ...KOVAI_GARAGE, distanceKm: 30 }, { located: true, city: COIMBATORE })).toBe(true)
  })

  test('without a location, garages in the customer’s city count', () => {
    const list = [{ ...KOVAI_GARAGE, distanceKm: null }, { ...CHENNAI_GARAGE, distanceKm: null }]
    expect(nearGarageCount(list, { located: false, hasMore: false, nearestFirst: false, city: COIMBATORE }).count).toBe(1)
  })

  test('no "+" once a nearest-first list has passed the reach', () => {
    expect(nearGarageCount(ADYAR_LIST, { located: true, hasMore: true, nearestFirst: true, city: CHENNAI }).more).toBe(false)
    expect(nearGarageCount(ADYAR_LIST.slice(0, 2), { located: true, hasMore: true, nearestFirst: true, city: CHENNAI }).more).toBe(true)
  })

  test('the Further away line sits above the first garage past the customer’s city’s reach', () => {
    expect(firstFarIndex(ADYAR_LIST, { located: true, nearestFirst: true, city: CHENNAI })).toBe(2)
    expect(firstFarIndex(ADYAR_LIST, { located: false, nearestFirst: true, city: CHENNAI })).toBe(-1)
    expect(firstFarIndex(ADYAR_LIST, { located: true, nearestFirst: false, city: CHENNAI })).toBe(-1)
    // Coimbatore reaches 30 km: a garage 35 km off is already "further away" there.
    const kovai = [{ ...KOVAI_GARAGE, distanceKm: 3 }, { ...KOVAI_GARAGE, distanceKm: 35 }]
    expect(firstFarIndex(kovai, { located: true, nearestFirst: true, city: COIMBATORE })).toBe(1)
  })
})

describe('garages within ~30 min', () => {
  // Live At-garage distances from two Chennai areas, 20 Nov 2026: the same 12
  // garages are all within the city's 50 km reach of both, so only the drive tells them apart.
  const km = (list: number[]) => list.map((distanceKm) => ({ ...CHENNAI_GARAGE, distanceKm }))
  const adyar = km([2.9, 5.7, 7.7, 8.2, 8.6, 11.3, 13.2, 13.5, 13.6, 18, 18.4, 19.4])
  const tambaram = km([0.5, 5.8, 6.4, 14.2, 15.5, 15.8, 15.9, 16.3, 19, 19.8, 20.3, 27.2])

  test('counts the garages within half an hour by the card’s own estimate', () => {
    expect(NEAR_DRIVE_MINUTES).toBe(30)
    expect(driveNearCount(adyar, { hasMore: false, nearestFirst: true })).toEqual({ count: 5, more: false })
    expect(driveNearCount(tambaram, { hasMore: false, nearestFirst: true })).toEqual({ count: 3, more: false })
    expect(nearGarageCount(adyar, { located: true, hasMore: false, nearestFirst: true, city: CHENNAI }).count).toBe(12)
  })

  test('10 km is ~30 min and in; just past it is out; a garage with no pin never counts', () => {
    expect(driveNearCount(km([10]), { hasMore: false, nearestFirst: true }).count).toBe(1)
    expect(driveNearCount(km([10.3]), { hasMore: false, nearestFirst: true }).count).toBe(0)
    expect(driveNearCount([{ ...CHENNAI_GARAGE, distanceKm: null }], { hasMore: false, nearestFirst: true }).count).toBe(0)
  })

  test('a "+" only while a nearest-first list may still hold closer garages', () => {
    expect(driveNearCount(adyar, { hasMore: true, nearestFirst: true }).more).toBe(false)
    expect(driveNearCount(adyar.slice(0, 3), { hasMore: true, nearestFirst: true }).more).toBe(true)
    expect(driveNearCount(adyar, { hasMore: true, nearestFirst: false }).more).toBe(true)
  })
})

describe('the map peek by mode', () => {
  const km = (list: number[]) => list.map((distanceKm) => ({ ...CHENNAI_GARAGE, distanceKm }))
  // Doorstep garages are often pinned far from the customer (or not at all):
  // the API only lists the ones that cover the customer's place.
  const coverMe = km([4.1, 12, 18.5, 25])
  const opts = { hasMore: false, nearestFirst: true }

  test('At garage counts the ~30 min drive', () => {
    expect(mapPeekCount('dropin', coverMe, opts)).toEqual({ count: 1, more: false, kind: 'drive' })
    expect(mapPeekWords({ count: 1, more: false, kind: 'drive' })).toBe('garage within ~30 min')
    expect(mapPeekWords({ count: 8, more: false, kind: 'drive' })).toBe('garages within ~30 min')
    expect(mapPeekCount('dropin', km([25]), opts)).toBeNull()
  })

  test('Doorstep and Pickup & drop count every garage that reaches the customer, however far its base', () => {
    expect(mapPeekCount('doorstep', coverMe, opts)).toEqual({ count: 4, more: false, kind: 'comes' })
    expect(mapPeekCount('pickup', coverMe, { ...opts, hasMore: true })).toEqual({ count: 4, more: true, kind: 'collects' })
    expect(mapPeekCount('doorstep', [{ ...CHENNAI_GARAGE, distanceKm: null }], opts)?.count).toBe(1)
    expect(mapPeekCount('doorstep', [], opts)).toBeNull()
  })

  test('their words', () => {
    expect(mapPeekWords({ count: 8, more: false, kind: 'comes' })).toBe('garages can come to you')
    expect(mapPeekWords({ count: 1, more: false, kind: 'comes' })).toBe('garage can come to you')
    expect(mapPeekWords({ count: 1, more: true, kind: 'comes' })).toBe('garages can come to you')
    expect(mapPeekWords({ count: 3, more: false, kind: 'collects' })).toBe('garages can pick up from you')
    expect(mapPeekWords({ count: 1, more: false, kind: 'collects' })).toBe('garage can pick up from you')
  })
})
