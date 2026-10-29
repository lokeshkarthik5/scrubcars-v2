import { normalisePhone } from '../leads.js'
import type { PlaceKind } from './kinds.js'
import type {
  FoundPlace,
  GoogleDetailsSource,
  GooglePlaceDetails,
  PlaceSearch,
  PlaceSourceName,
  PlacesSource,
} from './types.js'

/**
 * PLACES_FAKE=1 (E2E only; refused at boot in production): the zone finder
 * answers from this fixed list, placed a few hundred metres around whatever
 * zone is searched, and nothing reaches Google or Ola. Built so every part
 * of the finder shows: a place both sources found (same phone, a slightly
 * different name and pin: merged into one row with both tags), places only
 * one source has, one without a phone, one without a rating, and one per
 * kind. specs/admin/coverage-finder.spec.ts asserts on these names.
 *
 * Free words find the places whose name holds one of the words (3 letters
 * or more); words matching nothing find nothing, so "No businesses found"
 * can be shown too.
 */

interface FakePlace {
  source: PlaceSourceName
  placeId: string
  name: string
  address: string
  /** Metres north and east of the zone's centre. */
  north: number
  east: number
  phone: string | null
  rating: number | null
  reviewCount: number | null
  kinds: PlaceKind[]
}

export const FAKE_PLACES: readonly FakePlace[] = [
  {
    source: 'google',
    placeId: 'fake-google-shine',
    name: 'Shine Pro Detailing',
    address: '3rd Main Road',
    north: 120,
    east: 80,
    phone: '9840022417',
    rating: 4.7,
    reviewCount: 318,
    kinds: ['detailing'],
  },
  {
    source: 'ola',
    placeId: 'fake-ola-shine',
    name: 'Shine Pro Detailing Studio',
    address: '3rd Main Road',
    north: 140,
    east: 90,
    phone: '9840022417',
    rating: null,
    reviewCount: null,
    kinds: ['detailing'],
  },
  {
    source: 'google',
    placeId: 'fake-google-aqua',
    name: 'Aqua Foam Car Wash',
    address: 'Shanthi Colony',
    north: -150,
    east: 60,
    phone: '9790060193',
    rating: 4.4,
    reviewCount: 205,
    kinds: ['car_wash'],
  },
  {
    source: 'google',
    placeId: 'fake-google-gloss',
    name: 'Gloss Garage Ceramic',
    address: '2nd Avenue',
    north: 60,
    east: -170,
    phone: null,
    rating: 4.9,
    reviewCount: 37,
    kinds: ['detailing'],
  },
  {
    source: 'google',
    placeId: 'fake-google-doorstep',
    name: 'Splash Doorstep Wash',
    address: 'Shanthi Colony',
    north: -60,
    east: -90,
    phone: '9884012345',
    rating: 4.1,
    reviewCount: 22,
    kinds: ['doorstep'],
  },
  {
    source: 'ola',
    placeId: 'fake-ola-murugan',
    name: 'Sri Murugan Auto Works',
    address: 'Thirumangalam',
    north: 200,
    east: -40,
    phone: '9443011820',
    rating: null,
    reviewCount: null,
    kinds: ['workshop'],
  },
  {
    source: 'google',
    placeId: 'fake-google-tyres',
    name: 'Wheel Point Tyres',
    address: '6th Avenue',
    north: -200,
    east: -150,
    phone: '04426214400',
    rating: 4.2,
    reviewCount: 88,
    kinds: ['tyres'],
  },
]

/** The fake Google place whose details are gone (refresh clears it). */
export const FAKE_GONE_PLACE_ID = 'fake-google-gone'

function placed(
  fake: FakePlace,
  centre: { lat: number; lng: number }
): FoundPlace {
  const lat = centre.lat + fake.north / 111_320
  const lng =
    centre.lng + fake.east / (111_320 * Math.cos((centre.lat * Math.PI) / 180))
  return {
    source: fake.source,
    placeId: fake.placeId,
    name: fake.name,
    address: fake.address,
    lat,
    lng,
    phone: normalisePhone(fake.phone),
    rating: fake.rating,
    reviewCount: fake.reviewCount,
    kinds: [],
  }
}

function fakeSource(source: PlaceSourceName): PlacesSource {
  return {
    name: source,
    async search(query: PlaceSearch) {
      const words = query.text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3)
      return FAKE_PLACES.filter((fake) => fake.source === source)
        .filter((fake) =>
          query.kind
            ? fake.kinds.includes(query.kind)
            : words.some((word) => fake.name.toLowerCase().includes(word))
        )
        .map((fake) => ({
          ...placed(fake, query.centre),
          kinds: query.kind ? [query.kind] : [],
        }))
    },
  }
}

export function createFakePlaces(): {
  google: PlacesSource & GoogleDetailsSource
  ola: PlacesSource
} {
  return {
    google: {
      ...fakeSource('google'),
      async details(placeId: string): Promise<GooglePlaceDetails | null> {
        if (placeId === FAKE_GONE_PLACE_ID) return null
        const fake = FAKE_PLACES.find((place) => place.placeId === placeId)
        // Any other id reads as a place Google still has, renamed so a
        // refresh is visible.
        return {
          name: fake ? fake.name : 'Refreshed Google Place',
          address: fake ? fake.address : 'Refreshed address',
          phone: fake ? normalisePhone(fake.phone) : null,
          rating: fake ? fake.rating : 4,
          reviewCount: fake ? fake.reviewCount : 10,
          lat: null,
          lng: null,
        }
      },
    },
    ola: fakeSource('ola'),
  }
}
