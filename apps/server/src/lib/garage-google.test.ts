import { describe, expect, test } from 'bun:test'
import {
  adminGoogleListing,
  GARAGE_GOOGLE_RESULTS_MAX,
  garageGooglePlaces,
  googleLinkPin,
  googleLinkPlan,
  googleUnlinkPatch,
  metresBetween,
} from './garage-google.js'

const GARAGE = 'garage-1'
const OTHER = 'garage-2'
const NOW = new Date('2026-11-21T06:00:00Z')
const DAY = 24 * 60 * 60 * 1000

describe('googleLinkPlan: where the listing goes', () => {
  const own = { id: 'lead-own', vendorId: GARAGE, googlePlaceId: 'p-old' }

  test('the garage’s own lead takes a new place (a first link or a Change)', () => {
    expect(googleLinkPlan(GARAGE, own, null)).toEqual({ kind: 'update', leadId: 'lead-own' })
    expect(googleLinkPlan(GARAGE, { ...own, googlePlaceId: null }, null)).toEqual({ kind: 'update', leadId: 'lead-own' })
  })

  test('the same place again is read again on the same lead', () => {
    expect(googleLinkPlan(GARAGE, own, own)).toEqual({ kind: 'update', leadId: 'lead-own' })
  })

  test('no lead and nobody holds the place: one is made', () => {
    expect(googleLinkPlan(GARAGE, null, null)).toEqual({ kind: 'create' })
  })

  test('a lead not yet a garage holding the place becomes this garage’s, when it has none', () => {
    const coverage = { id: 'lead-cov', vendorId: null, googlePlaceId: 'p-new' }
    expect(googleLinkPlan(GARAGE, null, coverage)).toEqual({ kind: 'link_lead', leadId: 'lead-cov' })
    // With a lead of its own, the place cannot be on two leads: refused with what to do.
    expect(googleLinkPlan(GARAGE, own, coverage)).toEqual({ kind: 'on_other_lead', leadId: 'lead-cov' })
  })

  test('another garage’s listing is never taken', () => {
    const theirs = { id: 'lead-theirs', vendorId: OTHER, googlePlaceId: 'p-new' }
    expect(googleLinkPlan(GARAGE, own, theirs)).toEqual({ kind: 'taken', leadId: 'lead-theirs', vendorId: OTHER })
    expect(googleLinkPlan(GARAGE, null, theirs).kind).toBe('taken')
  })
})

describe('googleLinkPin: a pin from Google follows the place linked', () => {
  const fromGoogle = { pinSource: 'google', googlePlaceId: 'p-old' }
  const at = { lat: 13.1, lng: 80.2 }
  const nowhere = { lat: null, lng: null }

  test('moves to the linked place’s location, read now', () => {
    expect(googleLinkPin(fromGoogle, 'p-new', at)).toEqual(at)
    expect(googleLinkPin(fromGoogle, 'p-old', at)).toEqual(at)
  })

  test('a Change to a place Google gave no location: the old place’s pin goes', () => {
    expect(googleLinkPin(fromGoogle, 'p-new', nowhere)).toBeNull()
  })

  test('the same place with no location keeps it, as the nightly refresh does', () => {
    expect(googleLinkPin(fromGoogle, 'p-old', nowhere)).toBeUndefined()
  })

  test('the team’s own pin is never touched', () => {
    for (const pinSource of ['map', 'maps_link', 'ola', null]) {
      expect(googleLinkPin({ pinSource, googlePlaceId: 'p-old' }, 'p-new', at)).toBeUndefined()
      expect(googleLinkPin({ pinSource, googlePlaceId: 'p-old' }, 'p-new', nowhere)).toBeUndefined()
    }
  })
})

describe('googleUnlinkPatch', () => {
  test('clears the place id and everything Google gave', () => {
    expect(googleUnlinkPatch({ name: 'Shine Hub', pinSource: 'map' }, 'Shine Hub Car Spa', 120)).toEqual({
      googlePlaceId: null,
      googleName: null,
      googlePhone: null,
      googleAddress: null,
      googleRating: null,
      googleReviewCount: null,
      googleFetchedAt: null,
    })
  })

  test('a pin from Google goes with it; a lead named only by Google takes the garage’s name', () => {
    const patch = googleUnlinkPatch({ name: null, pinSource: 'google' }, '  Royal Car Wash ', 120)
    expect(patch).toMatchObject({ name: 'Royal Car Wash', lat: null, lng: null, pinSource: null })
  })
})

