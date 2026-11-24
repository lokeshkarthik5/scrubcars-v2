/**
 * The garage list at /garages.
 *
 * The list moved from /home to /garages with no change a customer can see, and
 * every link that means "the list of garages" now opens /garages. With the new
 * Home on (NEXT_PUBLIC_HOME_HUB, on in apps/e2e/.env.e2e and CI's build), /home
 * is the hub and the list is only here; the Home tab goes back to the hub.
 * With the flag off, /home renders this same list (one component for both
 * routes, app/home/page.tsx), which the suite cannot see: the flag is baked
 * into the build.
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
  // The service filter is one button now (customer UI round): every service
  // until one is chosen in its sheet (garage-filters.spec.ts).
  await expect(
    page.getByRole('button', { name: /^Service: All services/ })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: VENDORS.main.name }).first()
  ).toBeVisible()
  // Home is the hub now, so the Home tab goes back to the hub. Whether Home
  // or the + is lit here depends on who is looking: see expectHomeLit.
  const home = page.getByRole('link', { name: 'Home', exact: true })
  await expect(home).toHaveAttribute('href', '/home')
}

/**
 * The list lights Home for a visitor, whom /home sends here, so it is their
 * Home; and the + for a signed-in customer, whose Home is the hub: the list
 * is the +'s own page (lib/hub-nav.ts). One or the other, never both.
 */
async function expectHomeLit(page: Page, lit: boolean) {
  const home = page.getByRole('link', { name: 'Home', exact: true })
  const plus = page.getByRole('link', { name: 'New booking' })
  if (lit) {
    await expect(home).toHaveAttribute('aria-current', 'page')
    await expect(plus).not.toHaveAttribute('aria-current', 'page')
  } else {
    await expect(home).not.toHaveAttribute('aria-current', 'page')
    await expect(plus).toHaveAttribute('aria-current', 'page')
  }
}

test.describe('garage list @p0', () => {
  test('a guest can browse garages at /garages', async ({ page }) => {
    await page.goto('/garages')

    await expect(page).toHaveURL(/\/garages$/)
    await expectGarageList(page)
    await expectHomeLit(page, true)
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

  test('a link can open the list on Doorstep', async ({ page }) => {
    // Home's Book a wash, for a car last washed at the door.
    await page.goto('/garages?mode=doorstep')
    await expect(page.getByRole('radio', { name: 'Doorstep' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
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

    test('the Home tab on /garages goes back to the hub', async ({ page }) => {
      await page.goto('/garages')
      await expectGarageList(page)
      await expectHomeLit(page, false)

      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await expect(page).toHaveURL(/\/home$/)
      await expect(
        page.getByRole('region', { name: 'Your car', exact: true })
      ).toBeVisible()
      // Home keeps the app's own title; only /garages has a page title.
      await expect(page).toHaveTitle('Detlio')
    })
  })
})
