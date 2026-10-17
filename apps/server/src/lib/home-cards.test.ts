import { describe, expect, test } from 'bun:test'
import {
  buildCars,
  canChangeTime,
  garageTakesJobAgain,
  nextBookingWithoutCar,
  pickActionCards,
  serviceLabelOf,
  type GarageDays,
  type HubCar,
  type LastJob,
} from './home-cards.js'
import type { HubBooking } from './home-updates.js'
import type { NoticeRow } from './notices.js'

// Fixed clock: Mon 12 Oct 2026, 12:00 IST.
const NOW = new Date('2026-10-12T06:30:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const ahead = (ms: number) => new Date(NOW.getTime() + ms)

function booking(overrides: Partial<HubBooking> = {}): HubBooking {
  return {
    id: 'b1',
    status: 'confirmed',
    bookingType: 'dropin',
    scheduledAt: ahead(DAY),
    createdAt: ago(DAY),
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelledOnBehalfOf: null,
    noShow: null,
    rescheduledFromId: null,
    rescheduleCount: 0,
    moved: false,
    reviewPromptDismissedAt: null,
    hasReview: false,
    vehicleId: 'car1',
    vehicleName: 'Hyundai i20',
    vendorId: 'v1',
    vendorName: 'Next Level',
    vendorPausedAt: null,
    serviceLabel: 'Express Wash',
    payment: { status: 'paid', amount: '499.00', paidAt: ago(DAY), refundedAmount: null, refundedAt: null },
    charges: [],
    photos: { count: 0, before: 0, after: 0, lastAt: null },
    refunds: [],
    ...overrides,
  }
}

const noDays: GarageDays = { closures: new Map(), hours: new Map() }

const bill = (id: string, createdAt: Date) => ({
  id,
  status: 'due',
  amountDue: '800.00',
  createdAt,
  paidAt: null,
  gatewayPaymentId: null,
  refundedAmount: null,
  refundedAt: null,
})

/** Thu 15 Oct 2026, 10:00 IST: a Thursday (day 4). */
const THURSDAY_10AM = new Date('2026-10-15T04:30:00Z')

describe('must-act cards', () => {
  test('the oldest bill first, with how many more are due', () => {
    const { mustAct, todo } = pickActionCards(
      [
        booking({ id: 'a', status: 'completed', charges: [bill('c-new', ago(HOUR))] }),
        booking({ id: 'b', status: 'completed', charges: [bill('c-old', ago(DAY))] }),
      ],
      noDays,
      NOW
    )
    expect(mustAct).toMatchObject({ kind: 'bill_due', chargeId: 'c-old', bookingId: 'b', moreDue: 1, amountDue: '800.00' })
    expect(todo.filter((card) => card.kind === 'bill_due')).toHaveLength(2)
  })

  test('the garage shut on a booking day: a holiday', () => {
    const days: GarageDays = { closures: new Map([['v1', new Set(['2026-10-15'])]]), hours: new Map() }
    const { mustAct } = pickActionCards([booking({ scheduledAt: THURSDAY_10AM })], days, NOW)
    expect(mustAct).toMatchObject({ kind: 'garage_closed', reason: 'holiday', canChangeTime: true, vendorId: 'v1' })
  })

  test('a weekly day off only where an hours row says closed; a missing row is not a closure', () => {
    const closedThursdays: GarageDays = {
      closures: new Map(),
      hours: new Map([['v1', new Map([[4, { isClosed: true }]])]]),
    }
    expect(pickActionCards([booking({ scheduledAt: THURSDAY_10AM })], closedThursdays, NOW).mustAct)
      .toMatchObject({ kind: 'garage_closed', reason: 'weekly_off' })

    const noThursdayRow: GarageDays = {
      closures: new Map(),
      hours: new Map([['v1', new Map([[3, { isClosed: false }]])]]),
    }
    expect(pickActionCards([booking({ scheduledAt: THURSDAY_10AM })], noThursdayRow, NOW).mustAct).toBeNull()
  })

  test('a paused garage on leave: the closed-day card, but no Change time (a reschedule would be refused)', () => {
    const days: GarageDays = { closures: new Map([['v1', new Set(['2026-10-15'])]]), hours: new Map() }
    const { mustAct } = pickActionCards([booking({ scheduledAt: THURSDAY_10AM, vendorPausedAt: ago(DAY) })], days, NOW)
    expect(mustAct).toMatchObject({ kind: 'garage_closed', reason: 'holiday', canChangeTime: false })
  })

  test('a paused garage is not a closed day: existing bookings stand', () => {
    const open: GarageDays = { closures: new Map(), hours: new Map([['v1', new Map([[4, { isClosed: false }]])]]) }
    expect(pickActionCards([booking({ scheduledAt: THURSDAY_10AM, vendorPausedAt: ago(DAY) })], open, NOW).mustAct).toBeNull()
  })

  test('a bill comes before a closed day', () => {
    const days: GarageDays = { closures: new Map([['v1', new Set(['2026-10-15'])]]), hours: new Map() }
    const { mustAct, todo } = pickActionCards(
      [booking({ id: 'up', scheduledAt: THURSDAY_10AM }), booking({ id: 'done', status: 'completed', charges: [bill('c1', ago(HOUR))] })],
      days,
      NOW
    )
    expect(mustAct?.kind).toBe('bill_due')
    expect(todo.map((card) => card.kind)).toEqual(['bill_due', 'garage_closed'])
  })
})

describe('canChangeTime', () => {
  test('pending any time, accepted only 2 hours or more ahead, and moves left', () => {
    expect(canChangeTime(booking({ status: 'pending', scheduledAt: ahead(HOUR) }), NOW)).toBe(true)
    expect(canChangeTime(booking({ status: 'confirmed', scheduledAt: ahead(2 * HOUR) }), NOW)).toBe(true)
    expect(canChangeTime(booking({ status: 'confirmed', scheduledAt: ahead(2 * HOUR - 1) }), NOW)).toBe(false)
    expect(canChangeTime(booking({ status: 'in_progress' }), NOW)).toBe(false)
    expect(canChangeTime(booking({ status: 'pending', rescheduleCount: 2 }), NOW)).toBe(false)
  })
})

describe('Rate your wash', () => {
  const done = (overrides: Partial<HubBooking> = {}) =>
    booking({ status: 'completed', scheduledAt: ago(DAY), completedAt: ago(10 * HOUR), ...overrides })

  test('within 72 hours of the job, not reviewed and not closed', () => {
    expect(pickActionCards([done()], noDays, NOW).softCard).toMatchObject({
      kind: 'rate',
      vehicleName: 'Hyundai i20',
      vendorName: 'Next Level',
    })
    expect(pickActionCards([done({ completedAt: ago(73 * HOUR) })], noDays, NOW).softCard).toBeNull()
    expect(pickActionCards([done({ hasReview: true })], noDays, NOW).softCard).toBeNull()
    expect(pickActionCards([done({ reviewPromptDismissedAt: ago(HOUR) })], noDays, NOW).softCard).toBeNull()
    // A job from before 0028 has no completion time to count from.
    expect(pickActionCards([done({ completedAt: null })], noDays, NOW).softCard).toBeNull()
  })

  test('never with a must-act card: at most two cards above the car', () => {
    const { mustAct, softCard, todo } = pickActionCards(
      [done({ id: 'rated' }), booking({ id: 'billed', status: 'completed', charges: [bill('c1', ago(HOUR))] })],
      noDays,
      NOW
    )
    expect(mustAct?.kind).toBe('bill_due')
    expect(softCard).toBeNull()
    // Still on the To do list.
    expect(todo.map((card) => card.kind)).toEqual(['bill_due', 'rate'])
  })
})

describe('the car and its tile', () => {
  const car = (overrides: Partial<HubCar> = {}): HubCar => ({
    id: 'car1',
    make: 'Hyundai',
    model: 'i20',
    color: null,
    licensePlate: null,
    vehicleType: 'hatchback',
    isDefault: true,
    washIntervalDays: 10,
    ...overrides,
  })

  const build = (input: {
    cars?: HubCar[]
    bookings?: HubBooking[]
    lastWashAt?: Map<string, Date>
    lastJobs?: Map<string, LastJob>
    notices?: NoticeRow[]
  }) =>
    buildCars({
      cars: input.cars ?? [car()],
      bookings: input.bookings ?? [],
      lastWashAt: input.lastWashAt ?? new Map(),
      lastJobs: input.lastJobs ?? new Map(),
      notices: input.notices ?? [],
      now: NOW,
    })

  test('the default car first, with its wash bar', () => {
    const cars = build({
      cars: [car({ id: 'second', isDefault: false, make: 'Audi' }), car()],
      lastWashAt: new Map([['car1', ago(8 * DAY)]]),
    })
    expect(cars.map((c) => c.id)).toEqual(['car1', 'second'])
    expect(cars[0].wash).toMatchObject({ state: 'due_soon', daysLeft: 2 })
    expect(cars[1].rightTile).toEqual({ kind: 'nothing_booked' })
  })

  test('the next booking, paid or not, with a team notice as one line', () => {
    const notice: NoticeRow = {
      id: 'n1',
      title: 'Slot may move: rain',
      body: 'Heavy rain.',
      linkUrl: null,
      linkLabel: null,
      audience: 'with_booking_between',
      vendorId: null,
      bookingFrom: ago(DAY),
      bookingTo: ahead(3 * DAY),
      startsAt: ago(HOUR),
      endsAt: ahead(DAY),
      isActive: true,
    }
    const [withNotice] = build({ bookings: [booking()], notices: [notice] })
    expect(withNotice.rightTile).toMatchObject({
      kind: 'next_booking',
      paymentStatus: 'paid',
      notice: { noticeId: 'n1', title: 'Slot may move: rain' },
    })
    // A paid booking ahead: booked, not overdue.
    expect(withNotice.wash.state).toBe('booked')

    const [unpaid] = build({ bookings: [booking({ payment: { status: 'pending', amount: '499.00', paidAt: null, refundedAmount: null, refundedAt: null } })] })
    expect(unpaid.rightTile).toMatchObject({ kind: 'next_booking', paymentStatus: 'unpaid', notice: null })
    // An unpaid booking holds no slot, so the wash can still be overdue.
    expect(unpaid.wash.state).not.toBe('booked')

    // Being washed right now is booked too, though its slot has started.
    const [washing] = build({ bookings: [booking({ status: 'in_progress', scheduledAt: ago(HOUR) })] })
    expect(washing.rightTile).toMatchObject({ kind: 'next_booking', status: 'in_progress' })
    expect(washing.wash.state).toBe('booked')
  })

  test('a pickup & drop booking carries the step it has reached; others carry none', () => {
    const [booked] = build({ bookings: [booking({ bookingType: 'pickup' })] })
    expect(booked.rightTile).toMatchObject({ kind: 'next_booking', bookingType: 'pickup', pickupStage: 'booked' })

    const [collected] = build({
      bookings: [
        booking({
          bookingType: 'pickup',
          pickup: { pickedUpAt: ago(HOUR), atGarageAt: null, outForDeliveryAt: null, deliveredAt: null },
        }),
      ],
    })
    expect(collected.rightTile).toMatchObject({ pickupStage: 'picked_up' })

    const [returning] = build({
      bookings: [
        booking({
          bookingType: 'pickup',
          status: 'in_progress',
          scheduledAt: ago(3 * HOUR),
          startedAt: ago(2 * HOUR),
          pickup: { pickedUpAt: ago(3 * HOUR), atGarageAt: ago(150 * 60_000), outForDeliveryAt: ago(10 * 60_000), deliveredAt: null },
        }),
      ],
    })
    expect(returning.rightTile).toMatchObject({ pickupStage: 'out_for_delivery' })

    const [dropin] = build({ bookings: [booking()] })
    expect(dropin.rightTile).toMatchObject({ kind: 'next_booking', pickupStage: null })
  })

  test("a removed car's live booking shows on the default car", () => {
    const cars = build({
      cars: [car(), car({ id: 'car2', isDefault: false, make: 'Tata' })],
      bookings: [booking({ id: 'archived-car', vehicleId: 'gone' })],
    })
    expect(cars[0].rightTile).toMatchObject({ kind: 'next_booking', bookingId: 'archived-car', vehicleId: 'gone' })
    expect(cars[1].rightTile).toEqual({ kind: 'nothing_booked' })
  })

  test('before & after photos for a week after the job', () => {
    const job = booking({
      status: 'completed',
      completedAt: ago(2 * DAY),
      photos: { count: 3, before: 2, after: 1, lastAt: ago(2 * DAY) },
    })
    expect(build({ bookings: [job] })[0].rightTile).toMatchObject({ kind: 'photos', before: 2, after: 1 })
    const older = { ...job, completedAt: ago(8 * DAY) }
    expect(build({ bookings: [older] })[0].rightTile.kind).toBe('nothing_booked')
  })

  test('no tile for photos taken only at check-in: there is no "after" to show', () => {
    const job = booking({
      status: 'completed',
      completedAt: ago(2 * DAY),
      photos: { count: 3, before: 3, after: 0, lastAt: ago(2 * DAY) },
    })
    expect(build({ bookings: [job] })[0].rightTile.kind).toBe('nothing_booked')
  })

  test('no car left but a booking ahead: the booking is still on Home', () => {
    // Booked for their only car, then removed it (archived, so not in cars).
    const live = booking({ id: 'orphan', vehicleId: 'removed' })
    expect(build({ cars: [], bookings: [live] })).toEqual([])
    expect(nextBookingWithoutCar({ cars: [], bookings: [live], notices: [] })).toMatchObject({
      kind: 'next_booking',
      bookingId: 'orphan',
      vehicleId: 'removed',
    })
    // With a car, the default car's tile carries it instead.
    expect(nextBookingWithoutCar({ cars: [car()], bookings: [live], notices: [] })).toBeNull()
    // Nothing live, nothing to show.
    expect(nextBookingWithoutCar({ cars: [], bookings: [booking({ status: 'completed' })], notices: [] })).toBeNull()
  })

  test("Book again, priced for this car's type", () => {
    const job: LastJob = {
      bookingId: 'last',
      vehicleId: 'car1',
      vendorId: 'v1',
      vendorName: 'Next Level',
      garage: { active: true, verified: true, pinned: true, dropinEnabled: true, doorstepEnabled: true, pickupOffered: false },
      vendorPausedAt: null,
      bookingType: 'doorstep',
      services: [
        { id: 's1', name: 'Exterior Wash', isActive: true, pricingType: 'per_vehicle', price: '300.00', priceHatchback: '300.00', priceSedan: '400.00', priceSuv: '500.00' },
        { id: 's2', name: 'Retired Polish', isActive: false, pricingType: 'flat', price: '900.00', priceHatchback: null, priceSedan: null, priceSuv: null },
        { id: 's3', name: 'Vacuum', isActive: true, pricingType: 'flat', price: '150.00', priceHatchback: null, priceSedan: null, priceSuv: null },
      ],
    }
    const [sedan] = build({ cars: [car({ vehicleType: 'sedan' })], lastJobs: new Map([['car1', job]]) })
    expect(sedan.rightTile).toEqual({
      kind: 'book_again',
      bookingId: 'last',
      vendorId: 'v1',
      vendorName: 'Next Level',
      bookingType: 'doorstep',
      serviceIds: ['s1', 's3'],
      serviceLabel: 'Exterior Wash + 1 more',
      price: '550.00',
      pricedOnInspection: false,
      available: true,
    })

    const unpriced: LastJob = { ...job, services: [{ ...job.services[0], priceSuv: null }] }
    expect(build({ cars: [car({ vehicleType: 'suv' })], lastJobs: new Map([['car1', unpriced]]) })[0].rightTile)
      .toMatchObject({ kind: 'book_again', price: null })

    const paused: LastJob = { ...job, vendorPausedAt: ago(DAY) }
    expect(build({ lastJobs: new Map([['car1', paused]]) })[0].rightTile).toEqual({
      kind: 'garage_unavailable',
      vendorId: 'v1',
      vendorName: 'Next Level',
    })
  })

  test('an inspection job: the price is only its fee, and the tile says so', () => {
    const job: LastJob = {
      bookingId: 'dent',
      vehicleId: 'car1',
      vendorId: 'v1',
      vendorName: 'Next Level',
      garage: { active: true, verified: true, pinned: true, dropinEnabled: true, doorstepEnabled: false, pickupOffered: false },
      vendorPausedAt: null,
      bookingType: 'dropin',
      services: [
        { id: 's9', name: 'Dent Check', isActive: true, pricingType: 'on_inspection', price: '299.00', priceHatchback: null, priceSedan: null, priceSuv: null },
      ],
    }
    expect(build({ lastJobs: new Map([['car1', job]]) })[0].rightTile).toMatchObject({
      kind: 'book_again',
      price: '299.00',
      pricedOnInspection: true,
    })
  })

  test('which garages can take the job again', () => {
    const job = (garage: Partial<LastJob['garage']>, rest: Partial<Pick<LastJob, 'bookingType' | 'vendorPausedAt'>> = {}) => ({
      garage: { active: true, verified: true, pinned: true, dropinEnabled: true, doorstepEnabled: true, pickupOffered: true, ...garage },
      bookingType: 'dropin' as const,
      vendorPausedAt: null,
      ...rest,
    })
    // Most garages lost their pins in 0019: a drop-in there is still bookable.
    expect(garageTakesJobAgain(job({ pinned: false }))).toBe(true)
    // Doorstep measures distance from the pin, so it needs one.
    expect(garageTakesJobAgain(job({ pinned: false }, { bookingType: 'doorstep' }))).toBe(false)
    expect(garageTakesJobAgain(job({}, { bookingType: 'doorstep' }))).toBe(true)
    // Still offering that kind of booking.
    expect(garageTakesJobAgain(job({ dropinEnabled: false }))).toBe(false)
    expect(garageTakesJobAgain(job({ doorstepEnabled: false }, { bookingType: 'doorstep' }))).toBe(false)
    // Pickup & drop: still offered (terms on file), and measured from the pin.
    expect(garageTakesJobAgain(job({}, { bookingType: 'pickup' }))).toBe(true)
    expect(garageTakesJobAgain(job({ pickupOffered: false }, { bookingType: 'pickup' }))).toBe(false)
    expect(garageTakesJobAgain(job({ pinned: false }, { bookingType: 'pickup' }))).toBe(false)
    // A drop-in is not affected by the garage dropping pickup.
    expect(garageTakesJobAgain(job({ pickupOffered: false }))).toBe(true)
    expect(garageTakesJobAgain(job({ active: false }))).toBe(false)
    expect(garageTakesJobAgain(job({ verified: false }))).toBe(false)
    expect(garageTakesJobAgain(job({}, { vendorPausedAt: ago(HOUR) }))).toBe(false)
  })

  test('service labels', () => {
    expect(serviceLabelOf(['Express Wash'])).toBe('Express Wash')
    expect(serviceLabelOf(['Express Wash', 'Vacuum', 'Polish'])).toBe('Express Wash + 2 more')
  })
})
