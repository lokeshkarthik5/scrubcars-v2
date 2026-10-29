import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const {
  boxAround,
  createGooglePlaces,
  fromGooglePlace,
  GOOGLE_SEARCH_FIELD_MASK,
} = await import('./google.js')
const { fromOlaPlace, withOlaDetails } = await import('./ola.js')
const { createFakePlaces, FAKE_GONE_PLACE_ID } = await import('./fake.js')
const { zoneFor } = await import('../zones.js')
const { CHENNAI_ZONES } = await import('../zones.js')

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('Google', () => {
  test('a search asks for exactly the fields shown, inside the zone’s box, one page', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(
        JSON.stringify({
          places: [
            {
              id: 'g1',
              displayName: { text: 'Shine Pro Detailing' },
              formattedAddress: '3rd Main Rd, Anna Nagar',
              location: { latitude: 13.086, longitude: 80.211 },
              rating: 4.7,
              userRatingCount: 318,
              nationalPhoneNumber: '098400 22417',
            },
            { id: 'no-location', displayName: { text: 'Broken' } },
          ],
        }),
        { status: 200 }
      )
    }) as typeof fetch
    const google = createGooglePlaces('test-key')
    const places = await google.search({
      text: 'car wash',
      kind: 'car_wash',
      centre: { lat: 13.085, lng: 80.21 },
      radiusKm: 6,
    })
    expect(places).toEqual([
      {
        source: 'google',
        placeId: 'g1',
        name: 'Shine Pro Detailing',
        address: '3rd Main Rd, Anna Nagar',
        lat: 13.086,
        lng: 80.211,
        phone: '9840022417',
        rating: 4.7,
        reviewCount: 318,
        kinds: ['car_wash'],
      },
    ])
    const headers = seen!.init.headers as Record<string, string>
    expect(seen!.url).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(headers['X-Goog-Api-Key']).toBe('test-key')
    expect(headers['X-Goog-FieldMask']).toBe(GOOGLE_SEARCH_FIELD_MASK)
    expect(GOOGLE_SEARCH_FIELD_MASK.split(',')).toEqual([
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.rating',
      'places.userRatingCount',
      'places.nationalPhoneNumber',
    ])
    const body = JSON.parse(String(seen!.init.body))
    expect(body).toMatchObject({
      textQuery: 'car wash',
      pageSize: 20,
      regionCode: 'IN',
    })
    expect(body.locationRestriction.rectangle).toEqual(
      boxAround({ lat: 13.085, lng: 80.21 }, 6)
    )
  })

  test('a refusal is an error carrying the status only; details 404 is "no longer there"', async () => {
    globalThis.fetch = (async () =>
      new Response('{"error":{"message":"textQuery was car wash"}}', {
        status: 403,
      })) as unknown as typeof fetch
    const google = createGooglePlaces('test-key')
    await expect(
      google.search({
        text: 'car wash',
        kind: null,
        centre: { lat: 13, lng: 80 },
        radiusKm: 6,
      })
    ).rejects.toMatchObject({
      name: 'PlacesProviderError',
      status: 403,
      message: 'Google refused the search',
    })
    globalThis.fetch = (async () =>
      new Response('{}', { status: 404 })) as unknown as typeof fetch
    expect(await google.details('gone')).toBeNull()
  })

  test('the box covers the circle', () => {
    const box = boxAround({ lat: 13.085, lng: 80.21 }, 6)
    expect(box.high.latitude - 13.085).toBeCloseTo(6 / 111.32, 6)
    expect(box.high.longitude - 80.21).toBeGreaterThan(6 / 111.32)
  })

  test('a place without an id, name or location is left out; odd ratings are none', () => {
    expect(
      fromGooglePlace(
        {
          id: 'x',
          displayName: { text: ' ' },
          location: { latitude: 1, longitude: 1 },
        },
        null
      )
    ).toBeNull()
    expect(
      fromGooglePlace(
        {
          id: 'x',
          displayName: { text: 'A' },
          location: { latitude: 1, longitude: 1 },
          rating: 7,
          userRatingCount: -1,
        },
        null
      )
    ).toMatchObject({ rating: null, reviewCount: null })
  })
})

describe('Ola', () => {
  test('a text search row, and its details adding phone and rating', () => {
    const place = fromOlaPlace(
      {
        place_id: 'o1',
        name: 'Sri Murugan Auto Works',
        formatted_address: 'Thirumangalam',
        geometry: { location: { lat: 13.08, lng: 80.2 } },
      },
      'workshop'
    )
    expect(place).toMatchObject({
      source: 'ola',
      placeId: 'o1',
      phone: null,
      rating: null,
      kinds: ['workshop'],
    })
    expect(
      withOlaDetails(place!, {
        formatted_phone_number: '094430 11820',
        rating: 4.12,
        user_ratings_total: 9,
      })
    ).toMatchObject({
      phone: '9443011820',
      rating: 4.1,
      reviewCount: 9,
    })
    expect(withOlaDetails(place!, undefined)).toBe(place!)
  })
})

describe('PLACES_FAKE', () => {
  test('every fake place lands inside the zone searched, for every zone', async () => {
    const fake = createFakePlaces()
    for (const zone of CHENNAI_ZONES) {
      for (const source of [fake.google, fake.ola]) {
        for (const kind of [
          'car_wash',
          'detailing',
          'doorstep',
          'workshop',
          'tyres',
        ] as const) {
          const places = await source.search({
            text: '',
            kind,
            centre: zone,
            radiusKm: 6,
          })
          for (const place of places)
            expect(zoneFor(place, CHENNAI_ZONES)?.slug).toBe(zone.slug)
        }
      }
    }
  })

  test('free words find names holding them; nothing matching finds nothing', async () => {
    const fake = createFakePlaces()
    const centre = { lat: 13.085, lng: 80.2101 }
    expect(
      (
        await fake.google.search({
          text: 'ceramic gloss',
          kind: null,
          centre,
          radiusKm: 6,
        })
      ).map((p) => p.name)
    ).toEqual(['Gloss Garage Ceramic'])
    expect(
      await fake.ola.search({
        text: 'zzz nothing',
        kind: null,
        centre,
        radiusKm: 6,
      })
    ).toEqual([])
  })

  test('details: a known fake, any other id renamed, the gone one null', async () => {
    const fake = createFakePlaces()
    expect((await fake.google.details('fake-google-aqua'))?.name).toBe(
      'Aqua Foam Car Wash'
    )
    expect((await fake.google.details('anything'))?.name).toBe(
      'Refreshed Google Place'
    )
    expect(await fake.google.details(FAKE_GONE_PLACE_ID)).toBeNull()
  })
})
