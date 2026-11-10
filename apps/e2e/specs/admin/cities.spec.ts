/**
 * Cities (0069): the Cities page and its counts, and a city switched off for
 * customers. Admin puts a 5 km city around CITIES.hill (far from Chennai and
 * every other fixture) and switches it off: the garage leaves the customer
 * list and its page is the usual not-found, while its customer's booking
 * there still opens and can still be moved. "Show this garage anyway" on its
 * edit page brings it back. "Growing here" (0070) is switched on and off for
 * that city, each time saved and audited. The city is removed again after,
 * by name.
 *
 * The rules (which city a garage is in, every switch combination) are
 * unit-tested in apps/server/src/lib/cities.test.ts and the SQL pinned in
 * vendors.predicates.test.ts.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CITIES } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const USERS = 'http://localhost:3000'
const C = CITIES

const reset = async () => {
  await sql`delete from cities where lower(btrim(name)) = lower(${C.hillCity.name})`
  await sql`update vendors set show_when_city_off = false where id = ${C.hill.id}`
}

/** The public list, searched by the garage's own name (no location: every garage). */
const listedIds = async (request: import('@playwright/test').APIRequestContext) => {
  const res = await request.get(`${API}/api/v1/vendors`, { params: { q: C.hill.name, limit: '50' } })
  expect(res.status()).toBe(200)
  const body = await res.json()
  return (body.data.items as Array<{ id: string }>).map((item) => item.id)
}

