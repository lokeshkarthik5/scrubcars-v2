/**
 * Finding a garage before booking one.
 *
 * Read-only throughout, so this file shares the browse customer with nothing
 * that writes.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { GaragePage } from '../../pages/garage.page'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-browse') })

test.describe('discovery', () => {
  test('the home list shows verified garages', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    // Starting price is the cheapest active service: the express wash at 499.
    await expect(page.getByText('₹499').first()).toBeVisible()
  })

  test('search finds a garage by name', async ({ page }) => {
    await page.goto('/search')
    await page.getByPlaceholder('Search garages, services...').fill('Narrow')

    await expect(page.getByText(VENDORS.narrow.name).first()).toBeVisible()
    await expect(page.getByText(VENDORS.main.name)).toHaveCount(0)
  })

  test('a search with no matches says so rather than showing everything', async ({ page }) => {
    await page.goto('/search')
    await page.getByPlaceholder('Search garages, services...').fill('zzzznotagarage')

    await expect(page.getByText(VENDORS.main.name)).toHaveCount(0)
    await expect(page.getByText(VENDORS.narrow.name)).toHaveCount(0)
  })

  test('a garage page shows services, photos and reviews', async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)

    await expect(page.getByText(SERVICES.wash.name).first()).toBeVisible()
    // Withdrawn from sale — it must never reach a customer.
    await expect(page.getByText(SERVICES.inactive.name)).toHaveCount(0)

    await garage.openTab('Photos')
    await expect(garage.tab('Photos')).toHaveAttribute('aria-selected', 'true')

    await garage.openTab('Reviews')
    await expect(garage.tab('Reviews')).toHaveAttribute('aria-selected', 'true')
    // The seed leaves one 4-star review on this garage.
    await expect(page.getByText('Solid work, seeded.')).toBeVisible()
  })

  test('a package advertises the saving over buying its parts', async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)

    // 499 + 1999 = 2498 bought separately, 2299 as a package.
    await expect(page.getByText(SERVICES.packageDeal.name).first()).toBeVisible()
    await expect(page.getByText('₹2299').first()).toBeVisible()
    await expect(page.getByText(/Save ₹199/).first()).toBeVisible()
  })

  test('the details sheet can add and remove a service', async ({ page }) => {
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)

    await garage.openDetails(SERVICES.wash.name)
    await garage.detailsCta().click()

    await expect(garage.toggle(SERVICES.wash.name)).toHaveAttribute('aria-pressed', 'true')
  })
})
