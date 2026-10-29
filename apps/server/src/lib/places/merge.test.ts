import { describe, expect, test } from 'bun:test'
import {
  dedupeSource,
  finderCounts,
  markKnown,
  mergePlaces,
  type KnownPlace,
} from './merge.js'
import type { FoundPlace } from './types.js'

const CENTRE = { lat: 13.085, lng: 80.2101 }
const north = (metres: number) => CENTRE.lat + metres / 111_320

const place = (
  over: Partial<FoundPlace> & Pick<FoundPlace, 'source' | 'placeId' | 'name'>
): FoundPlace => ({
  address: null,
  lat: CENTRE.lat,
  lng: CENTRE.lng,
  phone: null,
  rating: null,
  reviewCount: null,
  kinds: [],
  ...over,
})

describe('dedupeSource', () => {
  test('a place two kinds found is listed once with both kinds, in kind order', () => {
    const found = dedupeSource([
      place({
        source: 'google',
        placeId: 'g1',
        name: 'Shine',
        kinds: ['detailing'],
      }),
      place({
        source: 'google',
        placeId: 'g1',
        name: 'Shine',
        kinds: ['car_wash'],
      }),
      place({
        source: 'google',
        placeId: 'g2',
        name: 'Other',
        kinds: ['tyres'],
      }),
    ])
    expect(found.map((p) => [p.placeId, p.kinds])).toEqual([
      ['g1', ['car_wash', 'detailing']],
      ['g2', ['tyres']],
    ])
  })
})

describe('mergePlaces', () => {
  test('the same business at both sources shows once with both, Google first', () => {
    const merged = mergePlaces(
      [
        place({
          source: 'google',
          placeId: 'g1',
          name: 'Shine Pro Detailing',
          phone: '9840022417',
          rating: 4.7,
          reviewCount: 318,
          lat: north(100),
          kinds: ['detailing'],
        }),
      ],
      [
        place({
          source: 'ola',
          placeId: 'o1',
          name: 'Shine Pro Detailing Studio',
          phone: '9840022417',
          lat: north(130),
          address: 'Ola address',
          kinds: ['detailing'],
        }),
      ],
      CENTRE
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      key: 'google:g1',
      name: 'Shine Pro Detailing',
      phone: '9840022417',
      rating: 4.7,
      reviewCount: 318,
      address: 'Ola address',
      distanceKm: 0.1,
      known: null,
    })
    expect(merged[0].google?.placeId).toBe('g1')
    expect(merged[0].ola?.placeId).toBe('o1')
  })

  test('a similar name within 100 m merges without a phone; 120 m apart does not', () => {
    const google = [
      place({
        source: 'google',
        placeId: 'g1',
        name: 'Speed Car Wash',
        lat: north(0),
      }),
    ]
    expect(
      mergePlaces(
        google,
        [
          place({
            source: 'ola',
            placeId: 'o1',
            name: 'Speed Wash',
            lat: north(80),
          }),
        ],
        CENTRE
      )
    ).toHaveLength(1)
    expect(
      mergePlaces(
        google,
        [
          place({
            source: 'ola',
            placeId: 'o1',
            name: 'Speed Wash',
            lat: north(120),
          }),
        ],
        CENTRE
      )
    ).toHaveLength(2)
  })

  test('each Google place takes one Ola place at most; the rest are their own rows', () => {
    const merged = mergePlaces(
      [
        place({
          source: 'google',
          placeId: 'g1',
          name: 'Speed Wash',
          phone: '9840012345',
        }),
      ],
      [
        place({
          source: 'ola',
          placeId: 'o1',
          name: 'Speed Wash',
          phone: '9840012345',
        }),
        place({
          source: 'ola',
          placeId: 'o2',
          name: 'Speed Wash',
          phone: '9840012345',
        }),
        place({
          source: 'ola',
          placeId: 'o3',
          name: 'Sri Murugan Auto Works',
          phone: '9443011820',
          kinds: ['workshop'],
        }),
      ],
      CENTRE
    )
    expect(
      merged.map((p) => [p.key, Boolean(p.google), Boolean(p.ola)])
    ).toEqual([
      ['google:g1', true, true],
      ['ola:o2', false, true],
      ['ola:o3', false, true],
    ])
  })

  test('an Ola-only place shows Ola’s own phone and rating', () => {
    const [only] = mergePlaces(
      [],
      [
        place({
          source: 'ola',
          placeId: 'o3',
          name: 'Sri Murugan',
          phone: '9443011820',
          rating: 3.9,
          reviewCount: 4,
        }),
      ],
      CENTRE
    )
    expect(only).toMatchObject({
      key: 'ola:o3',
      phone: '9443011820',
      rating: 3.9,
      reviewCount: 4,
      google: null,
    })
  })
})

