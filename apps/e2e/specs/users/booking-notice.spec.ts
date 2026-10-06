/**
 * Minimum notice: a slot must start at least 1 hour out at the garage and 3
 * hours out for doorstep.
 *
 * Checked as an invariant on the slot list rather than by booking a near time:
 * which times exist "today" depends on when the suite runs, but "nothing
 * offered starts sooner than the notice" holds at any hour. Read-only.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { ADDRESSES, CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

const HOUR = 60 * 60 * 1000
// The request takes a moment; a slot on the line when the server answered may
// be a few seconds under it by the time this reads the clock.
const TOLERANCE = 60 * 1000

const istDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 24 * HOUR).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })

type SlotsResponse = { data: { slots: string[]; fitsInDay?: boolean; minNoticeMins?: number } }

async function slots(
  request: import('@playwright/test').APIRequestContext,
  date: string,
  bookingType: 'dropin' | 'doorstep'
) {
  const response = await request.get(`${API}/api/v1/vendors/${VENDORS.main.id}/slots`, {
    params: { date, service_id: SERVICES.wash.id, booking_type: bookingType },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as SlotsResponse).data
}

test.describe('booking notice @p0', () => {
  test('today offers nothing sooner than 1 hour at the garage or 3 doorstep', async ({ request }) => {
    const asked = Date.now()
    const dropin = await slots(request, istDate(0), 'dropin')
    const doorstep = await slots(request, istDate(0), 'doorstep')

    expect(dropin.minNoticeMins).toBe(60)
    expect(doorstep.minNoticeMins).toBe(180)
    for (const slot of dropin.slots) {
      expect(new Date(slot).getTime()).toBeGreaterThanOrEqual(asked + 1 * HOUR - TOLERANCE)
    }
    for (const slot of doorstep.slots) {
      expect(new Date(slot).getTime()).toBeGreaterThanOrEqual(asked + 3 * HOUR - TOLERANCE)
    }
    // A short wash always fits MAIN's day, however late it is: an empty
    // evening is "no time left", never "too long for the day".
    expect(dropin.fitsInDay).toBe(true)
  })

  test('a later day is not cut short by the notice', async ({ request }) => {
    // Tomorrow's first slot (06:00) is at least six hours away at any hour.
    const dropin = await slots(request, istDate(1), 'dropin')
    const doorstep = await slots(request, istDate(1), 'doorstep')
    expect(doorstep.slots.length).toBeGreaterThan(0)
    expect(doorstep.slots).toEqual(dropin.slots)
  })
})

// Checkout refuses a too-soon time before any payment order exists. The notice
// is checked before the garage's hours or slot grid, so these hold at any hour.
const intent = (
  request: import('@playwright/test').APIRequestContext,
  data: Record<string, unknown>
) => request.post(`${API}/api/v1/booking-intents`, { data })

test.describe('booking notice at checkout @p0', () => {
  test.describe('at the garage', () => {
    test.use({ storageState: asRole('customer-book') })

    test('a time under an hour away is refused', async ({ request }) => {
      const response = await intent(request, {
        vendorId: VENDORS.main.id,
        serviceIds: [SERVICES.wash.id],
        vehicleId: CUSTOMERS.book.vehicleId,
        bookingType: 'dropin',
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      expect(response.status()).toBe(400)
      const body = await response.json()
      expect(body.code).toBe('SLOT_TOO_SOON')
      expect(body.message).toMatch(/1 hour's notice/)
    })
  })

  test.describe('doorstep', () => {
    test.use({ storageState: asRole('customer-doorstep') })

    test('a time under 3 hours away is refused', async ({ request }) => {
      const response = await intent(request, {
        vendorId: VENDORS.main.id,
        serviceIds: [SERVICES.wash.id],
        vehicleId: CUSTOMERS.doorstep.vehicleId,
        bookingType: 'doorstep',
        addressId: ADDRESSES.doorstepPinned,
        scheduledAt: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
      })
      expect(response.status()).toBe(400)
      const body = await response.json()
      expect(body.code).toBe('SLOT_TOO_SOON')
      expect(body.message).toMatch(/3 hours' notice/)
    })
  })
})

