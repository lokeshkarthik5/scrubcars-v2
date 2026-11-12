/**
 * Doorstep "All over the city" (0069): CITIES.whole is pinned 20 km north of
 * E2E Wholetown's centre with a 5 km radius and comes all over the city.
 * Its customer lives 20 km south, 40 km from the garage: the garage is on
 * their Doorstep list and the booking's range check lets the address
 * through; an address past the city's reach is still refused. The customer
 * reads "Comes anywhere in E2E Wholetown" on its card and its page (owner,
 * 10 Nov 2026), the city's name from the payload. And the travel radius
 * takes 45 km now (the 30 km top was lifted).
 *
 * The city is seeded far from Chennai, so no other spec's Doorstep list
 * gains this garage. The rule itself is unit-tested in
 * apps/server/src/lib/cities.test.ts and the SQL in vendors.predicates.test.ts.
 */
import type { Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { CITIES } from '../../support/seed-ids'

const C = CITIES

/** Where the customer is, as the location store keeps a phone fix. */
async function standAt(page: Page, point: { lat: number; lng: number }) {
  // Registered after the fixture's own init script, so it is the one that stands.
  await page.context().addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: {
          location: { ...at, label: 'Here', source: 'gps', updatedAt: Date.now() },
          promptDismissedAt: Date.now(),
        },
        version: 0,
      })
    )
  }, { lat: point.lat, lng: point.lng })
}

const doorstepList = async (request: import('@playwright/test').APIRequestContext, point: { lat: number; lng: number }) => {
  const res = await request.get(`${API}/api/v1/vendors`, {
    params: { lat: String(point.lat), lng: String(point.lng), bookingType: 'doorstep', limit: '50' },
  })
  expect(res.status()).toBe(200)
  return (await res.json()).data.items as Array<{
    id: string
    doorstepWholeCity?: boolean
    reachCity?: { name: string } | null
  }>
}

test.describe('Doorstep all over the city @p0', () => {
  test('listed for an address 40 km away inside the city, not for one past it', async ({ request }) => {
    const home = await doorstepList(request, C.wholeCustomer.home)
    expect(home.find((item) => item.id === C.whole.id)).toMatchObject({
      doorstepWholeCity: true,
      reachCity: { name: C.wholeTown.name },
    })
    const away = await doorstepList(request, C.wholeCustomer.away)
    expect(away.map((item) => item.id)).not.toContain(C.whole.id)
  })

  test('the booking’s range check takes the address inside the city and refuses the one outside', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    })
    // A fresh login: CITIES.wholeCustomer belongs to this file alone.
    const customer = await loginViaApi(C.wholeCustomer.phone)
    try {
      const attempt = (addressId: string) =>
        customer.post(`${API}/api/v1/booking-intents`, {
          data: {
            vendorId: C.whole.id,
            serviceIds: [C.whole.serviceId],
            vehicleId: C.wholeCustomer.vehicleId,
            bookingType: 'doorstep',
            addressId,
            // Off the 30-minute grid: past the range check, the slot check
            // refuses it, so nothing is booked.
            scheduledAt: new Date(`${tomorrow}T10:07:00+05:30`).toISOString(),
          },
        })
      const inside = await attempt(C.wholeCustomer.home.id)
      expect(inside.status()).toBe(400)
      expect((await inside.json()).code).toBe('SLOT_UNAVAILABLE')

      const outside = await attempt(C.wholeCustomer.away.id)
      expect(outside.status()).toBe(400)
      expect(await outside.json()).toEqual({
        success: false,
        message: 'This garage does not travel to that address',
        code: 'OUTSIDE_DOORSTEP_RADIUS',
      })
    } finally {
      await customer.dispose()
    }
  })

  test('the customer reads “Comes anywhere in E2E Wholetown” on its Doorstep card and on its page', async ({ page }) => {
    const line = `Comes anywhere in ${C.wholeTown.name}`
    await standAt(page, C.wholeCustomer.home)
    await page.goto('/garages?mode=doorstep')
    const card = page.locator('[data-garage-card]').filter({ hasText: C.whole.name })
    await expect(card.getByText(line, { exact: true })).toBeVisible()

    await card.getByRole('link').first().click()
    await expect(page).toHaveURL(new RegExp(`/garage/${C.whole.id}`))
    await expect(page.getByRole('heading', { level: 1, name: C.whole.name })).toBeVisible()
    await expect(page.getByText(line, { exact: true })).toBeVisible()
  })

  test('the garage saves a 45 km radius (the 30 km top is gone) and sees its city', async () => {
    const owner = await loginViaApi(C.whole.ownerPhone, 'vendor')
    try {
      const saved = await owner.patch(`${API}/api/v1/vendors/me/job-types`, { data: { doorstepRadiusKm: 45 } })
      expect(saved.status()).toBe(200)
      expect((await saved.json()).data).toMatchObject({
        doorstepRadiusKm: 45,
        doorstepWholeCity: true,
        garageCity: { name: C.wholeTown.name, reachKm: C.wholeTown.reachKm },
      })
      const tooFar = await owner.patch(`${API}/api/v1/vendors/me/job-types`, { data: { doorstepRadiusKm: 450 } })
      expect(tooFar.status()).toBe(400)
      expect((await tooFar.json()).success).toBe(false)
      // Back to what the seed set, so a rerun starts the same.
      await owner.patch(`${API}/api/v1/vendors/me/job-types`, { data: { doorstepRadiusKm: C.whole.radiusKm } })
    } finally {
      await owner.dispose()
    }
  })
})
