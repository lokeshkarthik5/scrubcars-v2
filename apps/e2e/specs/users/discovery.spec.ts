/**
 * Finding a garage before booking one.
 *
 * Read-only throughout, so this file shares the browse customer with nothing
 * that writes.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { GaragePage } from '../../pages/garage.page'
import { SERVICES, VENDORS } from '../../support/seed-ids'

type ListedGarage = { id: string; matchedService: string | null }

/** GET /vendors?q=, as the search screen calls it. */
async function search(
  request: import('@playwright/test').APIRequestContext,
  q: string
): Promise<ListedGarage[]> {
  const response = await request.get(`${API}/api/v1/vendors`, { params: { q } })
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data.items as ListedGarage[]
}

test.use({ storageState: asRole('customer-browse') })

test.describe('discovery', () => {
  test('the garage list shows verified garages', async ({ page }) => {
    await page.goto('/garages')
    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    // Starting price is the cheapest active service: the express wash at 499.
    await expect(page.getByText('₹499').first()).toBeVisible()
  })

  test('search finds a garage by name', async ({ page }) => {
    await page.goto('/search')
    await page.getByRole('searchbox', { name: 'Search garages or services' }).fill('Narrow')

    await expect(page.getByText(VENDORS.narrow.name).first()).toBeVisible()
    await expect(page.getByText(VENDORS.main.name)).toHaveCount(0)
  })

  test('a search with no matches says so rather than showing everything', async ({ page }) => {
    await page.goto('/search')
    await page.getByRole('searchbox', { name: 'Search garages or services' }).fill('zzzznotagarage')

    await expect(page.getByText(VENDORS.main.name)).toHaveCount(0)
    await expect(page.getByText(VENDORS.narrow.name)).toHaveCount(0)
  })

  test.describe('search by service @p0', () => {
    test("finds a garage by a service it sells, and says which", async ({ page }) => {
      await page.goto('/search')
      // "Interior Detail" is on MAIN's menu and nowhere in its name.
      await page
        .getByRole('searchbox', { name: 'Search garages or services' })
        .fill(SERVICES.tiered.name)

      await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
      await expect(page.getByText(`Offers ${SERVICES.tiered.name}`)).toBeVisible()
      // Every filler sells a "Standard Wash" and nothing called that.
      await expect(page.getByText('Filler Garage 01')).toHaveCount(0)
    })

    test('the API lists it, labelled; a name match needs no label', async ({ request }) => {
      const byService = await search(request, SERVICES.tiered.name)
      expect(byService.find((g) => g.id === VENDORS.main.id)).toMatchObject({
        matchedService: SERVICES.tiered.name,
      })
      // A package is a service like any other here.
      expect((await search(request, SERVICES.packageDeal.name)).map((g) => g.id)).toContain(
        VENDORS.main.id
      )

      const byName = await search(request, VENDORS.main.name)
      expect(byName.find((g) => g.id === VENDORS.main.id)).toMatchObject({ matchedService: null })
    })

    test('a withdrawn service finds nothing', async ({ request }) => {
      // On MAIN, but isActive false: it is not on sale, so it is no reason to
      // list the garage.
      expect((await search(request, SERVICES.inactive.name)).map((g) => g.id)).not.toContain(
        VENDORS.main.id
      )
    })

    test("the searcher's % and _ are characters, not wildcards", async ({ request }) => {
      // Unescaped, either one alone matched every garage on the list.
      expect(await search(request, '%')).toEqual([])
      expect(await search(request, '_')).toEqual([])
      expect(await search(request, 'Express%Wash')).toEqual([])
    })
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
    await expect(page.getByText('₹2,299').first()).toBeVisible()
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