test.describe.serial('Cities @p0', () => {
  test.beforeAll(reset)
  test.afterAll(reset)

  test('the page lists each city with its counts, and Other towns', async ({ page }) => {
    await page.goto('/cities')
    await expect(page.getByRole('heading', { name: 'Cities', exact: true })).toBeVisible()
    const chennai = page.getByRole('article', { name: 'Chennai' })
    await expect(chennai).toContainText(/\d+ of \d+ garages? live/)
    await expect(chennai.getByRole('switch', { name: 'Customers see garages in Chennai' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(chennai.getByRole('link', { name: 'Add a garage here' })).toHaveAttribute(
      'href',
      '/vendors/new?city=Chennai'
    )
    // "Growing here" (0070): Chennai is growing, as 0070 sets it.
    await expect(chennai.getByRole('switch', { name: 'Growing here: Chennai' })).toHaveAttribute('aria-checked', 'true')
    await expect(chennai).toContainText(
      'Customers here see the free-wash card and that more garages are joining. Leave off for a city with just a partner garage.'
    )
    // The one city the seed adds: its doorstep garage, live.
    await expect(page.getByRole('article', { name: C.wholeTown.name })).toContainText('1 of 1 garage live')
    const others = page.getByRole('region', { name: 'Other towns' })
    await expect(others).toContainText(/garages? live|No garages yet/)
    await expect(others.getByRole('switch', { name: 'Customers see garages in other towns' })).toBeVisible()
  })

  test('a city switched off hides its garage from customers; its booking carries on; Show anyway brings it back', async ({
    page,
    request,
    browser,
  }) => {
    const created = await page.request.post(`${API}/api/v1/admin/cities`, {
      data: { name: C.hillCity.name, lat: C.hill.pin.lat, lng: C.hill.pin.lng, reachKm: C.hillCity.reachKm },
    })
    expect(created.status()).toBe(201)
    const overview = (await created.json()).data
    expect(overview.cities.find((city: { name: string }) => city.name === C.hillCity.name)).toMatchObject({
      reachKm: C.hillCity.reachKm,
      customersSee: true,
      garagesLive: 1,
      garagesTotal: 1,
      garagesHiddenWhenOff: 1,
    })
    // Its audit row, signed with the session's name.
    const [audit] = await sql`select actor_name, summary from admin_audit_log where action = 'city_added' order by created_at desc limit 1`
    expect(audit).toMatchObject({ actor_name: 'E2E Admin', summary: { city: C.hillCity.name } })

    // Listed while the city is on: nothing changed by adding it.
    expect(await listedIds(request)).toContain(C.hill.id)

    // Off, from the page, after the confirm that says what it does.
    await page.goto('/cities')
    const row = page.getByRole('article', { name: C.hillCity.name })
    await row.getByRole('switch', { name: `Customers see garages in ${C.hillCity.name}` }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toContainText(
      `Customers won't see 1 garage in ${C.hillCity.name}. Bookings already made carry on.`
    )
    await sheet.getByRole('button', { name: 'Switch off' }).click()
    await expect(row.getByRole('switch', { name: `Customers see garages in ${C.hillCity.name}` })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(row).toContainText('0 of 1 garage live')

    // Gone from the customer list, and its page is the usual not-found, at
    // the API and on the screen.
    expect(await listedIds(request)).not.toContain(C.hill.id)
    const hidden = await request.get(`${API}/api/v1/vendors/${C.hill.id}`)
    expect(hidden.status()).toBe(404)
    expect(await hidden.json()).toEqual({ success: false, message: 'Vendor not found', code: 'VENDOR_NOT_FOUND' })
    const customerSite = await browser.newPage({ baseURL: USERS })
    await customerSite.goto(`${USERS}/garage/${C.hill.id}`)
    await expect(customerSite.getByText("This garage isn't taking bookings on Detlio.")).toBeVisible()
    await customerSite.close()

    // The booking made before still opens for its customer, and can still be moved.
    const customer = await loginViaApi(C.customer.phone)
    try {
      const booking = await customer.get(`${API}/api/v1/bookings/${C.hillBooking}`)
      expect(booking.status()).toBe(200)
      expect((await booking.json()).data).toMatchObject({ id: C.hillBooking })
      const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      const slots = await customer.get(`${API}/api/v1/vendors/${C.hill.id}/slots/reschedule/${C.hillBooking}`, {
        params: { date: day, service_id: C.hill.serviceId, booking_type: 'dropin' },
      })
      expect(slots.status()).toBe(200)
      // The reschedule sheet's picker greys out closed days and holidays from
      // these two, so they answer for the booked garage while its city is off.
      const hours = await customer.get(`${API}/api/v1/vendors/${C.hill.id}/working-hours`)
      expect(hours.status()).toBe(200)
      expect((await hours.json()).success).toBe(true)
      const closures = await customer.get(`${API}/api/v1/vendors/${C.hill.id}/closures`)
      expect(closures.status()).toBe(200)
      expect((await closures.json()).success).toBe(true)
    } finally {
      await customer.dispose()
    }

    // The garage's own page in admin says why, and shows it anyway.
    await page.goto(`/vendors/${C.hill.id}/edit`)
    await expect(page.getByText(`City: ${C.hillCity.name}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Customers can’t find it' })).toBeVisible()
    await expect(page.getByText(`Its city, ${C.hillCity.name}, is off for customers`)).toBeVisible()
    await page.getByRole('switch', { name: 'Show this garage anyway' }).click()
    await expect
      .poll(async () => (await sql`select show_when_city_off from vendors where id = ${C.hill.id}`)[0].show_when_city_off)
      .toBe(true)
    expect((await request.get(`${API}/api/v1/vendors/${C.hill.id}`)).status()).toBe(200)
    expect(await listedIds(request)).toContain(C.hill.id)
  })

  test('“Growing here” switches on and off for a city, saved and audited each time', async ({ page }) => {
    await page.goto('/cities')
    const row = page.getByRole('article', { name: C.hillCity.name })
    const growing = row.getByRole('switch', { name: `Growing here: ${C.hillCity.name}` })
    // A new city starts off: one partner garage promises nothing.
    await expect(growing).toHaveAttribute('aria-checked', 'false')

    await growing.click()
    await expect(growing).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => (await sql`select growing from cities where lower(btrim(name)) = lower(${C.hillCity.name})`)[0]?.growing)
      .toBe(true)
    const [on] = await sql`select actor_name, summary, detail from admin_audit_log where action = 'city_growing' order by created_at desc limit 1`
    expect(on).toMatchObject({ actor_name: 'E2E Admin', summary: { city: C.hillCity.name }, detail: { growing: true } })

    await growing.click()
    await expect(growing).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => (await sql`select growing from cities where lower(btrim(name)) = lower(${C.hillCity.name})`)[0]?.growing)
      .toBe(false)
    const [off] = await sql`select actor_name, summary from admin_audit_log where action = 'city_not_growing' order by created_at desc limit 1`
    expect(off).toMatchObject({ actor_name: 'E2E Admin', summary: { city: C.hillCity.name } })
  })
})
