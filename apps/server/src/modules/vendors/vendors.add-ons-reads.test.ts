/**
 * Add-ons (0068) through the real service code, with only the database stood
 * in for: moving a paid booking whose add-on has since been switched off, and
 * the garage's Earnings list. Also the reschedule picker's hours and holidays
 * at a garage whose city is off (0069).
 */
import { afterEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { vendorsService } = await import('./vendors.service.js')
const { vendorsRepository } = await import('./vendors.repository.js')
const { bookingsRepository } = await import('../bookings/bookings.repository.js')
const { reviewsRepository } = await import('../reviews/reviews.repository.js')
const { AppError } = await import('../../lib/errors.js')

const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GARAGE = id(5820)
const USER = id(5821)
const BOOKING = id(5822)
const FOAM = id(5823)
const HELMET = id(5824)

const restores: Array<() => void> = []
function patch(target: object, key: string, value: unknown) {
  const holder = target as Record<string, unknown>
  const original = holder[key]
  holder[key] = value
  restores.push(() => {
    holder[key] = original
  })
}
afterEach(() => {
  while (restores.length) restores.pop()!()
})

const items = [
  { id: 'i1', serviceId: FOAM, name: 'Foam wash', amount: '599.00', durationMins: 45, sortOrder: 0, isAddon: false },
  { id: 'i2', serviceId: HELMET, name: 'Helmet wash', amount: '99.00', durationMins: 10, sortOrder: 1, isAddon: true },
]

const DATE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

describe('moving a paid booking', () => {
  function standIn() {
    patch(bookingsRepository, 'findBookingById', async () => ({
      id: BOOKING,
      userId: USER,
      vendorId: GARAGE,
      bookingType: 'dropin',
      durationMins: 55,
      items,
    }))
    const garage = async () => ({
      id: GARAGE,
      bays: 2,
      jobsPerDay: null,
      slotIntervalMins: 30,
      bookingsPausedAt: null,
    })
    patch(vendorsRepository, 'findPublicVendorById', garage)
    // Moving a booking reads the garage without its city's switch (0069).
    patch(vendorsRepository, 'findVendorForItsBookings', garage)
    patch(vendorsRepository, 'findWorkingHoursForDay', async () => ({
      openTime: '06:00:00',
      closeTime: '22:00:00',
      isClosed: false,
    }))
    patch(bookingsRepository, 'findClosure', async () => null)
    patch(bookingsRepository, 'listCapacityHolders', async () => [])
    // As the real read: the helmet wash has been switched off, so only the
    // foam wash comes back.
    patch(vendorsRepository, 'findPublicServices', async () => [{ id: FOAM, durationMins: 45, isActive: true, isAddon: false }])
  }

  const query = { date: DATE, bookingType: 'dropin' as const, serviceIds: [FOAM, HELMET] }

  test('still loads its times once an add-on on it is switched off, for the whole job', async () => {
    standIn()
    const day = await vendorsService.getRescheduleSlots(USER, GARAGE, BOOKING, query)
    expect(day.slots.length).toBeGreaterThan(0)
    expect(day.durationMins).toBe(55)
  })

  test('a new booking of the same lines is still refused', async () => {
    standIn()
    const refusal = await vendorsService.getAvailableSlots(GARAGE, query).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(AppError)
    expect((refusal as InstanceType<typeof AppError>).code).toBe('SERVICE_NOT_FOUND')
  })

  test('someone else’s booking is still a 404', async () => {
    standIn()
    const refusal = await vendorsService.getRescheduleSlots(id(5829), GARAGE, BOOKING, query).catch((error: unknown) => error)
    expect((refusal as InstanceType<typeof AppError>).code).toBe('BOOKING_NOT_FOUND')
  })
})

describe('Earnings', () => {
  test('names a job by its services, while its money includes the add-on', async () => {
    patch(bookingsRepository, 'listBookingsForVendor', async () => [
      {
        id: BOOKING,
        status: 'completed',
        noShow: null,
        bookingType: 'dropin',
        scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        amount: '698.00',
        subtotalAmount: '698.00',
        discountAmount: '0.00',
        discountFundedBy: null,
        items,
        service: { name: 'Foam wash' },
        user: { name: 'Meena' },
        payment: { status: 'paid' },
      },
    ])
    patch(reviewsRepository, 'listReviewsForVendor', async () => [])

    const earnings = await vendorsService.getEarnings(GARAGE, 'week')
    expect(earnings.jobs[0]?.serviceNames).toEqual(['Foam wash'])
    expect(Number(earnings.jobs[0]?.amount)).toBe(698)
  })

  test('a booking marked Test earns nothing, in the week tile or anywhere else (owner, 10 Nov 2026)', async () => {
    const job = {
      status: 'completed',
      noShow: null,
      bookingType: 'dropin',
      scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      amount: '698.00',
      subtotalAmount: '698.00',
      discountAmount: '0.00',
      discountFundedBy: null,
      items,
      service: { name: 'Foam wash' },
      user: { name: 'Meena' },
      payment: { status: 'paid' },
    }
    patch(bookingsRepository, 'listBookingsForVendor', async () => [
      { ...job, id: BOOKING, markedTestAt: null },
      { ...job, id: id(5825), markedTestAt: new Date() },
    ])
    patch(reviewsRepository, 'listReviewsForVendor', async () => [])

    const earnings = await vendorsService.getEarnings(GARAGE, 'week')
    expect(earnings.jobs.map((job) => job.id)).toEqual([BOOKING])
    expect(earnings.summary.jobsDone).toBe(1)
    expect(Number(earnings.weekEarnings)).toBe(Number(earnings.summary.totalEarned))
    expect(Number(earnings.weekEarnings)).toBe(Number(earnings.jobs[0]?.amount))
  })
})

describe('the reschedule picker at a garage whose city is off (0069)', () => {
  // As the real reads: the page rule (with the city's switch) finds nothing,
  // the rule for existing bookings still finds the garage.
  function standIn() {
    patch(vendorsRepository, 'findPublicVendorById', async () => undefined)
    patch(vendorsRepository, 'findVendorForItsBookings', async (vendorId: string) =>
      vendorId === GARAGE ? { id: GARAGE } : undefined
    )
    patch(vendorsRepository, 'listWorkingHours', async () => [
      { id: 'h1', vendorId: GARAGE, dayOfWeek: 0, openTime: '09:00:00', closeTime: '18:00:00', isClosed: true },
    ])
    patch(vendorsRepository, 'listClosures', async () => [{ id: 'c1', vendorId: GARAGE, date: DATE, reason: null }])
  }

  test('still gets the weekly hours, so closed days stay greyed out', async () => {
    standIn()
    const hours = await vendorsService.getPublicWorkingHours(GARAGE)
    expect(hours).toEqual([{ id: 'h1', dayOfWeek: 0, openTime: '09:00:00', closeTime: '18:00:00', isClosed: true }])
  })

  test('still gets the holidays', async () => {
    standIn()
    expect(await vendorsService.getPublicClosures(GARAGE)).toEqual([DATE])
  })

  test('a garage that is not open even for its bookings is still a 404', async () => {
    standIn()
    const refusal = await vendorsService.getPublicWorkingHours(id(5829)).catch((error: unknown) => error)
    expect((refusal as InstanceType<typeof AppError>).code).toBe('VENDOR_NOT_FOUND')
  })
})
