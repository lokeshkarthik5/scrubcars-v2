/**
 * Statistics, at the admin API: exact figures for one garage, and the
 * refusals.
 *
 * Every figure is asserted exactly because it is asked for VENDORS.stats
 * alone, a garage nobody else books: see STATS in e2e-ids.ts for each
 * booking and what it adds up to. The range runs from the day before the
 * garage's 23rd booking to today, with the days read off the seeded rows
 * rather than worked out from the clock, so a run that crosses midnight
 * still asks for the same bookings.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CUSTOMERS, STATS, VENDORS } from '../../support/seed-ids'

const STATS_API = `${API}/api/v1/admin/stats`
const GARAGE = VENDORS.stats.id

/** The IST day a seeded booking was made on. */
async function bookedDay(id: string): Promise<string> {
  const [row] = await sql<{ day: string }[]>`
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day
      from bookings where id = ${id}
  `
  return row.day
}

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

test.use({ storageState: asRole('admin') })

test.describe('statistics API @p0', () => {
  let from: string
  let to: string

  test.beforeAll(async () => {
    from = addDays(await bookedDay(STATS.received(23)), -1)
    to = todayIst()
  })

  test('overview: the tiles, per day and per week, against the period before', async ({ page }) => {
    const response = await page.request.get(
      `${STATS_API}/overview?from=${from}&to=${to}&vendorId=${GARAGE}&compare=1`
    )
    expect(response.status()).toBe(200)
    const { success, data } = await response.json()
    expect(success).toBe(true)

    // 23–32: ten paid, the moved one once; the Test and unpaid ones left out
    // of the bookings, the unpaid one and two checkouts in what was started.
    // received(29)'s stray ₹1,300 bill payment and its refund add nothing.
    expect(data.kpis).toEqual({
      bookings: 10,
      collected: 7900,
      commission: 335,
      averageBooking: 790,
      checkoutsStarted: 13,
      paidOfStarted: 10 / 13,
      cancelled: 1,
      cancellationRate: 0.1,
    })
    expect(data.range).toEqual({ from, to, days: data.perDay.length })
    expect(data.previous.days).toBe(data.range.days)
    expect(data.previous.to).toBe(addDays(from, -1))
    // received(21) and (22), in the days just before.
    expect(data.previousKpis).toEqual({
      bookings: 2,
      collected: 1000,
      commission: 0,
      averageBooking: 500,
      checkoutsStarted: 2,
      paidOfStarted: 1,
      cancelled: 0,
      cancellationRate: 0,
    })

    const perDay = data.perDay as Array<{ date: string; bookings: number }>
    expect(perDay[0].date).toBe(from)
    expect(perDay.reduce((sum, day) => sum + day.bookings, 0)).toBe(10)
    const day26 = await bookedDay(STATS.received(26))
    expect(perDay.find((day) => day.date === day26)?.bookings).toBe(1)
    expect(
      (data.previousPerDay as Array<{ bookings: number }>).reduce((sum, day) => sum + day.bookings, 0)
    ).toBe(2)

    expect(data.collected.unit).toBe('week')
    const bars = data.collected.bars as Array<{ collected: number; days: number }>
    expect(bars.reduce((sum, bar) => sum + bar.collected, 0)).toBe(7900)
    expect(bars.reduce((sum, bar) => sum + bar.days, 0)).toBe(data.range.days)
  })

  test('breakdown: the funnel, the garage, service types and busy hours', async ({ page }) => {
    const response = await page.request.get(
      `${STATS_API}/breakdown?from=${from}&to=${to}&vendorId=${GARAGE}`
    )
    expect(response.status()).toBe(200)
    const { data } = await response.json()

    expect(data.funnel).toEqual({
      checkoutsStarted: 13,
      paid: 10,
      completed: 7,
      // The unpaid booking and the abandoned checkout.
      leftWithoutPaying: 2,
      paidNoBooking: 1,
      cancelled: 1,
      noShows: 1,
      notDone: 1,
      paidOfStarted: 10 / 13,
      completedOfPaid: 0.7,
    })
    expect(data.garages).toEqual([
      {
        vendorId: GARAGE,
        name: VENDORS.stats.name,
        bookings: 10,
        collected: 7900,
        rating: 4.5,
        reviews: 2,
      },
    ])
    expect(data.services.slice(0, 3)).toEqual([
      { category: 'detailing', bookings: 2, collected: 3400 },
      { category: 'car_wash', bookings: 7, collected: 3000 },
      { category: 'scratch_removal', bookings: 1, collected: 1500 },
    ])
    expect(data.services).toHaveLength(6)

    // 23–29, each slot at 10:00 the day after it was booked. The no-show,
    // the cancelled ones and the Test one are left out; the moved one's slot
    // is after the range (two days on by the seed's UTC date, so never today
    // in India, whatever the time of the run).
    expect(data.busyHours.total).toBe(7)
    const busy = (data.busyHours.cells as Array<{ hour: number; bookings: number }>).filter(
      (cell) => cell.bookings > 0
    )
    expect(busy.every((cell) => cell.hour === 10)).toBe(true)
    expect(data.busyHours.cells).toHaveLength(7 * 15)
  })

  test('commission: the 26th on, by service, on the full price', async ({ page }) => {
    const response = await page.request.get(
      `${STATS_API}/commission?from=${from}&to=${to}&vendorId=${GARAGE}`
    )
    expect(response.status()).toBe(200)
    const { data } = await response.json()

    expect(data.rules).toEqual({
      rates: [
        { rate: 0.08, categories: ['car_wash', 'package', 'others'] },
        { rate: 0.05, categories: ['detailing', 'coating', 'scratch_removal'] },
      ],
      freeBookings: 25,
    })
    // 26: ₹40. 27: ₹100 on the full ₹2,000 (Detlio paid the promo). 28: ₹80
    // on ₹1,600 (the garage gave ₹400). 29: ₹75 with its bill. 30, a customer
    // no-show: ₹40. 31 (refunded) and 32 (not done yet): nothing.
    expect(data.commission).toBe(335)
    expect(data.collected).toBe(7900)
    expect(data.active).toEqual([
      {
        vendorId: GARAGE,
        name: VENDORS.stats.name,
        bookings: 10,
        commission: 335,
        activeSince: await bookedDay(STATS.received(26)),
      },
    ])
    expect(data.free).toEqual([])
  })

  test('the free 25 count cancelled bookings, and not Test or unpaid ones', async ({ page }) => {
    // Up to the 24th: three cancelled among them, one Test and one unpaid
    // left out, so one free booking is left.
    const day24 = await bookedDay(STATS.received(24))
    const upTo24 = await (
      await page.request.get(`${STATS_API}/commission?from=${from}&to=${day24}&vendorId=${GARAGE}`)
    ).json()
    expect(upTo24.data.commission).toBe(0)
    expect(upTo24.data.active).toEqual([])
    expect(upTo24.data.free).toEqual([
      { vendorId: GARAGE, name: VENDORS.stats.name, used: 24, left: 1 },
    ])

    // The 26th alone: the first one charged.
    const day26 = await bookedDay(STATS.received(26))
    const the26th = await (
      await page.request.get(`${STATS_API}/commission?from=${day26}&to=${day26}&vendorId=${GARAGE}`)
    ).json()
    expect(the26th.data.commission).toBe(40)
    expect(the26th.data.active).toEqual([
      { vendorId: GARAGE, name: VENDORS.stats.name, bookings: 1, commission: 40, activeSince: day26 },
    ])
  })

  test('every garage at once still counts this one the same', async ({ page }) => {
    const breakdown = await (
      await page.request.get(`${STATS_API}/breakdown?from=${from}&to=${to}`)
    ).json()
    expect(
      breakdown.data.garages.find((garage: { vendorId: string }) => garage.vendorId === GARAGE)
    ).toEqual({
      vendorId: GARAGE,
      name: VENDORS.stats.name,
      bookings: 10,
      collected: 7900,
      rating: 4.5,
      reviews: 2,
    })

    const commission = await (
      await page.request.get(`${STATS_API}/commission?from=${from}&to=${to}`)
    ).json()
    expect(
      commission.data.active.find((garage: { vendorId: string }) => garage.vendorId === GARAGE)
    ).toMatchObject({ bookings: 10, commission: 335 })
    // Other spec files book in parallel, so the whole is a floor.
    expect(commission.data.commission).toBeGreaterThanOrEqual(335)
  })

  test('a range must be real, in order, and at most 366 days', async ({ page }) => {
    for (const query of [
      `from=${to}&to=${addDays(to, -1)}`,
      `from=${addDays(to, -366)}&to=${to}`,
      `from=${to}`,
      'from=2026-02-30&to=2026-03-01',
      `from=${from}&to=${to}&vendorId=not-a-garage`,
    ]) {
      for (const path of ['overview', 'breakdown', 'commission']) {
        const response = await page.request.get(`${STATS_API}/${path}?${query}`)
        expect(response.status(), `${path}?${query}`).toBe(400)
      }
    }
    // 366 days is allowed.
    const year = await page.request.get(`${STATS_API}/overview?from=${addDays(to, -365)}&to=${to}`)
    expect(year.status()).toBe(200)
    expect((await year.json()).data.collected.unit).toBe('month')
  })

  test('a signed-in customer cannot read them', async () => {
    // A fresh login, as pilot-stats.spec.ts does: a saved customer token may
    // have expired by now, and a 401 would pass a weaker check.
    const customer = await loginViaApi(CUSTOMERS.stats.phone)
    for (const path of ['overview', 'breakdown', 'commission']) {
      const response = await customer.get(`${STATS_API}/${path}?from=${from}&to=${to}`)
      expect(response.status()).toBe(403)
      expect(await response.json()).toEqual({
        success: false,
        message: 'Admin access required',
        code: 'ADMIN_REQUIRED',
      })
    }
    await customer.dispose()
  })
})
