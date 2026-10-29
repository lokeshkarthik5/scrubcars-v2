import { describe, expect, test } from 'bun:test'
import { referralCredit } from './area-signups.js'
import type { RecommendationLink } from './recommendations.js'

// The Maps link reader sits beside the geo providers, which read the env;
// nothing here connects to anything.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const { leadFromRecommendation, recommendationGarageChanges } =
  await import('./recommendations.js')

const GARAGE = 'garage-1'
const OTHER = 'garage-2'

const rec = (patch: Partial<RecommendationLink> = {}): RecommendationLink => ({
  id: 'rec-1',
  status: 'contacted',
  vendorId: null,
  creditStatus: null,
  ...patch,
})

/** The rule's changes applied, as the repository writes them. */
function apply(
  recs: RecommendationLink[],
  vendorId: string | null
): RecommendationLink[] {
  const changes = recommendationGarageChanges(recs, vendorId)
  return recs.map((r) => {
    const change = changes.find((c) => c.id === r.id)
    return change ? { ...r, ...change } : r
  })
}

describe('recommendationGarageChanges: a recommendation follows its lead’s garage', () => {
  test('the lead becomes a garage: joined, with the garage', () => {
    expect(recommendationGarageChanges([rec()], GARAGE)).toEqual([
      { id: 'rec-1', vendorId: GARAGE, status: 'joined' },
    ])
  })

  test('linked once: a second link to the same garage changes nothing', () => {
    const once = apply([rec()], GARAGE)
    expect(once[0]).toMatchObject({ vendorId: GARAGE, status: 'joined' })
    expect(recommendationGarageChanges(once, GARAGE)).toEqual([])
  })

  test('the lead linked to another garage, or unlinked, while no credit is decided', () => {
    const joined = rec({ status: 'joined', vendorId: GARAGE })
    expect(recommendationGarageChanges([joined], OTHER)).toEqual([
      { id: 'rec-1', vendorId: OTHER, status: 'joined' },
    ])
    expect(recommendationGarageChanges([joined], null)).toEqual([
      { id: 'rec-1', vendorId: null, status: 'contacted' },
    ])
  })

  test('once its credit is decided (owed or granted) nothing moves it again', () => {
    for (const creditStatus of ['owed', 'granted'] as const) {
      const credited = rec({ status: 'joined', vendorId: GARAGE, creditStatus })
      expect(recommendationGarageChanges([credited], OTHER)).toEqual([])
      expect(recommendationGarageChanges([credited], null)).toEqual([])
    }
  })

  test('a dismissed or still-new one is never touched', () => {
    expect(
      recommendationGarageChanges(
        [rec({ id: 'a', status: 'declined' }), rec({ id: 'b', status: 'new' })],
        GARAGE
      )
    ).toEqual([])
  })

  test('two customers who recommended the same garage are both linked', () => {
    const changes = recommendationGarageChanges(
      [rec({ id: 'a' }), rec({ id: 'b' })],
      GARAGE
    )
    expect(changes.map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('the referral credit on that link is paid once (customer reach’s rule)', () => {
  test('the linked garage, live, a paid booking: credit; the same garage again: none', () => {
    const [linked] = apply([rec()], GARAGE)
    const first = referralCredit({
      vendorId: linked!.vendorId,
      garageLive: true,
      completedPaidBooking: true,
      alreadyCreditedForGarage: false,
      creditedSoFarRupees: 0,
    })
    expect(first).toEqual({ amountRupees: 100 })
    // A second recommendation of the same garage by the same customer.
    expect(
      referralCredit({
        vendorId: GARAGE,
        garageLive: true,
        completedPaidBooking: true,
        alreadyCreditedForGarage: true,
        creditedSoFarRupees: 100,
      })
    ).toEqual({ refusal: 'ALREADY_FOR_GARAGE' })
  })

  test('not linked (the lead never became a garage): no credit', () => {
    expect(
      referralCredit({
        vendorId: rec().vendorId,
        garageLive: true,
        completedPaidBooking: true,
        alreadyCreditedForGarage: false,
        creditedSoFarRupees: 0,
      })
    ).toEqual({ refusal: 'NOT_LINKED' })
  })
})

describe('leadFromRecommendation', () => {
  const ZONES = [
    { id: 'perambur', lat: 13.1167, lng: 80.2333 },
    { id: 'adyar', lat: 13.0012, lng: 80.2565 },
  ]

  test('a Maps link with a pin: the pin and the zone it is in', () => {
    expect(
      leadFromRecommendation(
        {
          name: '  Kolathur Shine  ',
          phone: '9000005060',
          mapsLink: 'https://www.google.com/maps/@13.0015,80.2560,17z',
          zoneId: 'perambur',
        },
        ZONES
      )
    ).toEqual({
      name: 'Kolathur Shine',
      phone: '9000005060',
      mapsUrl: 'https://www.google.com/maps/@13.0015,80.2560,17z',
      lat: 13.0015,
      lng: 80.256,
      pinSource: 'maps_link',
      zoneId: 'adyar',
    })
  })

  test('no pin in the link, or no link: the zone it was recommended in', () => {
    expect(
      leadFromRecommendation(
        {
          name: 'Shine',
          phone: null,
          mapsLink: 'https://maps.app.goo.gl/abc123',
          zoneId: 'perambur',
        },
        ZONES
      )
    ).toMatchObject({ lat: null, lng: null, pinSource: null, zoneId: 'perambur' })
    expect(
      leadFromRecommendation(
        { name: 'Shine', phone: '9000005061', mapsLink: null, zoneId: null },
        ZONES
      )
    ).toMatchObject({ phone: '9000005061', zoneId: null, mapsUrl: null })
  })
})
