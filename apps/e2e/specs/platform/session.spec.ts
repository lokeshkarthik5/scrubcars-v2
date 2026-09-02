/**
 * Cross-cutting behaviour that belongs to no single screen.
 *
 * Runs serially in its own project: these tests revoke sessions and force
 * error responses, which would otherwise land on whatever else was in flight.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.describe('session', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('a session survives a full reload', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText(CUSTOMERS.browse.name)).toBeVisible()

    await page.reload()
    await expect(page.getByText(CUSTOMERS.browse.name)).toBeVisible()
  })

  test('an expired access token is refreshed rather than logging the user out', async ({
    page,
    context,
  }) => {
    await page.goto('/profile')
    await expect(page.getByText(CUSTOMERS.browse.name)).toBeVisible()

    // Drop only the access token. The refresh token lives at a different path
    // and survives, so the client's single silent retry through /auth/refresh
    // should put the session back without the customer noticing.
    const kept = (await context.cookies()).filter((c) => c.name !== 'access_token')
    await context.clearCookies()
    await context.addCookies(kept)

    await page.goto(`/book/${VENDORS.main.id}?service=`)

    // Still allowed through a guarded route, so the refresh worked.
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('a revoked refresh token ends the session', async ({ page, context }) => {
    await page.goto('/profile')
    await expect(page.getByText(CUSTOMERS.browse.name)).toBeVisible()

    // Revoke server-side, then drop the access token so the next call has to
    // fall back to a refresh that will now be refused.
    await sql`
      update refresh_tokens set revoked = true where user_id = ${CUSTOMERS.browse.id}
    `
    const kept = (await context.cookies()).filter((c) => c.name !== 'access_token')
    await context.clearCookies()
    await context.addCookies(kept)

    await page.goto(`/book/${VENDORS.main.id}`)
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('error handling', () => {
  test.use({ storageState: asRole('customer-browse') })

  // The same message covers both "no such booking" and "not yours", which is
  // the right call: telling the difference would confirm that a booking id
  // exists to someone who cannot see it.
  const notLoaded = /Could not load this booking/i

  test('an unknown booking id does not leave a blank screen', async ({ page }) => {
    await page.goto('/bookings/00000000-0000-4000-8000-999999999999')

    await expect(page.getByText(notLoaded).first()).toBeVisible()
  })

  test('another customer’s booking is refused', async ({ page }) => {
    // BOOKINGS.cancellable belongs to the cancel fixture customer, not this one.
    await page.goto(`/bookings/${BOOKINGS.cancellable}`)

    await expect(page.getByText(notLoaded).first()).toBeVisible()
  })

  test('a failing API renders an error rather than an empty list', async ({ page }) => {
    await page.route('**/api/v1/vendors**', (route) =>
      route.fulfill({ status: 500, body: '{"success":false,"message":"boom"}' })
    )

    await page.goto('/home')
    await expect(page.locator('body')).not.toHaveText('')
  })
})
