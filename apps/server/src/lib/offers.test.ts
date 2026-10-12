import { describe, expect, test } from 'bun:test'
import {
  endsSoonLabel,
  homeFieldsProblem,
  mergeHomeFields,
  offerMetaLine,
  offerSkipReason,
  offerTier,
  rankOffers,
  targetingRefused,
  tillLabel,
  toHomeOffer,
  type HomeFields,
  type HomeOfferRow,
  type OfferContext,
} from './offers.js'

// Fixed clock: Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')
const DAY = 24 * 60 * 60 * 1000
/** Midnight IST at the start of Sun 18 Oct: the code works all of Sat 17 Oct. */
const SAT_17_OCT_END = new Date('2026-10-17T18:30:00Z')

function offer(overrides: Partial<HomeOfferRow> = {}): HomeOfferRow {
  return {
    id: 'o1',
    code: 'DETAIL20',
    homeTitle: '20% off any service',
    homePriority: 0,
    homeAudience: 'everyone',
    homeAudienceRadiusKm: null,
    homeAudienceVehicleTypes: null,
    discountType: 'percentage',
    percentOff: '20.00',
    amountOff: null,
    maxDiscountAmount: '300.00',
    minOrderAmount: null,
    perUserLimit: null,
    totalUsageLimit: null,
    vendorId: null,
    vendorName: null,
    vendorPublic: false,
    vendorDistanceKm: null,
    showOnHome: true,
    isActive: true,
    startsAt: new Date(NOW.getTime() - DAY),
    endsAt: SAT_17_OCT_END,
    createdAt: new Date(NOW.getTime() - 2 * DAY),
    dismissed: false,
    ...overrides,
  }
}

const ctx = (overrides: Partial<OfferContext> = {}): OfferContext => ({
  now: NOW,
  targetingEnabled: false,
  hasCar: true,
  held: new Map(),
  ...overrides,
})

const targeted = (customer: Partial<NonNullable<OfferContext['customer']>> = {}, overrides: Partial<OfferContext> = {}) =>
  ctx({
    targetingEnabled: true,
    customer: { bookedVendorIds: new Set(), washDue: false, carTypes: new Set(['hatchback']), ...customer },
    ...overrides,
  })

describe('who sees an offer', () => {
  test('a live, unused, undismissed code shown on Home', () => {
    expect(offerSkipReason(offer(), ctx())).toBeNull()
  })

  test('the window, the switch and the end date', () => {
    expect(offerSkipReason(offer({ showOnHome: false }), ctx())).toBe('not_on_home')
    expect(offerSkipReason(offer({ isActive: false }), ctx())).toBe('inactive')
    expect(offerSkipReason(offer({ startsAt: new Date(NOW.getTime() + 1) }), ctx())).toBe('not_started')
    expect(offerSkipReason(offer({ endsAt: NOW }), ctx())).toBe('ended')
    expect(offerSkipReason(offer({ endsAt: null }), ctx())).toBe('no_end_date')
  })

  test('limits counted as held, in total and by this customer', () => {
    const held = new Map([['o1', { total: 5, byUser: 1 }]])
    expect(offerSkipReason(offer({ totalUsageLimit: 5 }), ctx({ held }))).toBe('used_up')
    expect(offerSkipReason(offer({ totalUsageLimit: 6, perUserLimit: 1 }), ctx({ held }))).toBe('used_by_customer')
    expect(offerSkipReason(offer({ totalUsageLimit: 6, perUserLimit: 2 }), ctx({ held }))).toBeNull()
  })

  test('closed with ×', () => {
    expect(offerSkipReason(offer({ dismissed: true }), ctx())).toBe('dismissed')
  })

  test("a garage's offer needs the garage live, and a car", () => {
    const garage = offer({ vendorId: 'v1', vendorName: 'Next Level', vendorPublic: true })
    expect(offerSkipReason(garage, ctx())).toBeNull()
    expect(offerSkipReason({ ...garage, vendorPublic: false }, ctx())).toBe('garage_not_public')
    expect(offerSkipReason(garage, ctx({ hasCar: false }))).toBe('needs_car')
    // With no car, Detlio-wide offers still show.
    expect(offerSkipReason(offer(), ctx({ hasCar: false }))).toBeNull()
  })

  test('targeting off: only everyone, and nothing about the customer is read', () => {
    for (const homeAudience of ['new_customers', 'booked_this_garage', 'near_this_garage', 'wash_due', 'car_type'] as const) {
      const row = offer({ homeAudience, vendorId: 'v1', vendorPublic: true })
      // No `customer` facts are even supplied while the switch is off.
      expect(offerSkipReason(row, ctx())).toBe('targeting_off')
    }
    expect(offerTier(offer({ vendorId: 'v1', vendorPublic: true }), ctx())).toBe(0)
  })

  test('targeting on: each audience', () => {
    const garage = { vendorId: 'v1', vendorName: 'Next Level', vendorPublic: true }

    const newCustomers = offer({ homeAudience: 'new_customers' })
    expect(offerSkipReason(newCustomers, targeted())).toBeNull()
    expect(offerSkipReason(newCustomers, targeted({ bookedVendorIds: new Set(['v9']) }))).toBe('audience')

    const booked = offer({ ...garage, homeAudience: 'booked_this_garage' })
    expect(offerSkipReason(booked, targeted({ bookedVendorIds: new Set(['v1']) }))).toBeNull()
    expect(offerSkipReason(booked, targeted({ bookedVendorIds: new Set(['v2']) }))).toBe('audience')

    const near = offer({ ...garage, homeAudience: 'near_this_garage', homeAudienceRadiusKm: 5 })
    expect(offerSkipReason({ ...near, vendorDistanceKm: 4.9 }, targeted())).toBeNull()
    expect(offerSkipReason({ ...near, vendorDistanceKm: 5.1 }, targeted())).toBe('audience')
    // No location sent: not near anything.
    expect(offerSkipReason(near, targeted())).toBe('audience')

    const washDue = offer({ homeAudience: 'wash_due' })
    expect(offerSkipReason(washDue, targeted({ washDue: true }))).toBeNull()
    expect(offerSkipReason(washDue, targeted({ washDue: false }))).toBe('audience')

    const suvs = offer({ homeAudience: 'car_type', homeAudienceVehicleTypes: ['suv', 'sedan'] })
    expect(offerSkipReason(suvs, targeted({ carTypes: new Set(['suv']) }))).toBeNull()
    expect(offerSkipReason(suvs, targeted({ carTypes: new Set(['hatchback']) }))).toBe('audience')
  })
})

