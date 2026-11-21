/**
 * Service categories (0080) for customers: the garages list's Filter sheet
 * has General service, Repairs and Dent & paint tiles (before Others, names
 * on two lines rather than cut short), and with Repairs picked the filter
 * button names it and the list shows the garages that do repairs, each
 * card naming its categories in the new words.
 *
 * As a guest, on SERVICE_CATEGORIES' garage (seeds/e2e-ids.ts), about 5.5 km
 * from ORIGIN. Nothing is booked or changed.
 */
import { test, expect } from '../../support/fixtures'
import { SERVICE_CATEGORIES as C } from '../../support/seed-ids'

test.describe('service categories in the garage list @p0', () => {
  test('the Repairs tile filters the list, and the card names the new categories', async ({ page }) => {
    await page.goto('/garages')
    await page.getByRole('button', { name: /^Service: All services/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Choose a service' })
    await expect(sheet).toBeVisible()

    // Ten tiles, the three new ones after Scratch removal and before Others.
    // Each name may end in its count, "2" or "2+" when more garages may follow.
    const tiles = sheet.locator('button[aria-pressed]')
    await expect(tiles).toHaveCount(10)
    const names = (await tiles.allTextContents()).map((text) => text.replace(/\d+\+?$/, '').trim())
    expect(names.slice(-5)).toEqual(['Scratch removal', 'General service', 'Repairs', 'Dent & paint', 'Others'])
    // "General service" takes two lines in its tile rather than being cut short.
    const general = sheet.getByRole('button', { name: /^General service/ })
    await expect(general.locator('.line-clamp-2')).toHaveText('General service')

    const asked = page.waitForRequest(
      (r) => r.url().includes('/api/v1/vendors?') && r.url().includes('category=repairs')
    )
    await sheet.getByRole('button', { name: /^Repairs/ }).click()
    await asked
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /^Service: Repairs/ })).toBeVisible()

    const card = page.locator('[data-garage-card]').filter({
      has: page.getByRole('heading', { name: C.garage.name, exact: true }),
    })
    await card.first().scrollIntoViewIfNeeded()
    await expect(card.first()).toContainText('General service, Repairs')
  })

  test("the garage page lists its services under category headings", async ({ page }) => {
    await page.goto(`/garage/${C.garage.id}`)
    const headings = page.getByTestId('service-category-heading')
    // In the order used everywhere: the mechanical work, then Others.
    await expect(headings).toHaveCount(3)
    await expect(headings.nth(0)).toContainText('General service')
    await expect(headings.nth(1)).toContainText('Repairs')
    await expect(headings.nth(2)).toContainText('Others')
  })
})