describe('adminGoogleListing: the side panel', () => {
  const lead = {
    id: 'lead-1',
    source: 'google',
    googlePlaceId: 'p-1',
    googleName: 'Shine Hub Car Spa & Detailing',
    googleAddress: '14, 2nd Ave, Kilpauk',
    googleRating: '4.6',
    googleReviewCount: 312,
    googleFetchedAt: new Date('2026-11-14T00:00:00Z'),
  }

  test('rating, when read and when read next (29 days on), and customers see it under 5', () => {
    const view = adminGoogleListing(lead, 2, { by: 'Mathew', at: new Date('2026-11-02T00:00:00Z') }, NOW)
    expect(view).toMatchObject({
      name: 'Shine Hub Car Spa & Detailing',
      google: { rating: 4.6, reviewCount: 312 },
      readAt: '2026-11-14T00:00:00.000Z',
      nextReadBy: '2026-12-13T00:00:00.000Z',
      detlioReviews: 2,
      shown: true,
      linkedBy: 'Mathew',
    })
  })

  test('from 5 Detlio reviews customers no longer see it on cards', () => {
    expect(adminGoogleListing(lead, 5, null, NOW).shown).toBe(false)
  })

  test('cleared by the refresh (Google lost it) or 30 days old: no rating, no Google name kept', () => {
    const cleared = adminGoogleListing({ ...lead, googleName: null, googleAddress: null, googleRating: null, googleReviewCount: null, googleFetchedAt: null }, 0, null, NOW)
    expect(cleared).toMatchObject({ google: null, readAt: null, nextReadBy: null, shown: false })
    const old = adminGoogleListing({ ...lead, googleFetchedAt: new Date(NOW.getTime() - 31 * DAY) }, 0, null, NOW)
    expect(old).toMatchObject({ google: null, name: null, address: null, shown: false })
  })
})

describe('garageGooglePlaces: the dialog’s list', () => {
  const pin = { lat: 13.08, lng: 80.24 }
  const place = (placeId: string, north: number) => ({
    placeId,
    name: `Place ${placeId}`,
    address: null,
    lat: pin.lat + north / 111_320,
    lng: pin.lng,
    rating: 4.1,
    reviewCount: 9,
  })

  test('nearest the pin first, each place once, with who holds it', () => {
    const list = garageGooglePlaces(
      pin,
      [place('far', 6800), place('near', 120), place('mid', 900), place('near', 120)],
      GARAGE,
      [
        { leadId: 'l1', leadName: 'Mid lead', placeId: 'mid', vendorId: null, garageName: null },
        { leadId: 'l2', leadName: 'Far lead', placeId: 'far', vendorId: OTHER, garageName: 'Velan Car Care' },
        { leadId: 'l3', leadName: 'Near lead', placeId: 'near', vendorId: GARAGE, garageName: 'Shine Hub' },
      ]
    )
    expect(list.map((row) => row.placeId)).toEqual(['near', 'mid', 'far'])
    expect(list[0]).toMatchObject({ current: true, linkedGarage: null, onLead: null })
    expect(list[1]).toMatchObject({ current: false, onLead: { id: 'l1', name: 'Mid lead' } })
    expect(list[2]).toMatchObject({ linkedGarage: { id: OTHER, name: 'Velan Car Care' } })
    expect(list[0]!.distanceM).toBeGreaterThan(100)
    expect(list[0]!.distanceM).toBeLessThan(140)
  })

  test('at most ten', () => {
    const many = Array.from({ length: 15 }, (_, i) => place(`p${i}`, i * 100))
    expect(garageGooglePlaces(pin, many, GARAGE, [])).toHaveLength(GARAGE_GOOGLE_RESULTS_MAX)
  })

  test('metresBetween is a straight line', () => {
    expect(metresBetween(pin, pin)).toBe(0)
    expect(Math.abs(metresBetween(pin, { lat: pin.lat + 0.01, lng: pin.lng }) - 1112)).toBeLessThan(3)
  })
})
