/**
 * Add-ons (0068) through the real service code, with only the database stood
 * in for: moving a paid booking whose add-on has since been switched off, and
 * the garage's Earnings list.
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
    patch(vendorsRepository, 'findPublicVendorById', async () => ({
      id: GARAGE,
      bays: 2,
      jobsPerDay: null,
      slotIntervalMins: 30,
      bookingsPausedAt: null,
    }))
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
})
