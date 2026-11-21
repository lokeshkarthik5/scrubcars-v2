import { describe, expect, test } from 'bun:test'
import { referralCredit } from './area-signups.js'
import type { RecommendationLink, RecommendationPhoneCandidate } from './recommendations.js'

// The Maps link reader sits beside the geo providers, which read the env;
// nothing here connects to anything.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const { garageMatchPhones, leadFromRecommendation, recommendationGarageChanges, recommendationsMatchingGarage } =
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
    })
    expect(first).toEqual({ amountRupees: 500 })
    // A second recommendation of the same garage by the same customer.
    expect(
      referralCredit({
        vendorId: GARAGE,
        garageLive: true,
        completedPaidBooking: true,
        alreadyCreditedForGarage: true,
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

describe('bring your garage: a garage that signs up itself, matched by phone', () => {
  const candidate = (patch: Partial<RecommendationPhoneCandidate> = {}): RecommendationPhoneCandidate => ({
    id: 'rec-1',
    status: 'new',
    vendorId: null,
    creditStatus: null,
    phone: '9840123456',
    userId: 'priya',
    ...patch,
  })

  test('the garage’s numbers: its phone, WhatsApp and owner login, as ten digits, mobiles only', () => {
    expect(garageMatchPhones({ phone: '+91 98401 23456', whatsapp: '09840123456', ownerPhone: '919840654321' })).toEqual([
      '9840123456',
      '9840654321',
    ])
    // A landline (044…) can never be a recommendation's phone, so it is left out.
    expect(garageMatchPhones({ phone: '044 2490 1234', whatsapp: null, ownerPhone: null })).toEqual([])
    expect(garageMatchPhones({ phone: null })).toEqual([])
  })

  test('a recommendation with the same number, new or contacted, is the garage’s', () => {
    expect(recommendationsMatchingGarage([candidate()], ['9840123456'])).toEqual(['rec-1'])
    expect(recommendationsMatchingGarage([candidate({ status: 'contacted' })], ['9840123456'])).toEqual(['rec-1'])
    // Normalised on both sides: a phone stored with a 0 still matches (old rows were checked to ten digits anyway).
    expect(recommendationsMatchingGarage([candidate({ phone: '09840123456' })], ['9840123456'])).toEqual(['rec-1'])
  })

  test('every customer who recommended the number is linked, each to earn once', () => {
    const recs = [
      candidate({ id: 'a', userId: 'priya' }),
      candidate({ id: 'b', userId: 'arun' }),
      candidate({ id: 'c', userId: 'priya', phone: '9840999999' }),
    ]
    expect(recommendationsMatchingGarage(recs, ['9840123456'])).toEqual(['a', 'b'])
  })

  test('never: another number, no phone, dismissed, joined, linked, or credit decided', () => {
    const phones = ['9840123456']
    expect(recommendationsMatchingGarage([candidate({ phone: '9840000000' })], phones)).toEqual([])
    expect(recommendationsMatchingGarage([candidate({ phone: null })], phones)).toEqual([])
    expect(recommendationsMatchingGarage([candidate({ status: 'declined' })], phones)).toEqual([])
    expect(recommendationsMatchingGarage([candidate({ status: 'joined' })], phones)).toEqual([])
    // Already following a lead to a garage: the team's link stands.
    expect(recommendationsMatchingGarage([candidate({ status: 'contacted', vendorId: OTHER })], phones)).toEqual([])
    expect(recommendationsMatchingGarage([candidate({ creditStatus: 'owed' })], phones)).toEqual([])
    expect(recommendationsMatchingGarage([candidate()], [])).toEqual([])
  })

  test('the team’s manual link still moves a phone-matched one until its credit is decided', () => {
    // Joined by the sign-up, then the team links its lead to another garage: it follows, as before.
    const joined = { id: 'rec-1', status: 'joined' as const, vendorId: GARAGE, creditStatus: null }
    expect(recommendationGarageChanges([joined], OTHER)).toEqual([{ id: 'rec-1', vendorId: OTHER, status: 'joined' }])
  })
})
