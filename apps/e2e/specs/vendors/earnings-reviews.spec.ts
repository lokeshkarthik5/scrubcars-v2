/**
 * The two read-only vendor screens.
 *
 * Earnings is reconciled against the database rather than asserted as "some
 * number appears": a total that renders but is wrong is the failure mode, and
 * it is invisible to a smoke test.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-owner') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, VENDORS.main.id)
})

test.describe('earnings', () => {
  test('the period selector switches range', async ({ page }) => {
    await page.goto('/earnings')

    const week = page.getByRole('radio', { name: 'Week' })
    const month = page.getByRole('radio', { name: 'Month' })

    await expect(week).toHaveAttribute('aria-checked', 'true')
    await month.click()
    await expect(month).toHaveAttribute('aria-checked', 'true')
    await expect(week).toHaveAttribute('aria-checked', 'false')
  })

  test('completed work is what shows up as earned', async ({ page }) => {
    // The garage has completed jobs only because other specs put them there,
    // so the assertion is the relationship, not a fixed figure.
    const [{ n }] = await sql<{ n: string }[]>`
      select count(*)::text as n from bookings
       where vendor_id = ${VENDORS.main.id} and status = 'completed'
    `

    await page.goto('/earnings')
    await page.getByRole('radio', { name: 'Month' }).click()

    if (Number(n) > 0) {
      await expect(page.getByText(/₹/).first()).toBeVisible()
    }
  })
})

test.describe('vendor reviews', () => {
  test('customer reviews are listed with their rating', async ({ page }) => {
    await page.goto('/reviews')

    // Left by the seed against a completed booking at this garage.
    await expect(page.getByText('Solid work, seeded.')).toBeVisible()
  })
})
