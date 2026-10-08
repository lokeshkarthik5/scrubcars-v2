/**
 * The garage portal's front door: the customer app's glass sign-in stage,
 * worded for a garage.
 *
 * Signed out, so no storageState. The full OTP sign-in is driven by
 * onboarding.spec.ts; this only pins what the screen says and that it is the
 * staged one, with the photo behind the card.
 */
import { test, expect } from '../../support/fixtures'

test.describe('garage portal login @p0', () => {
  test('is the glass stage, worded for garages', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Detlio for Partners' })).toBeVisible()
    await expect(
      page.getByText('Log in with the number registered for your garage.')
    ).toBeVisible()
    // The staging photo behind the card — the plain layout has none.
    await expect(page.locator('img[src*="onboarding-car"]')).toHaveCount(1)

    // Still the one phone field, and the button waits for a full number.
    const send = page.getByRole('button', { name: /Send OTP/i })
    await expect(send).toBeDisabled()
    await page.locator('#sc-phone').fill('98765')
    await expect(send).toBeDisabled()
    await page.locator('#sc-phone').fill('9876543210')
    await expect(send).toBeEnabled()
  })

  test('links only the Privacy Policy, on detlio.com', async ({ page }) => {
    // Not the customer Terms: they are not a garage's agreement. Not followed
    // either: it is the production site, which tests never reach.
    await page.goto('/login')
    const privacy = page.getByRole('link', { name: 'Privacy Policy', exact: true })
    await expect(privacy).toHaveAttribute('href', 'https://detlio.com/privacy')
    await expect(privacy).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('link', { name: 'Terms', exact: true })).toHaveCount(0)
  })
})
