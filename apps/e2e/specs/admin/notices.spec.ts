/**
 * The Notices tab on Discounts: write a notice, see it listed by state, and
 * End now on a live one and on a scheduled one.
 *
 * Never a live notice for everyone: it would reach every customer's Home in
 * the specs running alongside. The live one here is about bookings at
 * VENDORS.homePromo half a year out, which nobody has; the one for everyone
 * starts a month from now. Both are deleted at the end (the app never
 * deletes a notice; the test cleans up after itself).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { VENDORS } from '../../support/seed-ids'

const DAY = 24 * 60 * 60 * 1000
const IST_OFFSET_MS = 330 * 60 * 1000

/** The datetime-local value `days` from now, in India time. */
function istInput(days: number): string {
  return new Date(Date.now() + days * DAY + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
}

test.use({ storageState: asRole('admin') })

test.describe('notices @p0', () => {
  test('written, listed as Live or Scheduled, and ended', async ({ page }) => {
    const tag = Date.now().toString().slice(-6)
    const liveTitle = `Slot may move: rain ${tag}`
    const laterTitle = `Diwali hours ${tag}`

    // "End now" asks first.
    page.on('dialog', (dialog) => void dialog.accept())

    try {
      // A live notice about bookings in a window at one garage.
      await page.goto('/discounts/notices/new')
      await page.locator('#notice-title').fill(liveTitle)
      await page
        .locator('#notice-body')
        .fill(
          'Heavy rain is forecast. The garage may call you to move your time.'
        )
      await page.locator('#notice-link').fill('/bookings')
      await page.locator('#notice-link-label').fill('My bookings')
      await page
        .getByRole('radio', {
          name: /Customers with a booking between two times/,
        })
        .check()
      await page.locator('#notice-booking-from').fill(istInput(200))
      await page.locator('#notice-booking-to').fill(istInput(201))
      await page.locator('#notice-vendor').selectOption(VENDORS.homePromo.id)
      await page.locator('#notice-ends').fill(istInput(3))

      // How it reaches customers: a line on the Next booking tile and the
      // first row of Updates, and who it reaches.
      const preview = page.getByRole('complementary', {
        name: 'Preview for customers',
      })
      await expect(preview).toContainText('On their Next booking tile')
      await expect(preview).toContainText('First in their Updates')
      await expect(preview.getByText(liveTitle)).toHaveCount(2)
      await expect(preview).toContainText(VENDORS.homePromo.name)
      await expect(preview).toContainText(/Reaches [\d,]+ customers?/)

      await page.getByRole('button', { name: 'Create notice' }).click()
      await expect(page).toHaveURL(/\/discounts\/notices$/)

      const live = page.getByRole('region', { name: /^Live/ })
      await expect(live.getByText(liveTitle)).toBeVisible()

      // One for everyone, starting in a month: scheduled.
      await page.getByRole('link', { name: 'Add notice' }).click()
      await page.locator('#notice-title').fill(laterTitle)
      await page
        .locator('#notice-body')
        .fill(
          'Some garages close early on Diwali. Check the slot before you book.'
        )
      await page.locator('#notice-starts').fill(istInput(30))
      await page.locator('#notice-ends').fill(istInput(32))
      await expect(
        page.getByRole('complementary', { name: 'Preview for customers' })
      ).toContainText('Pinned at the top of Updates')
      await page.getByRole('button', { name: 'Create notice' }).click()
      await expect(page).toHaveURL(/\/discounts\/notices$/)

      const scheduled = page.getByRole('region', { name: /^Scheduled/ })
      await expect(scheduled.getByText(laterTitle)).toBeVisible()

      // End now: the live one ends, the scheduled one is switched off.
      await live.getByRole('button', { name: `End now: ${liveTitle}` }).click()
      await scheduled
        .getByRole('button', { name: `End now: ${laterTitle}` })
        .click()

      const ended = page.getByRole('region', { name: /^Ended/ })
      await expect(ended.getByText(liveTitle)).toBeVisible()
      await expect(ended.getByText(laterTitle)).toBeVisible()
      // Never a delete: ended notices stay on the list.
      await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0)

      const rows = await sql<
        { title: string; is_active: boolean; ends_at: Date; starts_at: Date }[]
      >`
        select title, is_active, ends_at, starts_at from notices where title in (${liveTitle}, ${laterTitle})
      `
      const byTitle = new Map(rows.map((row) => [row.title, row]))
      expect(byTitle.get(liveTitle)!.is_active).toBe(true)
      expect(byTitle.get(liveTitle)!.ends_at.getTime()).toBeLessThanOrEqual(
        Date.now() + 5_000
      )
      expect(byTitle.get(laterTitle)!.is_active).toBe(false)
      expect(byTitle.get(laterTitle)!.starts_at.getTime()).toBeGreaterThan(
        Date.now()
      )
    } finally {
      await sql`delete from notices where title in (${liveTitle}, ${laterTitle})`
    }
  })
})
