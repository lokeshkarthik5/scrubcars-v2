import { describe, expect, test } from 'bun:test'
import {
  findDuplicates,
  nameWords,
  samePlace,
  similarNames,
  type PlaceLike,
} from './lead-match.js'

/** A point `metres` north of the first. */
const north = (lat: number, metres: number) => lat + metres / 111_320

describe('similarNames', () => {
  test('the same business written differently', () => {
    expect(similarNames('Speed Car Wash', 'Speed Wash')).toBe(true)
    expect(
      similarNames('Shine Pro Detailing', 'Shine Pro Detailing Studio')
    ).toBe(true)
    expect(similarNames('Speed Wash', 'Speed Wash Anna Nagar')).toBe(true)
    expect(similarNames('Sri Murugan Auto Works', 'Murugan Car Wash')).toBe(
      true
    )
    expect(similarNames('KA Car Wash', 'K.A. Car Wash')).toBe(false) // "ka" vs "k a": different words
    expect(similarNames('Glossy Doorstep', 'Glosy Doorstep')).toBe(true) // a typo
    expect(similarNames('A & B Motors', 'A and B Motors')).toBe(true)
  })

  test('different businesses', () => {
    expect(similarNames('Sri Murugan Auto Works', 'Sri Krishna Car Wash')).toBe(
      false
    )
    expect(similarNames('Aqua Foam Car Wash', 'Shine Pro Detailing')).toBe(
      false
    )
    expect(similarNames('Car Wash', 'Car Spa')).toBe(false)
    expect(similarNames('', 'Speed Wash')).toBe(false)
  })

  test('names of only generic words match only when they are the same words', () => {
    expect(similarNames('Car Wash', 'car  wash!')).toBe(true)
    expect(similarNames('Car Wash', 'Car Wash Centre')).toBe(false)
  })

  test('nameWords: lower case, no punctuation, & as and', () => {
    expect(nameWords("Raja's Car-Care & Co.")).toEqual([
      'raja',
      's',
      'car',
      'care',
      'and',
      'co',
    ])
  })
})

describe('samePlace', () => {
  const base: PlaceLike = {
    name: 'Speed Wash',
    phones: ['98400 12345'],
    lat: 13.085,
    lng: 80.21,
    zoneId: 'z1',
  }

  test('the same phone, however written, wherever the pin', () => {
    expect(
      samePlace(
        base,
        { name: 'Other', phones: ['+91 9840012345'], lat: 12.9, lng: 80.1 },
        150
      )
    ).toBe('phone')
    // A garage's WhatsApp counts as its number too.
    expect(
      samePlace(
        base,
        {
          name: 'Other',
          phones: ['4423456789', '9840012345'],
          lat: null,
          lng: null,
        },
        150
      )
    ).toBe('phone')
  })

  test('the same Google or Ola place id', () => {
    expect(
      samePlace(
        { ...base, phones: [], googlePlaceId: 'g1' },
        { name: 'X', phones: [], lat: null, lng: null, googlePlaceId: 'g1' },
        150
      )
    ).toBe('place_id')
    expect(
      samePlace(
        { ...base, phones: [], olaPlaceId: 'o1' },
        { name: 'X', phones: [], lat: null, lng: null, olaPlaceId: 'o1' },
        150
      )
    ).toBe('place_id')
  })

  test('a similar name within the distance, and not beyond it', () => {
    const near = {
      name: 'Speed Car Wash',
      phones: [],
      lat: north(13.085, 140),
      lng: 80.21,
    }
    const far = {
      name: 'Speed Car Wash',
      phones: [],
      lat: north(13.085, 160),
      lng: 80.21,
    }
    expect(samePlace({ ...base, phones: [] }, near, 150)).toBe('name_nearby')
    expect(samePlace({ ...base, phones: [] }, far, 150)).toBeNull()
    // The finder's merge uses 100 m.
    expect(samePlace({ ...base, phones: [] }, near, 100)).toBeNull()
  })

  test('with a pin missing: only the same name in the same zone', () => {
    const unpinned = {
      name: 'speed wash',
      phones: [],
      lat: null,
      lng: null,
      zoneId: 'z1',
    }
    expect(samePlace({ ...base, phones: [] }, unpinned, 150)).toBe(
      'same_name_zone'
    )
    expect(
      samePlace({ ...base, phones: [] }, { ...unpinned, zoneId: 'z2' }, 150)
    ).toBeNull()
    expect(
      samePlace(
        { ...base, phones: [] },
        { ...unpinned, name: 'Speed Car Wash' },
        150
      )
    ).toBeNull()
  })

  test('different numbers and different names are not the same', () => {
    expect(
      samePlace(
        base,
        { name: 'Aqua Foam', phones: ['9790060193'], lat: 13.085, lng: 80.21 },
        150
      )
    ).toBeNull()
  })
})

test('findDuplicates: every match with why, in the order given', () => {
  const known = [
    {
      id: 'a',
      name: 'Aqua Foam',
      phones: ['9790060193'],
      lat: 13.0,
      lng: 80.0,
    },
    { id: 'b', name: 'Speed Car Wash', phones: [], lat: 13.085, lng: 80.21 },
    { id: 'c', name: 'Another', phones: ['9840012345'], lat: null, lng: null },
  ]
  const found = findDuplicates(
    { name: 'Speed Wash', phones: ['9840012345'], lat: 13.085, lng: 80.2101 },
    known,
    150
  )
  expect(found.map(({ match, reason }) => [match.id, reason])).toEqual([
    ['b', 'name_nearby'],
    ['c', 'phone'],
  ])
})
