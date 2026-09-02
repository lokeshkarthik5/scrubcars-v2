/**
 * The ops panel.
 *
 * Admin authenticates differently from everyone else — username and password
 * against ADMIN_USERNAME/ADMIN_PASSWORD, minting a token with `sub: 'admin'`
 * rather than a user id — so it gets its own storageState and its own spec.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { DISCOUNTS, VENDORS } from '../../support/seed-ids'

test.describe('admin auth', () => {
  test('bad credentials are refused', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#admin-username').fill('admin')
    await page.locator('#admin-password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: /Sign in/i }).click()

    await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('the seeded credentials get in', async ({ page }) => {
    await page.goto('/login')
    // The only inputs in the repo with real ids, so getByLabel works here.
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('admin')
    await page.getByRole('button', { name: /Sign in/i }).click()

    await expect(page).not.toHaveURL(/\/login/)
  })
})

test.describe('admin panel', () => {
  test.use({ storageState: asRole('admin') })

  test('every seeded garage is listed', async ({ page }) => {
    await page.goto('/vendors')

    await expect(page.getByText(VENDORS.main.name).first()).toBeVisible()
    await expect(page.getByText(VENDORS.second.name).first()).toBeVisible()
    await expect(page.getByText(VENDORS.narrow.name).first()).toBeVisible()
  })

  test('discounts are listed with their codes', async ({ page }) => {
    await page.goto('/discounts')

    await expect(page.getByText(DISCOUNTS.percentCapped.code).first()).toBeVisible()
    await expect(page.getByText(DISCOUNTS.fixedMinOrder.code).first()).toBeVisible()
  })

  test('a new discount can be created and is usable immediately', async ({ page }) => {
    const code = `E2ENEW${Date.now().toString().slice(-6)}`

    await page.goto('/discounts/new')
    await page.getByLabel(/code/i).first().fill(code)
    await page.getByLabel(/percent/i).first().fill('15')
    await page.getByRole('button', { name: /Create|Save/i }).first().click()

    // Written, active, and platform-funded by default.
    await expect
      .poll(async () => {
        const rows = await sql<{ is_active: boolean }[]>`
          select is_active from discounts where lower(code) = lower(${code})
        `
        return rows[0]?.is_active
      })
      .toBe(true)

    await sql`delete from discounts where lower(code) = lower(${code})`
  })

  test('bookings made by the customer suite are visible to ops', async ({ page }) => {
    await page.goto('/bookings')
    // Read-only view; the assertion is that it renders real rows rather than
    // an empty state, since every other spec has been writing bookings.
    await expect(page.getByText(/₹/).first()).toBeVisible()
  })
})
