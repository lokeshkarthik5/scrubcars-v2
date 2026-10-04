/**
 * What a garage can take: one car per bay, none on a holiday, none at all
 * while it is paused.
 *
 * Each rule is checked twice, the way a customer meets it — the slot list
 * leaves the time out, and checkout refuses it before any payment order is
 * made. Every garage here is one of the scheduling fixtures (see e2e-ids.ts),
 * which no other spec books, and every checkout below is refused, so nothing
 * this file does is written.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, SERVICES, VENDORS } from '../../support/seed-ids'

const MINUTE = 60 * 1000

const istDateOf = (at: Date) =>
  at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type Slots = {
  isClosed: boolean
  closedReason: string | null
  paused: boolean
  fullSlots: number
  slots: string[]
}

async function slots(
  request: APIRequestContext,
  vendorId: string,
  serviceId: string,
  date: string
): Promise<Slots> {
  const response = await request.get(`${API}/api/v1/vendors/${vendorId}/slots`, {
    params: { date, service_id: serviceId, booking_type: 'dropin' },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { data: Slots }).data
}

/**
 * The one booked time at CAPACITY, read back rather than recomputed: the seed
 * decides "tomorrow at 10:00", and a spec doing its own date sums could
 * disagree with it around midnight.
 */
async function heldSlot(): Promise<Date> {
  const [row] = await sql<{ scheduled_at: Date }[]>`
    select scheduled_at from bookings where id = ${BOOKINGS.capacityHeld}
  `
  return new Date(row.scheduled_at)
}

async function holidayDate(): Promise<string> {
  const [row] = await sql<{ date: string }[]>`
    select to_char(date, 'YYYY-MM-DD') as date
      from vendor_closures where vendor_id = ${VENDORS.holiday.id}
  `
  return row.date
}

/** 10:00 IST on a date key, the time each refusal below is asked for. */
const tenAm = (date: string) => new Date(`${date}T10:00:00+05:30`)

// A fresh login rather than a saved state: a bare request context cannot
// refresh an access token, and CUSTOMERS.scheduling belongs to this file alone,
// so clearing its codes cannot race anything.
let customer: APIRequestContext

test.beforeAll(async () => {
  customer = await loginViaApi(CUSTOMERS.scheduling.phone)
})

test.afterAll(async () => {
  await customer.dispose()
})

const checkout = (vendorId: string, serviceId: string, scheduledAt: Date) =>
  customer.post(`${API}/api/v1/booking-intents`, {
    data: {
      vendorId,
      serviceIds: [serviceId],
      vehicleId: CUSTOMERS.scheduling.vehicleId,
      bookingType: 'dropin',
      paymentMethod: 'online',
      scheduledAt: scheduledAt.toISOString(),
    },
  })

test.describe('bay capacity @p0', () => {
  test('a time whose only bay is taken is not offered, and its neighbours are', async ({ request }) => {
    const held = await heldSlot()
    const day = await slots(request, VENDORS.capacity.id, SERVICES.capacityWash.id, istDateOf(held))

    // 10:00–10:30 is taken. A 30-minute job at 09:30 ends as it starts, and
    // one at 10:30 starts as it ends: back to back is not an overlap.
    expect(day.slots).not.toContain(held.toISOString())
    expect(day.slots).toContain(new Date(held.getTime() - 30 * MINUTE).toISOString())
    expect(day.slots).toContain(new Date(held.getTime() + 30 * MINUTE).toISOString())
    expect(day.fullSlots).toBeGreaterThanOrEqual(1)
    expect(day.isClosed).toBe(false)
  })

  test('checkout for the full time is refused before any payment', async () => {
    const held = await heldSlot()
    const response = await checkout(VENDORS.capacity.id, SERVICES.capacityWash.id, held)

    expect(response.status()).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: 'That time has just been booked up at this garage. Please pick another time.',
      code: 'SLOT_FULL',
    })
  })
})