describe('ranking', () => {
  test('priority, then ends soonest, then newest; at most three', () => {
    const rows = [
      offer({ id: 'normal-late', endsAt: new Date(SAT_17_OCT_END.getTime() + DAY) }),
      offer({ id: 'normal-soon-old', createdAt: new Date(NOW.getTime() - 5 * DAY) }),
      offer({ id: 'normal-soon-new' }),
      offer({ id: 'top', homePriority: 2, endsAt: new Date(SAT_17_OCT_END.getTime() + 10 * DAY) }),
      offer({ id: 'high', homePriority: 1 }),
    ]
    expect(rankOffers(rows, ctx()).map((row) => row.id)).toEqual(['top', 'high', 'normal-soon-new'])
  })

  test("with targeting on, the customer's tie to the garage comes after priority", () => {
    const customer = { bookedVendorIds: new Set(['booked']) }
    const rows = [
      offer({ id: 'detlio', vendorId: null }),
      offer({ id: 'far', vendorId: 'far', vendorPublic: true, vendorDistanceKm: 40 }),
      offer({ id: 'near', vendorId: 'near', vendorPublic: true, vendorDistanceKm: 3 }),
      offer({ id: 'booked', vendorId: 'booked', vendorPublic: true }),
    ]
    expect(rankOffers(rows, targeted(customer)).map((row) => row.id)).toEqual(['booked', 'near', 'detlio'])
    // With it off, the same rows rank by end date and age alone.
    expect(rankOffers(rows, ctx()).map((row) => row.id)).toEqual(['booked', 'detlio', 'far'])
  })
})

