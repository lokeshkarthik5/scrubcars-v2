/**
 * GET /bookings/:id/other-garages, the rescue (lib/rescue-garages.ts), with
 * only the database stood in for (the repositories' methods replaced on
 * their objects, put back after):
 *
 * - only the booking's own customer; anyone else's booking is a 404;
 * - a booking the customer cancelled gets no card;
 * - a declined or lapsed booking gets up to three garages that can do the
 *   same job for the same car, ranked (a quick answerer before a nearer slow
 *   one), each with the job's price, its services, "usually answers in" and
 *   times near the original slot; a garage without the job is left out;
 * - the reads go one at a time (one database connection in production).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

// The app's env insists on a database URL; nothing here connects to it.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { bookingsRepository } = await import('../bookings/bookings.repository.js')
const { vendorsRepository } = await import('../vendors/vendors.repository.js')
const { reviewsRepository } = await import('../reviews/reviews.repository.js')
const { tiersService } = await import('../tiers/tiers.service.js')
const { citiesService } = await import('../cities/cities.service.js')
const { branchGroupsRepository } = await import('../branch-groups/branch-groups.repository.js')
const { garageResponseRepository } = await import('./garage-response.repository.js')
const { garageResponseService } = await import('./garage-response.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

// Monday 9 November 2026, 08:00 IST; the booking was for 11:00 today.
const NOW = new Date('2026-11-09T08:00:00+05:30').getTime()
const SLOT = new Date('2026-11-09T11:00:00+05:30')
const CUSTOMER = 'customer-1'
const FIRST = 'garage-first'
const QUICK = 'garage-quick'
const NEAR_SLOW = 'garage-near-slow'
const NO_WASH = 'garage-no-wash'

let booking: Record<string, unknown>
let inFlight = 0
let overlapped = false

/** Each stand-in read counts itself in and out, so two at once would show. */
function read<T>(value: T) {
  return async () => {
    inFlight += 1
    if (inFlight > 1) overlapped = true
    await new Promise((resolve) => setTimeout(resolve, 1))
    inFlight -= 1
    return value
  }
}

const everyDay = (vendorId: string) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({ vendorId, dayOfWeek, openTime: '09:00:00', closeTime: '18:00:00', isClosed: false }))

const garageRow = (id: string) => ({
  id,
  businessName: id,
  logoUrl: null,
  city: 'Chennai',
  cityId: null,
  pincode: null,
  isVerified: true,
  status: 'active',
  dropinEnabled: true,
  doorstepEnabled: false,
  pickup: 'no',
  pickupRadiusKm: null,
  pickupTermsAcceptedAt: null,
  doorstepWholeCity: false,
  pickupWholeCity: false,
  bookingsPausedAt: null,
  slotIntervalMins: 30,
  bays: 1,
  jobsPerDay: null,
  lat: 13.0,
  lng: 80.2,
  services: [],
  photos: [],
  workingHours: [],
})

const wash = (vendorId: string, price: string) => ({
  id: `${vendorId}-wash`,
  vendorId,
  name: 'Foam wash',
  category: 'car_wash',
  pricingType: 'flat',
  price,
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  durationMins: 60,
  isActive: true,
})

/** A booking paid and accepted `mins` later, a few days ago. */
const accepted = (vendorId: string, mins: number) => {
  const at = new Date(NOW - 3 * 24 * 60 * 60_000)
  return {
    vendorId,
    createdAt: at,
    paidAt: at,
    acceptedAt: new Date(at.getTime() + mins * 60_000),
    acceptedBy: 'someone',
    status: 'completed',
    cancelledBy: null,
    cancelledOnBehalfOf: null,
    noShow: null,
    cancelledAt: null,
    garageCancelledAt: null,
  }
}