test.describe('moving a booking @p0', () => {
  const rescheduleSlots = (as: APIRequestContext, date: string) =>
    as.get(
      `${API}/api/v1/vendors/${VENDORS.capacity.id}/slots/reschedule/${BOOKINGS.capacityHeld}`,
      { params: { date, service_id: SERVICES.capacityWash.id, booking_type: 'dropin' } }
    )

  test("the booking being moved does not fill its own bay", async () => {
    const held = await heldSlot()
    // Its owner, signed in fresh: nothing else signs in as them.
    const holder = await loginViaApi(CUSTOMERS.capacityHolder.phone)

    const response = await rescheduleSlots(holder, istDateOf(held))
    expect(response.status()).toBe(200)
    const day = ((await response.json()) as { data: Slots }).data
    // At a one-bay garage the only job is this one, so leaving it out frees
    // its own time — the times the reschedule itself would accept.
    expect(day.slots).toContain(held.toISOString())
    expect(day.fullSlots).toBe(0)

    await holder.dispose()
  })

  test("someone else's booking is not found", async () => {
    const response = await rescheduleSlots(customer, istDateOf(await heldSlot()))
    expect(response.status()).toBe(404)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Booking not found',
      code: 'BOOKING_NOT_FOUND',
    })
  })
})

test.describe('holidays @p0', () => {
  test('a holiday is a closed day in the slot list and the picker', async ({ request }) => {
    const date = await holidayDate()
    const day = await slots(request, VENDORS.holiday.id, SERVICES.holidayWash.id, date)

    expect(day).toMatchObject({ isClosed: true, closedReason: 'holiday', slots: [] })

    // The picker greys it from this list before anyone taps it.
    const closures = await request.get(`${API}/api/v1/vendors/${VENDORS.holiday.id}/closures`)
    expect(closures.status()).toBe(200)
    expect((await closures.json()).data).toContain(date)
  })

  test('checkout on a holiday is refused', async () => {
    const date = await holidayDate()
    const response = await checkout(VENDORS.holiday.id, SERVICES.holidayWash.id, tenAm(date))

    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      message: 'This garage is closed on that day. Please pick another day.',
      code: 'GARAGE_CLOSED_THAT_DAY',
    })
  })
})

test.describe('a paused garage @p0', () => {
  const tomorrow = () => istDateOf(new Date(Date.now() + 24 * 60 * MINUTE))

  test('is left out of the public list but its own page still loads', async ({ request }) => {
    const list = await request.get(`${API}/api/v1/vendors`, {
      params: { q: VENDORS.paused.name },
    })
    expect(list.status()).toBe(200)
    const ids = ((await list.json()).data.items as Array<{ id: string }>).map((v) => v.id)
    expect(ids).not.toContain(VENDORS.paused.id)

    // The same search finds its running neighbour, so the absence above is
    // the pause and not a search that would have found nothing anyway.
    const control = await request.get(`${API}/api/v1/vendors`, {
      params: { q: VENDORS.holiday.name },
    })
    const controlIds = ((await control.json()).data.items as Array<{ id: string }>).map((v) => v.id)
    expect(controlIds).toContain(VENDORS.holiday.id)

    const page = await request.get(`${API}/api/v1/vendors/${VENDORS.paused.id}`)
    expect(page.status()).toBe(200)
    expect((await page.json()).data).toMatchObject({
      bookingsPausedReason: 'Closed for renovation',
      bookingsPausedAt: expect.any(String),
    })
  })

  test('offers no times and refuses checkout', async ({ request }) => {
    const day = await slots(request, VENDORS.paused.id, SERVICES.pausedWash.id, tomorrow())
    expect(day).toMatchObject({ paused: true, isClosed: false, slots: [] })

    const response = await checkout(VENDORS.paused.id, SERVICES.pausedWash.id, tenAm(tomorrow()))
    expect(response.status()).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      message: "This garage isn't taking new bookings right now. Please pick another garage.",
      code: 'GARAGE_PAUSED',
    })
  })

  test('its page says it is not taking bookings, in place of Book', async ({ page }) => {
    await page.goto(`/garage/${VENDORS.paused.id}`)

    await expect(page.getByText(VENDORS.paused.name).first()).toBeVisible()
    await expect(page.getByText('Not taking bookings right now')).toBeVisible()
    await expect(page.getByText('Closed for renovation')).toBeVisible()
    // The service is still listed, but nothing can be added to a booking.
    await expect(page.getByText(SERVICES.pausedWash.name).first()).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Add ${SERVICES.pausedWash.name} to booking` })
    ).toHaveCount(0)
  })
})
