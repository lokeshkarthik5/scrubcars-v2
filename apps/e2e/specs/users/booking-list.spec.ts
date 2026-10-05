/**
 * The bookings list.
 *
 * Read-only, and pointed at the review customer whose fixture bookings are
 * both completed and therefore not mutated by anything else.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-review') })

test.describe('bookings list', () => {
  test('past jobs are listed with their garage and service', async ({ page }) => {
    // Both are completed, so they are under Past; the list opens on Upcoming.
    await page.goto('/bookings?tab=past')

    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
  })

  test('a booking opens its own page', async ({ page }) => {
    await page.goto(`/bookings/${BOOKINGS.reviewable}`)

    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
    // Completed jobs show what was paid, not a payment prompt.
    await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0)
  })
})
