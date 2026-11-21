import { describe, expect, test } from 'bun:test'
import type { AdminGoogleListing, AdminGooglePlace } from '@repo/core/api/admin-google'
import {
  customersLine,
  defaultGoogleSearch,
  fromPin,
  linkedLine,
  placeBlocked,
  readLine,
} from './google-listing'
import {
  hasNoGoogleListing,
  matchesShow,
  noGoogleListingCount,
  NO_GOOGLE_FILTER,
  parseShow,
} from './vendor-list'

/** Google rating for new garages (21 Nov 2026): the side panel's words and the "No Google listing" chip. */

const listing = (over: Partial<AdminGoogleListing> = {}): AdminGoogleListing => ({
  leadId: 'lead-1',
  placeId: 'place-1',
  name: 'Shine Hub Car Spa & Detailing',
  address: '14, 2nd Ave, Kilpauk',
  google: { rating: 4.6, reviewCount: 312 },
  readAt: '2026-11-14T06:00:00.000Z',
  nextReadBy: '2026-12-13T06:00:00.000Z',
  detlioReviews: 2,
  shown: true,
  leadSource: 'google',
  linkedBy: null,
  linkedAt: null,
  ...over,
})

describe('the Google listing section', () => {
  test('when Detlio read it and reads it next', () => {
    expect(readLine(listing())).toBe('Read from Google 14 Nov · next read by 13 Dec')
    expect(readLine(listing({ readAt: null, nextReadBy: null }))).toContain('Google no longer has this listing')
  })

  test('whether customers see it now', () => {
    expect(customersLine(listing())).toEqual({
      shown: true,
      lead: 'Customers see it',
      rest: ' while the garage has fewer than 5 Detlio reviews (now 2).',
    })
    expect(customersLine(listing({ shown: false, detlioReviews: 6 })).lead).toBe('Customers see Detlio’s own rating')
    expect(customersLine(listing({ shown: false, google: null })).rest).toContain('“New”')
  })

  test('who linked it', () => {
    expect(linkedLine(listing())).toBe('Linked through its Coverage lead')
    expect(linkedLine(listing({ linkedBy: 'Mathew', linkedAt: '2026-11-02T06:00:00.000Z' }))).toBe('Linked by Mathew, 2 Nov')
  })

  test('the dialog: distance from the pin, another garage’s listing blocked, the first words', () => {
    expect(fromPin(118)).toBe('120 m from the pin')
    expect(fromPin(6830)).toBe('6.8 km from the pin')
    const place: AdminGooglePlace = {
      placeId: 'p',
      name: 'Royal Car Wash',
      address: null,
      rating: 4.3,
      reviewCount: 58,
      distanceM: 120,
      current: false,
      linkedGarage: null,
      onLead: null,
    }
    expect(placeBlocked(place)).toBeNull()
    expect(placeBlocked({ ...place, linkedGarage: { id: 'g', name: 'Velan Car Care' } })).toBe('Linked to Velan Car Care')
    expect(defaultGoogleSearch('Royal Car Wash', 'Villivakkam')).toBe('Royal Car Wash Villivakkam')
    expect(defaultGoogleSearch('Royal Car Wash', '')).toBe('Royal Car Wash')
  })
})

describe('the “No Google listing” chip', () => {
  const base = { live: true, status: 'active', isVerified: true, bookingsPausedAt: null, deletedAt: null } as const
  test('garages with no listing, never the Bin, and none from an older API', () => {
    const rows = [
      { ...base, google: null },
      { ...base, google: listing() },
      { ...base, google: null, deletedAt: '2026-11-01T00:00:00Z' },
      { ...base },
    ]
    expect(rows.map(hasNoGoogleListing)).toEqual([true, false, false, false])
    expect(noGoogleListingCount(rows)).toBe(1)
    expect(parseShow(NO_GOOGLE_FILTER)).toBe('nogoogle')
    expect(matchesShow(rows[0]!, NO_GOOGLE_FILTER)).toBe(true)
    expect(matchesShow(rows[1]!, NO_GOOGLE_FILTER)).toBe(false)
  })
})