beforeAll(() => {
  booking = {
    id: 'booking-1',
    userId: CUSTOMER,
    vendorId: FIRST,
    bookingType: 'dropin',
    status: 'cancelled',
    cancelledBy: 'vendor',
    cancelledOnBehalfOf: null,
    noShow: null,
    responseMissedAt: new Date(NOW - 60_000),
    scheduledAt: SLOT,
    lat: null,
    lng: null,
    vendor: { lat: 13.0, lng: 80.2 },
    vehicle: { vehicleType: 'sedan' },
  }
  patch(bookingsRepository, 'findBookingById', async () => booking)
  patch(garageResponseRepository, 'bookedCategories', read([{ category: 'car_wash', memberCategories: [] }]))
  patch(
    vendorsRepository,
    'listPublicVendorPage',
    read([
      { id: NEAR_SLOW, distanceM: 1000 },
      { id: NO_WASH, distanceM: 1500 },
      { id: QUICK, distanceM: 3000 },
    ])
  )
  patch(garageResponseRepository, 'rescueServices', read([wash(NEAR_SLOW, '549.00'), wash(QUICK, '649.00')]))
  patch(vendorsRepository, 'findPublicVendorsByIds', read([garageRow(NEAR_SLOW), garageRow(NO_WASH), garageRow(QUICK)]))
  patch(vendorsRepository, 'listWorkingHoursForVendors', read([...everyDay(NEAR_SLOW), ...everyDay(NO_WASH), ...everyDay(QUICK)]))
  patch(vendorsRepository, 'listClosuresForVendors', read([]))
  patch(bookingsRepository, 'listCapacityHoldersForVendors', read([]))
  patch(
    garageResponseRepository,
    'recordRows',
    read([
      accepted(QUICK, 4),
      accepted(QUICK, 6),
      accepted(QUICK, 8),
      accepted(NEAR_SLOW, 55),
      accepted(NEAR_SLOW, 58),
      accepted(NEAR_SLOW, 59),
      { ...accepted(NEAR_SLOW, 0), acceptedAt: null, acceptedBy: null, status: 'cancelled', cancelledBy: 'vendor' },
      { ...accepted(NEAR_SLOW, 0), acceptedAt: null, acceptedBy: null, status: 'cancelled', cancelledBy: 'vendor' },
    ])
  )
  patch(reviewsRepository, 'ratingAggregates', read([]))
  patch(reviewsRepository, 'tagCounts', read([]))
  patch(vendorsRepository, 'listPublicVendorsByIds', read([garageRow(QUICK), garageRow(NEAR_SLOW)]))
  patch(tiersService, 'customerTiers', read(new Map()))
  patch(citiesService, 'rules', read({ cities: [], otherTowns: true }))
  // No branch groups (0081): the cards' one group read.
  patch(branchGroupsRepository, 'listCardGroups', read([]))
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
})

describe('the rescue', () => {
  test("anyone else's booking is a 404", async () => {
    await expect(garageResponseService.otherGarages('someone-else', 'booking-1', NOW)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  test('a booking the customer cancelled gets no card', async () => {
    const own = booking
    booking = { ...own, cancelledBy: 'user', responseMissedAt: null }
    try {
      const answer = await garageResponseService.otherGarages(CUSTOMER, 'booking-1', NOW)
      expect(answer).toEqual({ bookingType: 'dropin', reason: null, items: [] })
    } finally {
      booking = own
    }
  })

  test('the same job, ranked, with prices, answer times and times near the slot', async () => {
    overlapped = false
    const answer = await garageResponseService.otherGarages(CUSTOMER, 'booking-1', NOW)
    expect(answer.reason).toBe('not_accepted')
    // The quick answerer first; the garage without a wash left out.
    expect(answer.items.map((item) => item.id)).toEqual([QUICK, NEAR_SLOW])
    const [quick, slow] = answer.items
    expect(quick!.rescue).toEqual({
      price: '649.00',
      serviceIds: [`${QUICK}-wash`],
      usualAnswerMins: 10,
      day: 'today',
      times: ['10:30:00', '11:00:00', '11:30:00'].map((t) => new Date(`2026-11-09T${t}+05:30`).toISOString()),
      near: SLOT.toISOString(),
    })
    expect(slow!.rescue.usualAnswerMins).toBe(60)
    expect(overlapped).toBe(false)
  })

  test("the price is for the booked car's size, and a car since removed gets no offer", async () => {
    const own = booking
    const perVehicle = (vendorId: string) => ({
      ...wash(vendorId, '0.00'),
      pricingType: 'per_vehicle',
      priceHatchback: '400.00',
      priceSedan: '500.00',
      priceSuv: '700.00',
    })
    patch(garageResponseRepository, 'rescueServices', read([perVehicle(QUICK), perVehicle(NEAR_SLOW)]))
    try {
      booking = { ...own, vehicle: { id: 'suv-1', vehicleType: 'suv', archivedAt: null } }
      const suv = await garageResponseService.otherGarages(CUSTOMER, 'booking-1', NOW)
      expect(suv.items.map((item) => item.rescue.price)).toEqual(['700.00', '700.00'])

      // Checkout opens on the booked car (?car=); one the customer removed
      // can't be picked there, so its price would not be the price charged.
      booking = { ...own, vehicle: { id: 'suv-1', vehicleType: 'suv', archivedAt: new Date(NOW - 60_000) } }
      const removed = await garageResponseService.otherGarages(CUSTOMER, 'booking-1', NOW)
      expect(removed).toEqual({ bookingType: 'dropin', reason: 'not_accepted', items: [] })
    } finally {
      booking = own
      patch(garageResponseRepository, 'rescueServices', read([wash(NEAR_SLOW, '549.00'), wash(QUICK, '649.00')]))
    }
  })

  test('a declined booking says so', async () => {
    const own = booking
    booking = { ...own, responseMissedAt: null }
    try {
      const answer = await garageResponseService.otherGarages(CUSTOMER, 'booking-1', NOW)
      expect(answer.reason).toBe('declined')
    } finally {
      booking = own
    }
  })
})
