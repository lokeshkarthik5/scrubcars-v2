import { test, expect, asRole } from '../../support/fixtures'

/** apps/users/components/providers/signed-in-landing.ts — SIGNED_IN_HINT_KEY */
const SIGNED_IN_HINT_KEY = 'detlio:signed-in'

test.describe('homepage @p0', () => {
  test('a guest gets the homepage rather than a redirect', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Placeholder reviews, videos and before/after photos are for preview
    // builds only; a production build must never show one.
    await expect(page.getByText('Sample', { exact: true })).toHaveCount(0)

    // "Book a service" means the list of garages, which lives at /garages.
    await page
      .getByRole('link', { name: /Book a service/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/garages$/)
    await expect(
      page.getByRole('heading', { name: 'Nearby Garages' })
    ).toBeVisible()
  })

  test('a stale signed-in hint costs a guest one detour, then clears', async ({
    page,
  }) => {
    // Any page will do to reach the origin's storage. Wait for it to render:
    // AppProvider renders /garages only once the session has resolved, and
    // the hint write must land after its own clear, not race it. /garages
    // rather than /home, whose content is about to change.
    await page.goto('/garages')
    await expect(
      page.getByRole('heading', { name: 'Nearby Garages' })
    ).toBeVisible()
    await page.evaluate(
      (key) => window.localStorage.setItem(key, '1'),
      SIGNED_IN_HINT_KEY
    )

    await page.goto('/')
    // The hint only ever points at /home, which is public — never at a
    // guarded route that would strand a signed-out visitor on /login. The
    // hub sends a signed-out visitor on to the list of garages.
    await expect(page).toHaveURL(/\/(home|garages)$/)
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          SIGNED_IN_HINT_KEY
        )
      )
      .toBeNull()

    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test.describe('signed in', () => {
    test.use({ storageState: asRole('customer-book') })

    test('a customer is sent on to the app', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL(/\/home/)
    })
  })
})
