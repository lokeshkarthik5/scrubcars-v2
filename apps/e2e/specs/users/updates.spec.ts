/**
 * Updates: the bell on Home, the screen it opens, and the read marker.
 *
 * CUSTOMERS.homeBell's job finished a day ago, after Updates was last
 * opened, so its rows are new. Opening Updates moves the marker to the
 * server's own clock and the bell goes quiet; the dots stay on that visit's
 * new rows until Mark all read. The marker only ever moves forward, so each
 * test puts it back first, as home-api.spec.ts does for its own customer.
 * Grouping and times in IST are unit-tested in packages/core
 * (home-display.test.ts); this pins the screens and the round trip.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-homeBell') })

async function resetToSeed() {
  await sql`
    update users set updates_seen_at = now() - interval '60 hours'
     where id = ${CUSTOMERS.homeBell.id}
  `
  await sql`update bookings set review_prompt_dismissed_at = null where id = ${BOOKINGS.homeBellDone}`
}

const bell = (page: Page, name: 'Updates' | 'Updates, new') =>
  page.getByRole('link', { name, exact: true })

test.describe('Updates @p0', () => {
  test('a new update lights the bell; opening Updates clears it', async ({ page }) => {
    await resetToSeed()
    await page.goto('/home')
    await bell(page, 'Updates, new').click()

    await expect(page).toHaveURL(/\/updates$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toBeVisible()
    await expect(page.getByText('Your car is done')).toBeVisible()
    await expect(page.getByText(`${VENDORS.homePromo.name} accepted your booking`)).toBeVisible()
    // The rows new on this visit keep their dot, and say so in words.
    await expect(page.getByTestId('unread-dot').first()).toBeVisible()
    await expect(page.getByText('(new)').first()).toBeAttached()
    // Rating is waiting on the customer, so it is under To do.
    const todo = page.getByRole('region', { name: 'To do' })
    await expect(todo.getByRole('region', { name: 'Rate your wash' })).toBeVisible()

    await page.getByRole('link', { name: 'Back to Home' }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(bell(page, 'Updates')).toBeVisible()
    await expect(page.getByTestId('updates-dot')).toHaveCount(0)

    // And it holds on a fresh load: the marker is on the server. The bell
    // reads "Updates" while Home is still loading, so wait for Home first.
    await page.reload()
    await expect(page.getByRole('region', { name: 'Your car', exact: true })).toBeVisible()
    await expect(bell(page, 'Updates')).toBeVisible()
    await expect(page.getByTestId('updates-dot')).toHaveCount(0)
  })

  test('Mark all read takes the dots off the rows', async ({ page }) => {
    await resetToSeed()
    await page.goto('/updates')

    const dots = page.getByTestId('unread-dot')
    await expect(dots.first()).toBeVisible()
    await page.getByRole('button', { name: 'Mark all read' }).click()
    await expect(dots).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  test('Rate your wash sits below the offers on Home, and × closes it for good', async ({ page }) => {
    await resetToSeed()
    await page.goto('/home')

    const card = page.getByRole('region', { name: 'Rate your wash' })
    await expect(card).toBeVisible()
    // A star opens the booking's own rating form with that many chosen; the
    // review is only sent from there.
    await expect(card.getByRole('button', { name: 'Rate 4 stars' })).toBeVisible()

    await card.getByRole('button', { name: 'Hide Rate your wash' }).click()
    await expect(card).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Your car', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Rate your wash' })).toHaveCount(0)
  })
})
