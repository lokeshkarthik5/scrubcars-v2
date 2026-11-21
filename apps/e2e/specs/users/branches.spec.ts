/**
 * Branches for customers (0081, mockups 2-branches-5 and -6), on the "E2E
 * Shine Spa" group (BRANCH_GROUPS): three live branches and T. Nagar, added
 * today and not shown.
 *
 *   - GET /vendors/:id carries the other live branches only (never T.
 *     Nagar), by area with their pins; the list's cards carry "1 of 3".
 *   - The garage page's "Also at": the other live branches with how far
 *     each is from the customer; a tap opens that branch's page.
 *   - The list's card says "1 of 3 E2E Shine Spa branches".
 *
 * Read-only. The customer stands at Anna Nagar's pin, far from every other
 * fixture, so only these garages are near.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { BRANCH_GROUPS } from '../../support/seed-ids'

const B = BRANCH_GROUPS

/** Where the customer is, as the location store keeps a phone fix. */
async function standAt(page: Page, point: { lat: number; lng: number }) {
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

test.describe('branches, from the API @p0', () => {
  test('the garage page carries the other live branches only', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/vendors/${B.vel.id}`)
    expect(res.status()).toBe(200)
    const branches = (await res.json()).data.branches as Array<{ id: string; name: string; lat: number; lng: number }>
    expect(branches).toEqual([
      { id: B.anna.id, name: B.anna.label, lat: B.anna.pin.lat, lng: B.anna.pin.lng },
      { id: B.omr.id, name: B.omr.label, lat: B.omr.pin.lat, lng: B.omr.pin.lng },
    ])
    // T. Nagar is not live: not here, and its own page is not open.
    expect(JSON.stringify(branches)).not.toContain(B.tnagar.id)
    expect((await request.get(`${API}/api/v1/vendors/${B.tnagar.id}`)).status()).toBe(404)
  })

  test('each card in the list says its group and how many branches are live', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/vendors`, {
      params: { lat: String(B.anna.pin.lat), lng: String(B.anna.pin.lng), bookingType: 'dropin', limit: '50' },
    })
    expect(res.status()).toBe(200)
    const items = (await res.json()).data.items as Array<{ id: string; branchGroup: { name: string; liveCount: number } | null }>
    for (const garage of [B.anna, B.vel, B.omr]) {
      expect(items.find((item) => item.id === garage.id)?.branchGroup).toEqual({ name: B.group.name, liveCount: 3 })
    }
    expect(items.some((item) => item.id === B.tnagar.id)).toBe(false)
  })
})

test.describe('branches, on screen @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('Also at: the other live branches with their distance; a tap opens that branch', async ({ page }) => {
    await standAt(page, B.anna.pin)
    await page.goto(`/garage/${B.vel.id}`)
    await expect(page.getByRole('heading', { level: 1, name: B.vel.name })).toBeVisible()

    const alsoAt = page.getByRole('navigation', { name: 'Also at' })
    const links = alsoAt.getByRole('link')
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toHaveAccessibleName(/^Anna Nagar, ~?[\d.]+ (km|m) away\. Open this branch$/)
    await expect(links.nth(0)).toContainText(/Anna Nagar · ~?[\d.]+ (km|m)/)
    await expect(links.nth(1)).toHaveAccessibleName(/^OMR, ~?[\d.]+ km away\. Open this branch$/)
    await expect(alsoAt).not.toContainText(B.tnagar.label)

    await links.nth(1).click()
    await expect(page).toHaveURL(new RegExp(`/garage/${B.omr.id}`))
    await expect(page.getByRole('heading', { level: 1, name: B.omr.name })).toBeVisible()
    // From OMR: Anna Nagar and Velachery.
    await expect(page.getByRole('navigation', { name: 'Also at' }).getByRole('link')).toHaveCount(2)
    await expect(
      page.getByRole('navigation', { name: 'Also at' }).getByRole('link', { name: /^Velachery, / })
    ).toBeVisible()
  })

  test('the list: each branch its own card, with “1 of 3 E2E Shine Spa branches”', async ({ page }) => {
    await standAt(page, B.anna.pin)
    await page.goto('/garages')
    for (const garage of [B.anna, B.vel, B.omr]) {
      const card = page.locator(`[data-vt-card="${garage.id}"]`)
      await expect(card).toContainText(`1 of 3 ${B.group.name} branches`)
    }
    await expect(page.locator(`[data-vt-card="${B.tnagar.id}"]`)).toHaveCount(0)
  })
})
