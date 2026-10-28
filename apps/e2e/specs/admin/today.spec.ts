/**
 * The panel's frame and first screen (UX audit mockups 01 and 02): sign-in
 * lands on Today, every open task is listed by deadline with its action,
 * the grouped menu carries counts, and on a phone every page is at most two
 * taps away.
 *
 * Read-only. The task it looks for is BOOKINGS.adminOpsWaiting: paid 45
 * minutes ago, waiting for MAIN to accept, tomorrow at 9 (booking-ops.spec
 * only reads it). The inbox's rules themselves are unit-tested at the API
 * (apps/server/src/modules/today).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, CUSTOMERS, VENDORS } from '../../support/seed-ids'

/** "#AD5EA7C1": the reference as the panel shows it. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

test.describe('Today @p0', () => {
  test('signing in lands on Today, not on the garage list', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('admin')
    await page.getByRole('button', { name: /Sign in/i }).click()

    await expect(page).toHaveURL(/\/today$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /need(s)? you|Nothing needs you/
    )
  })

  test.describe('signed in', () => {
    test.use({ storageState: asRole('admin') })

    test('lists a booking waiting for its garage, with Call garage, under Bookings and not Issues', async ({
      page,
    }) => {
      const ref = reference(BOOKINGS.adminOpsWaiting)
      await page.goto('/today')

      await expect(
        page.getByRole('region', { name: 'Today in numbers' })
      ).toBeVisible()
      const tasks = page.getByRole('list', { name: 'Open tasks, by deadline' })
      const row = tasks.getByRole('listitem').filter({ hasText: `#${ref}` })
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(
        `${VENDORS.main.name} hasn’t accepted #${ref}`
      )
      await expect(row).toContainText(CUSTOMERS.adminOps.name)
      // Its next step, on the row: the garage's number.
      await expect(
        row.getByRole('link', {
          name: new RegExp(`^Call ${VENDORS.main.name}, `),
        })
      ).toBeVisible()

      // The filter tabs keep it under Bookings, and out of Issues.
      const show = page.getByRole('group', { name: 'Show' })
      await show.getByRole('button', { name: /^Bookings \d+$/ }).click()
      await expect(
        show.getByRole('button', { name: /^Bookings \d+$/ })
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(row).toHaveCount(1)
      await show.getByRole('button', { name: /^Issues \d+$/ }).click()
      await expect(
        tasks.getByRole('listitem').filter({ hasText: `#${ref}` })
      ).toHaveCount(0)

      // The row opens the booking.
      await show.getByRole('button', { name: /^All \d+$/ }).click()
      await row
        .getByRole('link', { name: new RegExp(`#${ref}`) })
        .first()
        .click()
      await expect(page).toHaveURL(
        new RegExp(`/bookings/${BOOKINGS.adminOpsWaiting}$`)
      )
    })

    test('the grouped menu shows every place, with counts on what needs action', async ({
      page,
    }) => {
      await page.goto('/today')
      const menu = page.getByRole('navigation', { name: 'Main' })
      for (const place of [
        'Today',
        'Bookings',
        'Requests',
        'Issues',
        'Refunds',
        'Garages',
        'Payouts',
        'Coverage',
        'Offers',
        'Statistics',
        'Settings',
      ]) {
        await expect(
          menu.getByRole('link', { name: new RegExp(`^${place}\\b`) })
        ).toBeVisible()
      }
      // At least the seeded waiting booking: "Bookings 1 waiting for the garage".
      await expect(
        menu.getByRole('link', {
          name: /^Bookings \d+ waiting for the garage$/,
        })
      ).toBeVisible()
      await expect(menu.getByRole('link', { name: /^Today/ })).toHaveAttribute(
        'aria-current',
        'page'
      )

      // Issues is one place for complaints, redo claims and bypass reports.
      await menu.getByRole('link', { name: /^Issues\b/ }).click()
      await expect(page).toHaveURL(/\/complaints$/)
      const sections = page.getByRole('navigation', { name: 'Issues sections' })
      await sections.getByRole('link', { name: 'Bypass reports' }).click()
      await expect(page).toHaveURL(/\/bypass-reports$/)
      await expect(
        menu.getByRole('link', { name: /^Issues\b/ })
      ).toHaveAttribute('aria-current', 'page')

      // Alerts lives in Settings now, out of the daily menu and Statistics.
      await menu.getByRole('link', { name: 'Settings' }).click()
      await page.getByRole('link', { name: /^Telegram alerts/ }).click()
      await expect(page).toHaveURL(/\/alerts$/)
      await expect(
        menu.getByRole('link', { name: 'Settings' })
      ).toHaveAttribute('aria-current', 'page')
    })

    test('Find anything opens the bookings search', async ({ page }) => {
      const ref = reference(BOOKINGS.adminOpsWaiting)
      await page.goto('/today')
      const find = page.getByRole('searchbox', {
        name: 'Find anything',
      })
      await find.fill(`#${ref}`)
      await find.press('Enter')
      await expect(page).toHaveURL(/\/bookings\?q=%23/)
      await expect(
        page.getByRole('link', { name: /^Open booking #/ })
      ).toHaveCount(1)
    })
  })

  test.describe('on a phone', () => {
    test.use({
      storageState: asRole('admin'),
      viewport: { width: 390, height: 844 },
    })

    test('five tabs, and More reaches every other page', async ({ page }) => {
      await page.goto('/today')
      const bar = page.getByRole('navigation', { name: 'Main' })
      for (const tab of ['Today', 'Bookings', 'Issues', 'Garages']) {
        await expect(
          bar.getByRole('link', { name: new RegExp(`^${tab}\\b`) })
        ).toBeVisible()
      }
      await bar.getByRole('button', { name: 'More' }).click()
      const more = page.getByRole('dialog', { name: 'More pages' })
      for (const place of [
        'Requests',
        'Refunds',
        'Payouts',
        'Coverage',
        'Offers',
        'Statistics',
        'Settings',
      ]) {
        await expect(
          more.getByRole('link', { name: new RegExp(`^${place}\\b`) })
        ).toBeVisible()
      }
      await more.getByRole('link', { name: /^Statistics/ }).click()
      await expect(page).toHaveURL(/\/statistics$/)
      await expect(bar.getByRole('button', { name: 'More' })).toBeVisible()
    })
  })
})
