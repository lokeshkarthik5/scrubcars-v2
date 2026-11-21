/**
 * Google rating for new garages and the d. mark (21 Nov 2026). A garage
 * linked to its Google listing with fewer than 5 counted Detlio reviews
 * shows Google's rating on its card and in its page's header, always with
 * the words "Google Maps", and its Reviews tab says Detlio's reviews come
 * only from bookings; one read from Google over 30 days ago shows nothing of
 * Google's; from 5 Detlio reviews Detlio's own rating (the d. mark) is the
 * main one and Google's is only the Reviews tab's "Also" line. The map's
 * payload never carries Google's rating, and nothing links to Google.
 *
 * Read-only: GOOGLE_RATINGS' garages, signed out.
 */
import type { Page } from '@playwright/test'
import { request } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import { GOOGLE_RATINGS } from '../../support/seed-ids'

const G = GOOGLE_RATINGS

/** Stands the customer at the garages' pin, so the list opens on them. */
async function standAtGarages(page: Page) {
  await page.context().addInitScript((at) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: {
          location: { ...at, label: 'Home', source: 'gps', updatedAt: Date.now() },
          promptDismissedAt: Date.now(),
        },
        version: 0,
      })
    )
  }, G.pin)
}

/** A garage's card in the list, by its heading. */
const card = (page: Page, name: string) =>
  page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) })

test.describe('Google rating for new garages @p0', () => {
  test('the list: Google’s rating with Google Maps on a new linked garage, the d. on a rated one', async ({ page }) => {
    await standAtGarages(page)
    await page.goto('/garages')

    const linked = card(page, G.newLinked.name)
    await expect(linked).toBeVisible()
    await expect(linked.getByText('Google rating 4.6, 312 reviews, Google Maps.')).toBeAttached()
    await expect(linked.getByText('Google Maps', { exact: true })).toBeVisible()
    await expect(linked.getByText('312 reviews', { exact: true })).toBeVisible()
    // Still new on Detlio.
    await expect(linked.getByText('New', { exact: true })).toBeVisible()

    const rated = card(page, G.rated.name)
    await expect(rated).toBeVisible()
    await expect(rated.getByRole('img', { name: 'Detlio rating 4.8', includeHidden: true })).toBeAttached()
    await expect(rated.getByText('Google Maps', { exact: true })).toHaveCount(0)

    // Read from Google 40 days ago: past Google's 30 days, nothing of Google's.
    const stale = card(page, G.stale.name)
    await expect(stale).toBeVisible()
    await expect(stale.getByText('Google Maps', { exact: true })).toHaveCount(0)
    await expect(stale.getByText('New on Detlio.')).toBeAttached()

    // No link to Google anywhere.
    await expect(page.locator('a[href*="google."]')).toHaveCount(0)
  })

  test('the garage page: G 4.6 (312 reviews) Google Maps, and the Reviews tab says where Detlio’s reviews come from', async ({
    page,
  }) => {
    await page.goto(`/garage/${G.newLinked.id}`)
    await expect(page.getByRole('heading', { name: G.newLinked.name, exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Google rating' }).first()).toBeVisible()
    await expect(page.getByText('(312 reviews)')).toBeVisible()
    await expect(page.getByText('Google Maps', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('New on Detlio', { exact: true })).toHaveCount(0)

    // The tab shows with no Detlio review yet.
    await page.getByRole('tab', { name: 'Reviews' }).click()
    const panel = page.getByRole('tabpanel')
    await expect(panel.getByText('New on Detlio', { exact: true })).toBeVisible()
    await expect(panel.getByText('No Detlio reviews yet')).toBeVisible()
    await expect(panel.getByText('4.6', { exact: true })).toBeVisible()
    await expect(panel.getByText('Google Maps', { exact: true })).toBeVisible()
    await expect(panel.getByText('Reviews here come only from customers who booked on Detlio.')).toBeVisible()
    await expect(panel.getByText('No reviews yet.')).toHaveCount(0)
    await expect(page.locator('a[href*="google."]')).toHaveCount(0)
  })

  test('5 Detlio reviews: the d. leads, Google’s is only the quiet Also line', async ({ page }) => {
    await page.goto(`/garage/${G.rated.id}`)
    await expect(page.getByRole('heading', { name: G.rated.name, exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Detlio rating 4.8' }).first()).toBeVisible()
    await expect(page.getByText('(5 reviews)')).toBeVisible()
    // The header is Detlio's only.
    await expect(page.getByText('(186 reviews)')).toHaveCount(0)

    await page.getByRole('tab', { name: /^Reviews/ }).click()
    const panel = page.getByRole('tabpanel')
    await expect(panel.getByText(/from real Detlio bookings/)).toBeVisible()
    await expect(panel.getByText('Also', { exact: true })).toBeVisible()
    await expect(panel.getByText('(186 reviews)')).toBeVisible()
    await expect(panel.getByText('Google Maps', { exact: true })).toBeVisible()
    // Each customer's own stars stay stars.
    await expect(panel.getByText('Gratings seeded 1.')).toBeVisible()
  })

  test('a stale Google read shows nothing of Google’s on the page', async ({ page }) => {
    await page.goto(`/garage/${G.stale.id}`)
    await expect(page.getByRole('heading', { name: G.stale.name, exact: true })).toBeVisible()
    await expect(page.getByText('New on Detlio', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Google Maps', { exact: true })).toHaveCount(0)
    // No Detlio review and no Google rating: no Reviews tab, as before.
    await expect(page.getByRole('tab', { name: /^Reviews/ })).toHaveCount(0)
  })
})

test.describe('Google rating on the API', () => {
  test('the list carries it while it is the main one; the map’s payload never does', async () => {
    const guest = await request.newContext()
    const params = { lat: String(G.pin.lat), lng: String(G.pin.lng), includeUnlocated: 'false', limit: '10' }
    const list = await guest.get(`${API}/api/v1/vendors`, { params })
    expect(list.status()).toBe(200)
    const items = (await list.json()).data.items as Array<{ id: string; google: unknown; reviewCount: number }>
    const byId = new Map(items.map((item) => [item.id, item]))
    expect(byId.get(G.newLinked.id)?.google).toEqual({ rating: 4.6, reviewCount: 312 })
    expect(byId.get(G.rated.id)?.google).toBeNull()
    expect(byId.get(G.stale.id)?.google).toBeNull()

    const map = await guest.get(`${API}/api/v1/vendors`, { params: { ...params, map: 'true' } })
    const mapped = (await map.json()).data.items as Array<{ id: string; google: unknown }>
    expect(mapped.some((item) => item.id === G.newLinked.id)).toBe(true)
    expect(mapped.every((item) => item.google === null)).toBe(true)

    // The garage page carries it whatever the count, for the Also line.
    const page = await guest.get(`${API}/api/v1/vendors/${G.rated.id}`)
    expect((await page.json()).data.google).toEqual({ rating: 4.4, reviewCount: 186 })
  })
})
