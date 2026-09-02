import { test, expect, asRole } from '../../support/fixtures'
import { VENDORS, SERVICES } from '../../support/seed-ids'

test.describe('harness smoke @p0', () => {
  test('a guest can browse the seeded garage', async ({ page }) => {
    await page.goto(`/garage/${VENDORS.main.id}`)

    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()

    // Withdrawn from sale — it must never reach a customer.
    await expect(page.getByText(SERVICES.inactive.name)).toHaveCount(0)
  })

  test.describe('signed in', () => {
    test.use({ storageState: asRole('customer-book') })

    test('the saved session is live', async ({ page }) => {
      await page.goto('/bookings')
      // Signed out, app-provider would bounce this route to /login.
      await expect(page).toHaveURL(/\/bookings/)
    })
  })
})
