/**
 * The garage list's controls in the customer UI round (Nov 2026, §3): one
 * service button that opens a glass sheet of services (a tap applies the
 * service and closes the sheet), and the "Next free" row on a card, whose
 * time opens checkout with that time already chosen (`slot`).
 *
 * As a guest: browsing and checkout both need no account. Nothing is booked.
 * Silver+ is covered with the tiers it filters by (journeys/tiers-journey).
 */
import { test, expect } from '../../support/fixtures'
import { CheckoutPage } from '../../pages/checkout.page'
import { VENDORS } from '../../support/seed-ids'

test.describe('garage list filters @p0', () => {
  test('the filter sheet applies a service and closes', async ({ page }) => {
    await page.goto('/garages')
    const filter = page.getByRole('button', { name: /^Service: All services/ })
    await expect(filter).toBeVisible()

    await filter.click()
    const sheet = page.getByRole('dialog', { name: 'Choose a service' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: /^All services/ })).toHaveAttribute('aria-pressed', 'true')

    // The list is asked again for that service, and the sheet goes.
    const asked = page.waitForRequest(
      (r) => r.url().includes('/api/v1/vendors?') && r.url().includes('category=car_wash')
    )
    await sheet.getByRole('button', { name: /^Car wash/ }).click()
    await asked
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /^Service: Car wash/ })).toBeVisible()
    // A garage that washes cars is still listed.
    await expect(page.getByRole('heading', { name: VENDORS.main.name }).first()).toBeVisible()

    // And back to every service.
    await page.getByRole('button', { name: /^Service: Car wash/ }).click()
    await page.getByRole('dialog', { name: 'Choose a service' }).getByRole('button', { name: /^All services/ }).click()
    await expect(page.getByRole('button', { name: /^Service: All services/ })).toBeVisible()
  })

  test("a card's next free time opens checkout with that time chosen", async ({ page }) => {
    await page.goto('/garages')
    const card = page.locator('[data-garage-card]').filter({
      has: page.getByRole('heading', { name: VENDORS.main.name, exact: true }),
    })
    await card.first().scrollIntoViewIfNeeded()
    await expect(card.first().getByText('Next free')).toBeVisible()

    const time = card.first().locator('a[data-slot]').first()
    const label = (await time.textContent())?.trim() ?? ''
    expect(label).toMatch(/^\d{1,2}:\d{2} (am|pm)$/)
    await time.click()

    await expect(page).toHaveURL(new RegExp(`/book/${VENDORS.main.id}\\?.*slot=`))
    const checkout = new CheckoutPage(page)
    await checkout.showAllTimes()
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
})
