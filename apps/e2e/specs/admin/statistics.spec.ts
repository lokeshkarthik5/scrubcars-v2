/**
 * The Statistics page: in the menu, its three tabs, and the CSV.
 *
 * Read for VENDORS.stats alone, whose bookings only the seed writes (see
 * STATS in e2e-ids.ts). Over the last 30 days that is received(21) to (32):
 * 12 paid bookings, ₹8,900 collected after refunds and ₹335 commission.
 * The figures themselves are pinned in statistics-api.spec.ts; this checks
 * the page says them.
 */
import { readFileSync } from 'node:fs'
import { test, expect, asRole } from '../../support/fixtures'
import { VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

test.describe('statistics page @p0', () => {
  test('overview, breakdown with its CSV, and commission, for one garage', async ({
    page,
  }) => {
    // In the menu: the header's on a wide screen, the bottom bar's on a phone.
    await page.goto('/vendors')
    await page.locator('a[href="/statistics"]:visible').first().click()
    await expect(page).toHaveURL(/\/statistics$/)
    await expect(
      page.getByRole('heading', { name: 'Statistics' })
    ).toBeVisible()

    // Last 30 days by default, compared with the 30 before — or, on the
    // 30th of a 30-day month, when the 30 days are the whole month, with the
    // month before (as the API does: stats-range.ts).
    await expect(page.getByLabel('Period')).toHaveValue('last30')
    await expect(
      page.getByRole('switch', {
        name: /^Compare with (previous 30 days|[A-Z][a-z]+)$/,
      })
    ).toHaveAttribute('aria-checked', 'true')

    // Exact: the menu's search, and others, mention garages too.
    await page
      .getByLabel('Garage', { exact: true })
      .selectOption(VENDORS.stats.id)
    await expect(page).toHaveURL(new RegExp(`garage=${VENDORS.stats.id}`))
    await expect(
      page.getByText('Collected after refunds', { exact: true })
    ).toBeVisible()
    await expect(page.getByText('₹8,900', { exact: true })).toBeVisible()
    await expect(page.getByText('₹335', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Bookings per day' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Collected per week' })
    ).toBeVisible()
    // The pilot's card moved here from Vendors.
    await expect(
      page.getByRole('heading', { name: 'Pilot numbers' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'How we count' })
    ).toBeVisible()

    // Breakdown keeps the garage.
    await page.getByRole('link', { name: 'Breakdown' }).click()
    await expect(page).toHaveURL(/tab=breakdown/)
    await expect(page.getByRole('heading', { name: 'Funnel' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'By garage' })).toBeVisible()
    await expect(
      page.getByRole('rowheader', { name: new RegExp(VENDORS.stats.name) })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Busiest hours' })
    ).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(
      /^detlio-statistics-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/
    )
    const csv = readFileSync((await download.path())!, 'utf8')
    expect(csv).toContain('Section,Name,Bookings,Collected (₹),Rating')
    expect(csv).toContain(`Garage,${VENDORS.stats.name},12,8900,4.5`)

    // Commission goes by month, with the rule in words.
    await page.getByRole('link', { name: 'Commission' }).click()
    await expect(page).toHaveURL(/tab=commission/)
    await expect(page.getByText('First 25 bookings are free')).toBeVisible()
    await expect(
      page.getByText('Detailing, coating and scratch removal')
    ).toBeVisible()
    await expect(page.getByText(/^Commission in \w+ so far$/)).toBeVisible()
  })
})
