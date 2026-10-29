/**
 * "Never an empty list" (customer reach, 0062), on the garage list: Skip the
 * drive, the "or have it done at home" line, "Can collect your car", the
 * pickup explainer, Doorstep's and Pickup & drop's "Just outside their
 * area", the next tab offered at the bottom of each, km + drive time on every
 * card, and the area sheet behind the list's location button. Plus the API
 * answers they are drawn from (`reach`, `outside`) and GET /zones.
 *
 * The five VENDORS.reach* garages sit around REACH_HERE, far from every
 * other test garage (REACH_PINS in e2e-ids.ts says what each shows from
 * REACH_HERE and REACH_MID). Read-only: nothing here books or changes them.
 */
import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { REACH_HERE, REACH_MID, VENDORS } from '../../support/seed-ids'

type Point = { lat: number; lng: number }

/** Where the customer is, as the location store keeps a phone fix. */
async function standAt(page: Page, point: Point) {
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
  }, point)
}

const tab = (page: Page, name: 'At garage' | 'Doorstep' | 'Pickup & drop') =>
  page.getByRole('radio', { name, exact: true })

const card = (page: Page, name: string) =>
  page.locator('[data-garage-card]').filter({ hasText: name })

async function vendors(request: APIRequestContext, params: Record<string, string | number>) {
  const response = await request.get(`${API}/api/v1/vendors`, { params })
  expect(response.status()).toBe(200)
  return (await response.json()).data as {
    items: Array<{ id: string; distanceKm: number | null; pickupRadiusKm?: number | null }>
    reach: {
      dropin: { count: number; nearestKm: number | null }
      doorstep: { count: number; fromPrice: number | null }
      pickup: { count: number; fromPrice: number | null }
    } | null
    outside: Array<{ id: string; coverKm: number | null; outsideKm: number; distanceKm: number }> | null
  }
}

test.describe('the reach figures, from the API @p0', () => {
  test('a list’s first page says what every tab offers; later pages and searches do not', async ({ request }) => {
    const first = await vendors(request, { ...REACH_HERE, bookingType: 'dropin', limit: 5 })
    expect(first.reach).toEqual({
      dropin: { count: expect.any(Number), nearestKm: expect.any(Number) },
      doorstep: { count: 1, fromPrice: 349 },
      pickup: { count: 1, fromPrice: 499 },
    })
    // reachFar, ~13.9 km north (one decimal, measured on the spheroid).
    expect(first.reach?.dropin.nearestKm).toBeGreaterThanOrEqual(13.5)
    expect(first.reach?.dropin.nearestKm).toBeLessThanOrEqual(14.2)
    // No cut-off (0062): the nearest at-garage garage leads, nearest first.
    expect(first.items[0].id).toBe(VENDORS.reachFar.id)
    expect(first.items[0].pickupRadiusKm).toBe(10)
    expect(first.outside).toBeNull()

    const searched = await vendors(request, { ...REACH_HERE, q: 'Reach' })
    expect(searched.reach).toBeNull()
  })

  test('Doorstep: the garages that come first, then the ones just outside their own reach', async ({ request }) => {
    const doorstep = await vendors(request, { ...REACH_HERE, bookingType: 'doorstep', limit: 50 })
    expect(doorstep.items.map((item) => item.id)).toEqual([VENDORS.reachDoorstep.id])
    expect(doorstep.outside).toEqual([
      expect.objectContaining({ id: VENDORS.reachOutsideDoorstep.id, coverKm: 5, outsideKm: 3.7 }),
    ])
  })

  test('Pickup & drop: the same, by each garage’s pickup radius', async ({ request }) => {
    const pickup = await vendors(request, { ...REACH_HERE, bookingType: 'pickup', limit: 50 })
    expect(pickup.items.map((item) => item.id)).toEqual([VENDORS.reachPickup.id])
    expect(pickup.outside?.map((item) => item.id)).toEqual([VENDORS.reachFar.id, VENDORS.reachOutsidePickup.id])
    expect(pickup.outside?.[0]).toMatchObject({ coverKm: 10, outsideKm: 3.9 })
    expect(pickup.outside?.[1]).toMatchObject({ coverKm: 8 })
  })

  test('GET /zones: the 25 Chennai areas, priority first, with whether a garage is in each', async ({ request }) => {
    const response = await request.get(`${API}/api/v1/zones`)
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('public')
    const { zones: listed } = (await response.json()).data as {
      zones: Array<{ slug: string; name: string; lat: number; lng: number; priority: boolean; hasGarage: boolean }>
    }
    // Admin's zone spec (specs/admin/coverage-zones.spec.ts) adds and removes
    // its own "E2E Test Zone" (slug e2e-test-zone), maybe while this runs.
    const zones = listed.filter((zone) => !zone.slug.startsWith('e2e-'))
    expect(zones).toHaveLength(25)
    expect(zones.slice(0, 7).every((zone) => zone.priority)).toBe(true)
    expect(zones.filter((zone) => zone.priority).map((zone) => zone.name)).toEqual([
      'Adyar', 'Anna Nagar', 'Guindy', 'Navalur', 'Nungambakkam', 'Sholinganallur', 'T Nagar',
    ])
    // MAIN is ~1.5 km from Egmore's centre.
    expect(zones.find((zone) => zone.slug === 'egmore')?.hasGarage).toBe(true)
    expect(zones.every((zone) => typeof zone.hasGarage === 'boolean')).toBe(true)
  })
})

