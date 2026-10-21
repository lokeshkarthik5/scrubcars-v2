/**
 * The Home hub's read, at the API: offers first, the must-act card above
 * them, the car with its wash bar and tile, Updates with its read marker,
 * and the customer's own ×s. The screens arrive in a later PR; this pins the
 * data they will be built on.
 *
 * Each test signs in fresh as its own CUSTOMERS.home* customer (a saved
 * token can expire mid-run), and every fixture is at VENDORS.homePromo, a
 * garage nobody else books, ~130 km from ORIGIN. Its codes are shown only to
 * customers who booked it or stand near it (HOME_OFFER_TARGETING is on in
 * .env.e2e), so assertions find an offer by its code and never count the
 * carousel.
 */
import { request } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import {
  BOOKINGS,
  CHARGES,
  CUSTOMERS,
  DISCOUNTS,
  HOME_PROMO_PIN,
  NOTICES,
  ORIGIN,
  SERVICES,
  VEHICLES,
  VENDORS,
} from '../../support/seed-ids'

const HOME = `${API}/api/v1/users/me/home`
const UPDATES = `${API}/api/v1/users/me/updates`

type Offer = { id: string; code: string; title: string; metaLine: string; vendorId: string | null }

const codes = (offers: Offer[]) => offers.map((offer) => offer.code)

async function readHome(customer: Awaited<ReturnType<typeof loginViaApi>>, query = '') {
  const response = await customer.get(`${HOME}${query}`)
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data
}

/** Standing next to the Hub Promo garage. */
const NEAR_PROMO = `?lat=${HOME_PROMO_PIN.lat + 0.001}&lng=${HOME_PROMO_PIN.lng + 0.001}`

