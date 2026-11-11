/**
 * Customer cities (0070, mockups A–D): the city chip, the city switch in
 * "Where's your car?", and a small city. GET /cities lists the cities on for
 * customers, Chennai first; picking E2E Smalltown (CUSTOMER_CITIES: one
 * at-garage garage, "Growing here" off) in the sheet switches the chip, and
 * its list shows that garage with no town sign and no count anywhere: "In
 * E2E Smalltown", "Detlio in E2E Smalltown" on the map strip, one quiet
 * "Recommend it" row under the garages, and no free-wash card.
 *
 * Read-only: the city is picked in this browser's own storage. Ids 7000–7009.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { CUSTOMER_CITIES, VENDORS } from '../../support/seed-ids'

const C = CUSTOMER_CITIES

type CustomerCity = {
  id: string
  name: string
  centre: { lat: number; lng: number }
  reachKm: number
  growing: boolean
  garageCount: number
}

test.describe('the customers’ cities, from the API @p0', () => {
  test('GET /cities: the cities on for customers, Chennai first and growing, each with its garages', async ({ request }) => {
    const response = await request.get(`${API}/api/v1/cities`)
    expect(response.status()).toBe(200)
    // A minute at most in any shared cache: an admin's city change must
    // reach customers soon, and a city write clears only one instance.
    expect(response.headers()['cache-control']).toBe('public, max-age=60, s-maxage=60')
    const body = await response.json()
    expect(body.success).toBe(true)
    const cities = body.data.cities as CustomerCity[]

    // The first city is the default for a customer with no place: Chennai.
    expect(cities[0]).toMatchObject({ name: 'Chennai', reachKm: 50, growing: true })
    expect(cities[0].garageCount).toBeGreaterThanOrEqual(3)

    const small = cities.find((city) => city.id === C.smallTown.id)
    expect(small).toEqual({
      id: C.smallTown.id,
      name: C.smallTown.name,
      centre: C.smallTown.centre,
      reachKm: C.smallTown.reachKm,
      growing: false,
      garageCount: 1,
    })
  })

  test('a garage says its own city, and the 150 km limit keeps Chennai out of Smalltown’s list', async ({ request }) => {
    const page = await request.get(`${API}/api/v1/vendors/${C.small.id}`)
    expect((await page.json()).data.garageCity).toEqual({ id: C.smallTown.id, name: C.smallTown.name })

    const list = await request.get(`${API}/api/v1/vendors`, {
      params: { cityLat: C.smallTown.centre.lat, cityLng: C.smallTown.centre.lng, bookingType: 'dropin', limit: 50 },
    })
    const ids = ((await list.json()).data.items as Array<{ id: string }>).map((item) => item.id)
    expect(ids).toContain(C.small.id)
    expect(ids).not.toContain(VENDORS.main.id)
  })
})

test.describe('a small city, on screen @p0', () => {
  // Signed in, no place stored (the fixtures dismiss the prompt with none).
  test.use({ storageState: asRole('customer-browse') })

  test('picking E2E Smalltown in the sheet switches the chip; its list has no counts, no sign and no free wash', async ({ page }) => {
    await page.goto('/garages')

    // No place yet: the first city.
    const chennaiChip = page.getByRole('button', { name: 'Your city: Chennai. Change' })
    await expect(chennaiChip).toContainText('Chennai')
    await chennaiChip.click()

    const sheet = page.getByRole('dialog', { name: "Where's your car?" })
    await expect(sheet).toBeVisible()
    await expect(
      sheet.getByText('Pick your city and area to see distances and drive times. No location permission needed.')
    ).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Near me', exact: true })).toBeVisible()
    const cityChoice = sheet.getByRole('radiogroup', { name: 'City' })
    await expect(cityChoice.getByRole('radio', { name: 'Chennai' })).toHaveAttribute('aria-checked', 'true')

    // Another city changes the list below, and nothing else yet.
    await cityChoice.getByRole('radio', { name: C.smallTown.name }).click()
    await expect(cityChoice.getByRole('radio', { name: C.smallTown.name })).toHaveAttribute('aria-checked', 'true')
    await expect(sheet.getByRole('searchbox', { name: `Search areas in ${C.smallTown.name}` })).toBeVisible()
    // No areas drawn there yet, so none of Chennai's are listed.
    await expect(sheet.getByRole('button', { name: 'Anna Nagar' })).toHaveCount(0)
    await expect(sheet).toBeVisible()

    await sheet.getByRole('button', { name: `All of ${C.smallTown.name}` }).click()
    await expect(sheet).toBeHidden()
    const chip = page.getByRole('button', { name: `Your city: ${C.smallTown.name}. Change` })
    await expect(chip).toContainText(C.smallTown.name)

    // The garage, with no town sign (it is in the customer's city).
    const card = page.locator('[data-garage-card]').filter({ hasText: C.small.name })
    await expect(card).toBeVisible()
    await expect(card).not.toContainText(/\d+ km/)

    // No counts anywhere: the heading, the map strip and the service button.
    await expect(page.getByRole('heading', { name: `In ${C.smallTown.name}` })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Nearby garages' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: `Open the map: Detlio in ${C.smallTown.name}` })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Service: All services. Change' })).toBeVisible()
    await expect(page.getByText(/\b1 garage\b/)).toHaveCount(0)

    // "Growing here" is off: no free-wash card, and no promise of more.
    await expect(page.locator('[data-free-wash-card]')).toHaveCount(0)
    await expect(page.getByText(/more garages|just started/i)).toHaveCount(0)

    // One quiet row under the garages, to the recommend form (admin's leads).
    const recommend = page.getByRole('button', { name: `Know a great garage in ${C.smallTown.name}? Recommend it` })
    await expect(recommend).toBeVisible()
    await recommend.click()
    const form = page.getByRole('dialog', { name: 'Recommend a garage' })
    await expect(form).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Garage name' })).toBeVisible()
  })
})