describe('the small print', () => {
  test('a code ending at midnight IST works all of the day before', () => {
    expect(tillLabel(SAT_17_OCT_END)).toBe('Till Sat 17 Oct')
    // 18:00 IST on 18 Oct names its time.
    expect(tillLabel(new Date('2026-10-18T12:30:00Z'))).toBe('Till 18 Oct, 6 PM')
    expect(tillLabel(new Date('2026-10-18T13:00:00Z'))).toBe('Till 18 Oct, 6:30 PM')
  })

  test('"Ends today" and "Ends Sun" within three days, in IST', () => {
    // Ends at midnight starting Tue 13 Oct: its last day is today.
    expect(endsSoonLabel(new Date('2026-10-12T18:30:00Z'), NOW)).toBe('Ends today')
    expect(endsSoonLabel(new Date('2026-10-13T18:30:00Z'), NOW)).toBe('Ends Tue')
    expect(endsSoonLabel(new Date('2026-10-15T18:30:00Z'), NOW)).toBe('Ends Thu')
    expect(endsSoonLabel(new Date('2026-10-16T18:30:00Z'), NOW)).toBeNull()
    // 23:59 IST tonight is still today; one minute past midnight IST is tomorrow.
    expect(endsSoonLabel(new Date('2026-10-12T18:29:00Z'), NOW)).toBe('Ends today')
    expect(endsSoonLabel(new Date('2026-10-12T18:31:00Z'), NOW)).toBe('Ends Tue')
  })

  test('the meta line is built from the columns', () => {
    expect(offerMetaLine(offer())).toBe('Up to ₹300 · Code DETAIL20 · Till Sat 17 Oct')
    expect(
      offerMetaLine(offer({ discountType: 'fixed', maxDiscountAmount: null, minOrderAmount: '1000.00', code: 'FLAT100' }))
    ).toBe('Min ₹1,000 · Code FLAT100 · Till Sat 17 Oct')
    // Exact to the paisa: never a cap or a minimum the code does not have.
    expect(offerMetaLine(offer({ maxDiscountAmount: '149.50', minOrderAmount: '999.50' })))
      .toBe('Up to ₹149.50 · Min ₹999.50 · Code DETAIL20 · Till Sat 17 Oct')
  })

  test('the card Home sends', () => {
    expect(toHomeOffer(offer({ homeTitle: '  20% off any service ' }), NOW)).toMatchObject({
      id: 'o1',
      code: 'DETAIL20',
      title: '20% off any service',
      metaLine: 'Up to ₹300 · Code DETAIL20 · Till Sat 17 Oct',
      endsSoon: null,
      endsAt: SAT_17_OCT_END.toISOString(),
      vendorId: null,
    })
  })
})

describe('saving the Home fields', () => {
  const stored: HomeFields = {
    showOnHome: true,
    homeTitle: '20% off any service',
    homePriority: 1,
    homeAudience: 'everyone',
    homeAudienceRadiusKm: null,
    homeAudienceVehicleTypes: null,
    vendorId: 'v1',
    startsAt: null,
    endsAt: SAT_17_OCT_END,
  }

  test('a PATCH that clears the end date or the title of a shown code is refused', () => {
    expect(homeFieldsProblem(mergeHomeFields(stored, { endsAt: null }))?.field).toBe('endsAt')
    expect(homeFieldsProblem(mergeHomeFields(stored, { homeTitle: null }))?.field).toBe('homeTitle')
    // Taken off Home, neither is needed.
    expect(homeFieldsProblem(mergeHomeFields(stored, { showOnHome: false, endsAt: null }))).toBeNull()
    // Turning it on needs both, judged with what is stored.
    expect(homeFieldsProblem(mergeHomeFields({}, { showOnHome: true, homeTitle: 'Monsoon wash' }))?.field).toBe('endsAt')
  })

  test('garage audiences need a garage; each setting belongs to one audience', () => {
    expect(homeFieldsProblem(mergeHomeFields(stored, { homeAudience: 'booked_this_garage', vendorId: null }))?.field)
      .toBe('homeAudience')
    // "Near" without a distance gets 10 km.
    expect(mergeHomeFields(stored, { homeAudience: 'near_this_garage' }).homeAudienceRadiusKm).toBe(10)
    expect(homeFieldsProblem(mergeHomeFields(stored, { homeAudienceRadiusKm: 5 }))?.field).toBe('homeAudienceRadiusKm')
    expect(homeFieldsProblem(mergeHomeFields(stored, { homeAudience: 'car_type' }))?.field).toBe('homeAudienceVehicleTypes')
    // Back to everyone drops the old audience's settings.
    const wasNear = { ...stored, homeAudience: 'near_this_garage' as const, homeAudienceRadiusKm: 8 }
    expect(mergeHomeFields(wasNear, { homeAudience: 'everyone' })).toMatchObject({ homeAudienceRadiusKm: null })
    expect(homeFieldsProblem(mergeHomeFields(wasNear, { homeAudience: 'everyone' }))).toBeNull()
  })

  test('targeting off refuses only an audience being set now', () => {
    expect(targetingRefused('near_this_garage', false)).toBe(true)
    expect(targetingRefused('everyone', false)).toBe(false)
    expect(targetingRefused(undefined, false)).toBe(false)
    expect(targetingRefused('near_this_garage', true)).toBe(false)
    // Saved while it was on: sending it back unchanged is not setting it.
    expect(targetingRefused('near_this_garage', false, 'near_this_garage')).toBe(false)
    expect(targetingRefused('car_type', false, 'near_this_garage')).toBe(true)
  })
})