describe('markKnown and the counts', () => {
  const known: KnownPlace[] = [
    {
      kind: 'lead',
      id: 'lead-1',
      label: 'Speed Wash Anna Nagar',
      name: 'Speed Wash Anna Nagar',
      phones: ['9840012345'],
      lat: null,
      lng: null,
      status: 'to_target',
      assignedName: 'Priya',
      notInterestedReason: null,
    },
    {
      kind: 'garage',
      id: 'garage-1',
      label: 'SJA Car Care',
      name: 'SJA Car Care',
      phones: [],
      lat: north(50),
      lng: CENTRE.lng,
      status: 'live',
      assignedName: null,
      notInterestedReason: null,
    },
    {
      kind: 'lead',
      id: 'lead-2',
      label: 'KA Car Wash',
      name: 'KA Car Wash',
      phones: [],
      lat: null,
      lng: null,
      googlePlaceId: 'g-ka',
      status: 'not_interested',
      assignedName: null,
      notInterestedReason: 'Has their own app',
    },
  ]

  test('by phone, by a similar name within 150 m, by place id; the rest are new', () => {
    const merged = mergePlaces(
      [
        place({
          source: 'google',
          placeId: 'g-speed',
          name: 'Speed Wash',
          phone: '+91 98400 12345',
        }),
        place({
          source: 'google',
          placeId: 'g-sja',
          name: 'SJA Car Care Centre',
          lat: north(120),
        }),
        place({ source: 'google', placeId: 'g-ka', name: 'K A Wash' }),
        place({
          source: 'google',
          placeId: 'g-new',
          name: 'Gloss Garage Ceramic',
          lat: north(-400),
        }),
      ],
      [
        place({
          source: 'ola',
          placeId: 'o-new',
          name: 'Sri Murugan Auto Works',
          lat: north(300),
        }),
      ],
      CENTRE
    )
    const marked = markKnown(merged, known)
    expect(
      marked.map(
        (p) =>
          p.known && [p.known.kind, p.known.id, p.known.status, p.known.reason]
      )
    ).toEqual([
      ['lead', 'lead-1', 'to_target', 'phone'],
      ['garage', 'garage-1', 'live', 'name_nearby'],
      ['lead', 'lead-2', 'not_interested', 'place_id'],
      null,
      null,
    ])
    expect(marked[0].known?.assignedName).toBe('Priya')
    expect(marked[2].known?.notInterestedReason).toBe('Has their own app')
    expect(finderCounts(marked)).toEqual({
      found: 5,
      google: 4,
      ola: 1,
      both: 0,
      known: 3,
      new: 2,
    })
  })

  test('the counts say how many were in both', () => {
    const merged = mergePlaces(
      [
        place({
          source: 'google',
          placeId: 'g1',
          name: 'A1 Wash',
          phone: '9000000001',
        }),
        place({ source: 'google', placeId: 'g2', name: 'B2 Wash' }),
      ],
      [
        place({
          source: 'ola',
          placeId: 'o1',
          name: 'A1 Car Wash',
          phone: '9000000001',
        }),
      ],
      CENTRE
    )
    expect(finderCounts(merged)).toEqual({
      found: 2,
      google: 2,
      ola: 1,
      both: 1,
      known: 0,
      new: 2,
    })
  })
})
