/**
 * The garage list at /garages, and /home while the new Home is off.
 *
 * The list moved from /home to /garages with no change a customer can see, and
 * every link that means "the list of garages" now opens /garages. /home keeps
 * rendering the same list until the new Home ships behind NEXT_PUBLIC_HOME_HUB,
 * which apps/e2e/.env.e2e (and CI's build) keep off.
 *
 * Read-only throughout, so it shares the browse customer with discovery.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { VENDORS } from '../../support/seed-ids'

/** Never a listed garage: the garage page's "not listed" state. */
const UNLISTED_GARAGE = '00000000-0000-4000-8000-999999999999'

/** What makes the screen the garage list, checked the same way on both routes. */
async function expectGarageList(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Nearby Garages' })
  ).toBeVisible()
  await expect(
    page.getByRole('radiogroup', { name: 'Service mode' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Search garages or services' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'All', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('heading', { name: VENDORS.main.name }).first()
  ).toBeVisible()
  // The list is still what Home shows, so the Home tab stays lit on both.
  await expect(
    page.getByRole('link', { name: 'Home', exact: true })
  ).toHaveAttribute('aria-current', 'page')
}

test.describe('garage list @p0', () => {
  test('a guest can browse garages at /garages', async ({ page }) => {
    await page.goto('/garages')

    await expect(page).toHaveURL(/\/garages$/)
    await expectGarageList(page)
    await expect(page).toHaveTitle('Garages · Detlio')
    // This is the URL the homepage's CTAs open, so the one people share: it
    // must carry the site's picture and the large card, which a page's own
    // openGraph/twitter would otherwise drop.
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/opengraph-image\.png/
    )
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      /\/opengraph-image\.png/
    )
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    )
  })

  test('the lit Home tab on /garages keeps the customer on the list', async ({
    page,
  }) => {
    await page.goto('/garages')
    await expectGarageList(page)

    const doorstep = page.getByRole('radio', { name: 'Doorstep' })
    const detailing = page.getByRole('button', {
      name: 'Detailing',
      exact: true,
    })
    await doorstep.click()
    await detailing.click()
    await expect(doorstep).toHaveAttribute('aria-checked', 'true')
    await expect(detailing).toHaveAttribute('aria-pressed', 'true')

    // On /home the lit tab was a tap that went nowhere; on /garages it must
    // be the same, or the customer's mode and category would reset.
    const home = page.getByRole('link', { name: 'Home', exact: true })
    await expect(home).toHaveAttribute('href', '/garages')
    await home.click()
    await expect(page).toHaveURL(/\/garages$/)
    await expect(page).toHaveTitle('Garages · Detlio')
    await expect(doorstep).toHaveAttribute('aria-checked', 'true')
    await expect(detailing).toHaveAttribute('aria-pressed', 'true')
  })

  test('"Find another garage" opens the garage list', async ({ page }) => {
    await page.goto(`/garage/${UNLISTED_GARAGE}`)
    await expect(
      page.getByText("This garage isn't taking bookings on Detlio.")
    ).toBeVisible()

    await page.getByRole('link', { name: 'Find another garage' }).click()
    await expect(page).toHaveURL(/\/garages$/)
    await expectGarageList(page)
  })

  test.describe('signed in', () => {
    test.use({ storageState: asRole('customer-browse') })

    test('/home shows the same list while the new Home is off', async ({
      page,
    }) => {
      await page.goto('/garages')
      await expectGarageList(page)

      await page.goto('/home')
      await expect(page).toHaveURL(/\/home$/)
      await expectGarageList(page)
      // Home keeps the app's own title; only /garages has a page title.
      await expect(page).toHaveTitle('Detlio')
    })
  })
})