test.describe('Home hub API @p0', () => {
  test('signed out, there is no Home', async () => {
    const guest = await request.newContext()
    expect((await guest.get(HOME)).status()).toBe(401)
    await guest.dispose()
  })

  test("offers come first: a garage's code reaches those who booked it, with small print from its columns", async () => {
    const customer = await loginViaApi(CUSTOMERS.homeOffer.phone)

    const home = await readHome(customer)
    const booked = (home.offers as Offer[]).find((offer) => offer.code === DISCOUNTS.homeBooked.code)
    expect(booked).toMatchObject({
      id: DISCOUNTS.homeBooked.id,
      title: DISCOUNTS.homeBooked.homeTitle,
      vendorId: VENDORS.homePromo.id,
      vendorName: VENDORS.homePromo.name,
      priority: 2,
    })
    // "Up to ₹150 · Code HUBBOOKED · Till Sat 17 Oct": the end is at midnight
    // IST, so the last day named is the day before.
    expect(booked!.metaLine).toMatch(/^Up to ₹150 · Code HUBBOOKED · Till \w{3} \d{1,2} \w{3}$/)
    // Not standing near the garage: the "near" code is not offered.
    expect(codes(home.offers)).not.toContain(DISCOUNTS.homeNear.code)
    expect(home.offers.length).toBeLessThanOrEqual(3)

    // Nothing to act on. The job was three days ago and is not rated, so
    // "How was your wash?" asks for it: the prompt lasts 14 days.
    expect(home.mustAct).toBeNull()
    expect(home.softCard).toMatchObject({
      kind: 'rate',
      bookingId: BOOKINGS.homeOfferDone,
      vendorName: VENDORS.homePromo.name,
    })
    expect(home.header).toMatchObject({ firstName: 'Hub' })

    // No booking ahead: the tile offers the same job again, priced for the car.
    expect(home.cars).toHaveLength(1)
    expect(home.cars[0]).toMatchObject({
      id: CUSTOMERS.homeOffer.vehicleId,
      vehicleType: 'hatchback',
      rightTile: {
        kind: 'book_again',
        bookingId: BOOKINGS.homeOfferDone,
        vendorId: VENDORS.homePromo.id,
        bookingType: 'dropin',
        serviceIds: [SERVICES.homePromoWash.id],
        serviceLabel: SERVICES.homePromoWash.name,
        price: SERVICES.homePromoWash.price,
        pricedOnInspection: false,
        available: true,
      },
    })
    expect(home.nearby).toBeNull()
    expect(typeof home.tip.text).toBe('string')

    // Standing next to the garage: the "near" code joins, after the Top one.
    const near = await readHome(customer, NEAR_PROMO)
    const order = codes(near.offers)
    expect(order).toContain(DISCOUNTS.homeNear.code)
    expect(order.indexOf(DISCOUNTS.homeBooked.code)).toBeLessThan(order.indexOf(DISCOUNTS.homeNear.code))
    expect(near.nearby.radiusKm).toBe(50)
    expect(near.nearby.count).toBeGreaterThanOrEqual(1)
    expect(near.nearby.closestKm).toBeLessThanOrEqual(1)

    await customer.dispose()
  })

  test('a bill to pay is the one card above the offers, and Rate your wash waits', async () => {
    const customer = await loginViaApi(CUSTOMERS.homeBill.phone)
    const home = await readHome(customer)

    expect(home.mustAct).toEqual({
      kind: 'bill_due',
      bookingId: BOOKINGS.homeBillJob,
      chargeId: CHARGES.homeBill,
      vendorName: VENDORS.homePromo.name,
      serviceName: SERVICES.homePromoInspect.name,
      amountDue: '800.00',
      raisedAt: expect.any(String),
      moreDue: 0,
    })
    // Finished five hours ago and not rated, but never two cards with the bill.
    expect(home.softCard).toBeNull()
    // The bill is the card, so it is not repeated as an Updates row.
    expect(home.updates.items.map((item: { id: string }) => item.id)).not.toContain(`bill:${CHARGES.homeBill}`)

    await customer.dispose()
  })

  test('the garage is shut on the booking day', async () => {
    const customer = await loginViaApi(CUSTOMERS.homeClosed.phone)
    const home = await readHome(customer)

    expect(home.mustAct).toMatchObject({
      kind: 'garage_closed',
      bookingId: BOOKINGS.homeClosedUpcoming,
      vendorId: VENDORS.homePromo.id,
      reason: 'holiday',
      canChangeTime: true,
    })
    expect(home.cars[0].rightTile).toMatchObject({
      kind: 'next_booking',
      bookingId: BOOKINGS.homeClosedUpcoming,
      paymentStatus: 'paid',
      notice: null,
    })

    await customer.dispose()
  })

  test('wash due and overdue, and the interval the customer picks', async () => {
    const customer = await loginViaApi(CUSTOMERS.homeWash.phone)
    const vehicle = (id: string) => `${API}/api/v1/users/me/vehicles/${id}`
    const setInterval = (days: number | null | string) =>
      customer.patch(vehicle(CUSTOMERS.homeWash.vehicleId), { data: { washIntervalDays: days } })

    // As seeded; set again so a retry starts from the same place.
    expect((await setInterval(10)).status()).toBe(200)

    // Whole days in Chennai since each seeded wash: 8 and 13, unless the run
    // has crossed an IST midnight since the seed, which adds one to both.
    const istDay = (at: Date) => Math.floor((at.getTime() + 5.5 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))
    const since = async (bookingId: string) => {
      const [row] = await sql<{ completed_at: Date }[]>`select completed_at from bookings where id = ${bookingId}`
      return istDay(new Date()) - istDay(row.completed_at)
    }
    const first = await since(BOOKINGS.homeWashFirst)
    const second = await since(BOOKINGS.homeWashSecond)
    expect([8, 9]).toContain(first)

    const home = await readHome(customer)
    expect(home.cars.map((car: { id: string }) => car.id)).toEqual([
      CUSTOMERS.homeWash.vehicleId,
      VEHICLES.homeWashSecond,
    ])
    // 8 days into 10: due in 2 days. 13 days into 10: overdue by 3.
    expect(home.cars[0].wash).toMatchObject({
      intervalDays: 10,
      isDefaultInterval: false,
      state: 'due_soon',
      daysSinceWash: first,
      daysLeft: 10 - first,
    })
    expect(home.cars[1].wash).toMatchObject({
      intervalDays: 10,
      state: 'overdue',
      daysSinceWash: second,
      daysLeft: 10 - second,
    })

    const picked = await setInterval(21)
    expect(picked.status()).toBe(200)
    expect((await picked.json()).data).toMatchObject({ id: CUSTOMERS.homeWash.vehicleId, washIntervalDays: 21 })
    expect((await readHome(customer)).cars[0].wash).toMatchObject({ intervalDays: 21, state: 'ok', daysLeft: 21 - first })

    // Only the five intervals the app offers.
    expect((await setInterval(12)).status()).toBe(400)
    expect((await setInterval('14')).status()).toBe(400)

    // Null is the default again.
    expect((await setInterval(null)).status()).toBe(200)
    expect((await readHome(customer)).cars[0].wash.isDefaultInterval).toBe(true)

    expect((await setInterval(10)).status()).toBe(200)
    await customer.dispose()
  })

  test('a new customer: no car, so no garage offers and nothing booked', async () => {
    const customer = await loginViaApi(CUSTOMERS.homeNew.phone)
    // Even standing next to the garage: its codes are priced against a car.
    const home = await readHome(customer, NEAR_PROMO)

    expect(home.cars).toEqual([])
    expect(home.nextBooking).toBeNull()
    expect(codes(home.offers)).not.toContain(DISCOUNTS.homeBooked.code)
    expect(codes(home.offers)).not.toContain(DISCOUNTS.homeNear.code)
    expect(home.mustAct).toBeNull()
    expect(home.softCard).toBeNull()
    expect(home.updates.items).toEqual([])
    expect(home.updates.total).toBe(0)

    await customer.dispose()
  })

  test('Updates: new rows light the bell until Updates is opened', async () => {
    // Back to the seeded marker, so a retry reads the same unread rows. The
    // API only ever moves it forward. The rating prompt is reopened too: the
    // next test closes it, and a re-run of this one expects it on To do.
    await sql`
      update users set updates_seen_at = now() - interval '60 hours'
       where id = ${CUSTOMERS.homeUpdates.id}
    `
    await sql`update bookings set review_prompt_dismissed_at = null where id = ${BOOKINGS.homeUpdatesDone}`
    const customer = await loginViaApi(CUSTOMERS.homeUpdates.phone)

    const home = await readHome(customer)
    // "R. Uday": the initial is skipped.
    expect(home.header).toMatchObject({ firstName: 'Uday', hasUnread: true })
    expect(home.updates.items.length).toBeLessThanOrEqual(2)

    const updates = await customer.get(UPDATES)
    expect(updates.status()).toBe(200)
    const { data } = await updates.json()
    const mine = data.items.filter((item: { bookingId: string }) => item.bookingId === BOOKINGS.homeUpdatesDone)
    expect(mine.map((item: { kind: string }) => item.kind)).toEqual(
      expect.arrayContaining(['completed', 'started', 'accepted', 'receipt_ready'])
    )
    expect(mine.find((item: { kind: string }) => item.kind === 'completed')).toMatchObject({
      title: 'Your car is done',
      body: `${VENDORS.homePromo.name} · ${SERVICES.homePromoWash.name}`,
      unread: true,
    })
    expect(data.todo).toContainEqual(expect.objectContaining({ kind: 'rate', bookingId: BOOKINGS.homeUpdatesDone }))

    // The server's own clock, sent back: a phone running slow must not leave
    // the newest rows unread.
    expect(Date.parse(data.now)).not.toBeNaN()
    const seen = await customer.post(`${UPDATES}/seen`, { data: { at: data.now } })
    expect(seen.status()).toBe(204)

    expect((await readHome(customer)).header.hasUnread).toBe(false)
    const after = await (await customer.get(UPDATES)).json()
    expect(after.data.items.every((item: { unread: boolean }) => !item.unread)).toBe(true)

    expect((await customer.post(`${UPDATES}/seen`, { data: { at: 'yesterday' } })).status()).toBe(400)
    await customer.dispose()
  })

  test('Rate your wash, closed with ×; nobody else can close it', async () => {
    await sql`update bookings set review_prompt_dismissed_at = null where id = ${BOOKINGS.homeUpdatesDone}`
    const customer = await loginViaApi(CUSTOMERS.homeUpdates.phone)
    const dismiss = `${API}/api/v1/bookings/${BOOKINGS.homeUpdatesDone}/review-prompt/dismiss`

    expect((await readHome(customer)).softCard).toMatchObject({
      kind: 'rate',
      bookingId: BOOKINGS.homeUpdatesDone,
      vendorName: VENDORS.homePromo.name,
      vehicleName: 'Maruti Baleno',
    })

    const stranger = await loginViaApi(CUSTOMERS.homeNew.phone)
    const refused = await stranger.post(dismiss)
    expect(refused.status()).toBe(404)
    expect(await refused.json()).toEqual({
      success: false,
      message: 'Booking not found',
      code: 'BOOKING_NOT_FOUND',
    })
    await stranger.dispose()

    expect((await customer.post(dismiss)).status()).toBe(204)
    expect((await readHome(customer)).softCard).toBeNull()

    await customer.dispose()
  })

  test("a notice about my booking rides on its tile and leads Updates; × hides it, and an offer's × hides the offer", async () => {
    await sql`delete from notice_dismissals where user_id = ${CUSTOMERS.homeNotice.id}`
    await sql`delete from offer_dismissals where user_id = ${CUSTOMERS.homeNotice.id}`
    const customer = await loginViaApi(CUSTOMERS.homeNotice.phone)

    const home = await readHome(customer)
    // Not a card above the car: one line on the Next booking tile.
    expect(home.mustAct).toBeNull()
    expect(home.cars[0].rightTile).toMatchObject({
      kind: 'next_booking',
      bookingId: BOOKINGS.homeNoticeUpcoming,
      status: 'confirmed',
      paymentStatus: 'paid',
      notice: { noticeId: NOTICES.homeRain, title: 'Slot may move: rain' },
    })
    // And the first row of Updates.
    expect(home.updates.items[0]).toMatchObject({
      kind: 'notice',
      noticeId: NOTICES.homeRain,
      bookingId: BOOKINGS.homeNoticeUpcoming,
      title: 'Slot may move: rain',
    })
    // A paid booking ahead: booked, so the wash bar is never overdue.
    expect(home.cars[0].wash.state).toBe('booked')
    expect(codes(home.offers)).toContain(DISCOUNTS.homeBooked.code)

    expect((await customer.post(`${API}/api/v1/users/me/notices/${NOTICES.homeRain}/dismiss`)).status()).toBe(204)
    // Twice is fine.
    expect((await customer.post(`${API}/api/v1/users/me/notices/${NOTICES.homeRain}/dismiss`)).status()).toBe(204)
    const afterNotice = await readHome(customer)
    expect(afterNotice.cars[0].rightTile.notice).toBeNull()
    expect(afterNotice.updates.items.map((item: { kind: string }) => item.kind)).not.toContain('notice')

    expect((await customer.post(`${API}/api/v1/users/me/offers/${DISCOUNTS.homeBooked.id}/dismiss`)).status()).toBe(204)
    expect(codes((await readHome(customer)).offers)).not.toContain(DISCOUNTS.homeBooked.code)

    const unknown = await customer.post(`${API}/api/v1/users/me/notices/${BOOKINGS.homeNoticeUpcoming}/dismiss`)
    expect(unknown.status()).toBe(404)
    expect(await unknown.json()).toEqual({ success: false, message: 'Notice not found', code: 'NOTICE_NOT_FOUND' })
    // A code since taken off Home (the card may still be open on a phone):
    // the × still lands, so the card just goes.
    const offHome = await customer.post(`${API}/api/v1/users/me/offers/${DISCOUNTS.percentCapped.id}/dismiss`)
    expect(offHome.status()).toBe(204)
    // A code that does not exist is not an offer to close.
    const noCode = await customer.post(`${API}/api/v1/users/me/offers/${BOOKINGS.homeNoticeUpcoming}/dismiss`)
    expect(noCode.status()).toBe(404)
    expect(await noCode.json()).toEqual({ success: false, message: 'Offer not found', code: 'OFFER_NOT_FOUND' })

    await customer.dispose()
  })

  test('Nearby counts every garage within 50 km, the same reach as the list', async () => {
    const customer = await loginViaApi(CUSTOMERS.homeNew.phone)

    // From ORIGIN: MAIN, Second, Narrow and all twelve fillers (out to
    // 24.8 km) at least, where the old 10 km counted five.
    const city = await readHome(customer, `?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
    expect(city.nearby.radiusKm).toBe(50)
    expect(city.nearby.count).toBeGreaterThanOrEqual(15)
    expect(city.nearby.closestKm).toBeLessThanOrEqual(1)

    // Madurai: nothing within 50 km, said as a count of none, not left out.
    const none = await readHome(customer, '?lat=9.925&lng=78.12')
    expect(none.nearby).toEqual({ count: 0, closestKm: null, radiusKm: 50 })

    await customer.dispose()
  })

  test('a location comes as a pair', async () => {
    const customer = await loginViaApi(CUSTOMERS.homeNew.phone)
    expect((await customer.get(`${HOME}?lat=12.9`)).status()).toBe(400)
    expect((await customer.get(`${HOME}?lat=999&lng=79`)).status()).toBe(400)
    // Empty parameters (no fix yet) are no location, not the point (0, 0).
    expect((await readHome(customer, '?lat=&lng=')).nearby).toBeNull()
    await customer.dispose()
  })
})