test.describe('never an empty list, on screen @p0', () => {
  test('far from every garage: Skip the drive, with real counts; a tap switches tab, nothing switches by itself', async ({ page }) => {
    await standAt(page, REACH_HERE)
    await page.goto('/garages')

    const skip = page.getByRole('region', { name: 'The nearest garage is 14 km away' })
    await expect(skip).toBeVisible()
    await expect(skip.getByRole('button', { name: /At your door\s*1 garage can come to your door · from ₹349/ })).toBeVisible()
    await expect(skip.getByRole('button', { name: /We collect your car\s*1 garage picks up and drops back/ })).toBeVisible()
    // The garages to drive to are still listed, under it, with km + drive time.
    await expect(page.getByRole('heading', { name: 'Or drive to' })).toBeVisible()
    await expect(card(page, VENDORS.reachFar.name).locator('[data-distance]')).toHaveText(/^1[34]\.\d km · ~(39|40|41) min$/)

    // Shown, and the tab is still At garage.
    await expect(tab(page, 'At garage')).toHaveAttribute('aria-checked', 'true')

    await skip.getByRole('button', { name: /At your door/ }).click()
    await expect(tab(page, 'Doorstep')).toHaveAttribute('aria-checked', 'true')
    await expect(card(page, VENDORS.reachDoorstep.name).first()).toBeVisible()
  })

  test('5–10 km away: the small "at home" line, and "Can collect your car" on a garage whose pickup reaches', async ({ page }) => {
    await standAt(page, REACH_MID)
    await page.goto('/garages')

    const far = card(page, VENDORS.reachFar.name)
    await expect(far.getByText('Can collect your car')).toBeVisible()
    await expect(far.locator('[data-distance]')).toHaveText(/^6\.\d km · ~\d+ min$/)
    await expect(page.getByRole('region', { name: /The nearest garage is/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'or have it done at home' }).click()
    await expect(tab(page, 'Doorstep')).toHaveAttribute('aria-checked', 'true')
  })

  test('Doorstep: just outside their area, with its reach and "See prices"; then Pickup & drop offered at the bottom', async ({ page }) => {
    await standAt(page, REACH_HERE)
    await page.goto('/garages?mode=doorstep')

    await expect(card(page, VENDORS.reachDoorstep.name).first()).toBeVisible()
    const outside = page.getByRole('region', { name: 'Just outside their area' })
    await expect(outside).toBeVisible()
    const garage = outside.locator('[data-just-outside]').filter({ hasText: VENDORS.reachOutsideDoorstep.name })
    await expect(garage.getByText('covers 5 km · 3.7 km outside')).toBeVisible()
    await expect(garage.locator('[data-distance]')).toHaveText(/^8\.\d km · ~\d+ min$/)

    // The next way, at the bottom.
    const next = page.getByRole('button', { name: /We collect your car/ })
    await expect(next).toBeVisible()

    await garage.getByRole('link', { name: `See prices at ${VENDORS.reachOutsideDoorstep.name}` }).click()
    await expect(page).toHaveURL(new RegExp(`/garage/${VENDORS.reachOutsideDoorstep.id}\\?mode=doorstep`))
  })

  test('the bottom of Doorstep switches to Pickup & drop, which explains itself first', async ({ page }) => {
    await standAt(page, REACH_HERE)
    await page.goto('/garages?mode=doorstep')

    await page.getByRole('button', { name: /We collect your car/ }).click()
    await expect(tab(page, 'Pickup & drop')).toHaveAttribute('aria-checked', 'true')

    const explainer = page.getByRole('region', { name: 'They collect, you relax' })
    await expect(explainer).toBeVisible()
    await expect(explainer.getByRole('listitem')).toHaveCount(6)
    await expect(explainer.getByText('Garage responsible for your car')).toBeVisible()
    await expect(explainer.getByText('Handover codes both ways')).toBeVisible()

    await expect(card(page, VENDORS.reachPickup.name).first()).toBeVisible()
    const outside = page.getByRole('region', { name: 'Just outside their area' })
    await expect(outside.getByText('covers 10 km · 3.9 km outside')).toBeVisible()
  })

  test('the bottom of At garage offers "Have it done at home" once the list ends', async ({ page }) => {
    await standAt(page, REACH_HERE)
    await page.goto('/garages')

    const atHome = page.getByRole('button', { name: /Have it done at home/ })
    // Every garage is listed (no cut-off), page after page, so scroll to the end.
    await expect(async () => {
      await page.mouse.wheel(0, 20_000)
      await expect(atHome).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    await atHome.click()
    await expect(tab(page, 'Doorstep')).toHaveAttribute('aria-checked', 'true')
  })

  test('the list’s location button opens the area sheet: an area in one tap, no permission asked', async ({ page }) => {
    await page.goto('/garages')
    await page.getByRole('button', { name: 'Choose location' }).click()

    const sheet = page.getByRole('dialog', { name: "Where's your car?" })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Near me' })).toBeVisible()
    await sheet.getByRole('searchbox', { name: 'Search areas' }).fill('anna')
    await expect(sheet.getByRole('button', { name: 'Anna Nagar' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Adyar' })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Anna Nagar' }).click()

    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: 'Choose location' })).toContainText('Anna Nagar')
    await expect(page.getByText('Nearest first from Anna Nagar')).toBeVisible()
    // From an area's centre, every distance is approximate.
    await expect(page.locator('[data-distance]').first()).toHaveText(/^~[\d.]+ (km|m) · ~/)
  })
})
