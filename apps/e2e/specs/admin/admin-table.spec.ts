/**
 * The panel's one table (UX audit pattern 03) on Garages and Bookings:
 * filters kept in the URL, sorting by a heading, a row opened in the side
 * panel, and the Bookings saved views with their counts.
 *
 * Read-only. The garages are W1's seeded fixtures (0059, ids 4150–4199):
 * Marks Test Garage A misses photos, logo, the doorstep radius and payout
 * details and has no Onboarded by; B misses photos and bays and was
 * onboarded by "E2E Admin". Other garages may miss the same things, so these
 * tests look for A and B being in or out, never at totals.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

/** VENDORS.marksA and VENDORS.marksB, by name. */
const MARKS_A = 'Marks Test Garage A'
const MARKS_B = 'Marks Test Garage B'

/** A garage's row, named by the garage. */
const row = (page: Page, name: string) =>
  page.getByRole('row', { name, exact: true })

/** The order the table sorts names in. */
const byName = (a: string, b: string) =>
  a.localeCompare(b, 'en-IN', { numeric: true, sensitivity: 'base' })

/** "#AD5EA7C1": the reference as customers read it out. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

test.describe('the Garages table @p0', () => {
  test('Missing filters to the garages still missing it, from the URL', async ({
    page,
  }) => {
    // Only A is missing payout details.
    await page.goto('/vendors?show=all&missing=payout')
    await expect(row(page, MARKS_A)).toBeVisible()
    await expect(row(page, MARKS_B)).toHaveCount(0)
    await expect(
      row(page, MARKS_A).getByRole('list', { name: 'Missing' })
    ).toContainText('Photos')

    // Only B is missing its bays.
    await page.goto('/vendors?show=all&missing=bays')
    await expect(row(page, MARKS_B)).toBeVisible()
    await expect(row(page, MARKS_A)).toHaveCount(0)

    // Both are missing photos.
    await page.goto('/vendors?show=all&missing=photos')
    await expect(row(page, MARKS_A)).toBeVisible()
    await expect(row(page, MARKS_B)).toBeVisible()

    // An unknown key filters nothing.
    await page.goto('/vendors?show=all&missing=nonsense')
    await expect(row(page, MARKS_A)).toBeVisible()
    await expect(row(page, MARKS_B)).toBeVisible()
  })

  test('Onboarded by: a teammate, or Not set', async ({ page }) => {
    await page.goto('/vendors?show=all')
    const onboarded = page.getByLabel('Onboarded by')

    await onboarded.selectOption('E2E Admin')
    await expect(page).toHaveURL(/[?&]onboardedBy=E2E(\+|%20)Admin/)
    await expect(row(page, MARKS_B)).toBeVisible()
    await expect(row(page, MARKS_B)).toContainText('E2E Admin')
    await expect(row(page, MARKS_A)).toHaveCount(0)

    // "Not set" is its own choice (its value is "-").
    await expect(onboarded.locator('option[value="-"]')).toHaveText(
      /^Not set \(\d+\)$/
    )
    await onboarded.selectOption('-')
    await expect(page).toHaveURL(/[?&]onboardedBy=-/)
    await expect(row(page, MARKS_A)).toBeVisible()
    await expect(row(page, MARKS_A)).toContainText('Not set')
    await expect(row(page, MARKS_B)).toHaveCount(0)

    // Anyone again: both, and the filter leaves the URL.
    await onboarded.selectOption('')
    await expect(page).not.toHaveURL(/onboardedBy=/)
    await expect(row(page, MARKS_A)).toBeVisible()
    await expect(row(page, MARKS_B)).toBeVisible()
  })

  test('a heading sorts the rows, both ways, then back to the list order', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    const rows = page.locator('[role="row"][aria-labelledby^="vendor-"]')
    await expect(rows.first()).toBeVisible()
    const names = () => rows.locator('button[id$="-name"]').allTextContents()

    const garage = page.getByRole('columnheader', {
      name: 'Garage',
      exact: true,
    })
    await garage.getByRole('button').click()
    await expect(garage).toHaveAttribute('aria-sort', 'ascending')
    const ascending = await names()
    expect(ascending).toEqual([...ascending].sort(byName))

    await garage.getByRole('button').click()
    await expect(garage).toHaveAttribute('aria-sort', 'descending')
    const descending = await names()
    expect(descending).toEqual([...ascending].sort(byName).reverse())

    await garage.getByRole('button').click()
    await expect(garage).toHaveAttribute('aria-sort', 'none')

    // Counts start with the most.
    const bookings = page.getByRole('columnheader', {
      name: 'Bookings',
      exact: true,
    })
    await bookings.getByRole('button').click()
    await expect(bookings).toHaveAttribute('aria-sort', 'descending')
    const counts = (
      await rows
        .locator('.sr-only')
        .filter({ hasText: /^(Has \d+ bookings?|No bookings yet)$/ })
        .allTextContents()
    ).map((text) => Number(text.replace(/\D/g, '') || 0))
    expect(counts.length).toBeGreaterThan(1)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  test('a row opens in the side panel; Escape and its name close it', async ({
    page,
  }) => {
    await page.goto('/vendors?show=all')
    const a = row(page, MARKS_A)
    const name = a.getByRole('button', { name: MARKS_A, exact: true })
    const details = page.getByRole('complementary', { name: 'Garage details' })

    // A press anywhere on the row that isn't a control opens it.
    await a.getByRole('cell').nth(2).click()
    await expect(details).toBeVisible()
    await expect(details.getByRole('heading', { name: MARKS_A })).toBeVisible()
    await expect(name).toHaveAttribute('aria-expanded', 'true')
    await expect(
      details.getByRole('link', { name: 'Open editor' })
    ).toHaveAttribute(
      'href',
      /^\/vendors\/[^/]+\/edit\?back=%2Fvendors%3Fshow%3Dall$/
    )

    await page.keyboard.press('Escape')
    await expect(details).toHaveCount(0)
    await expect(name).toHaveAttribute('aria-expanded', 'false')

    // The name opens it, and closes it again.
    await name.click()
    await expect(details).toBeVisible()
    await name.click()
    await expect(details).toHaveCount(0)
  })
})

test.describe('the Bookings views @p0', () => {
  test('a search shows All; a view narrows it, each with its count', async ({
    page,
  }) => {
    // With no search the list opens on Needs action.
    await page.goto('/bookings')
    const views = page.getByRole('group', { name: 'Views' })
    await expect(
      views.getByRole('button', { name: /^Needs action/ })
    ).toHaveAttribute('aria-pressed', 'true')

    // Pending and paid: it needs action, and it is not completed.
    const ref = reference(BOOKINGS.adminOpsWaiting)
    await page.goto(`/bookings?q=%23${ref}`)
    const link = page.getByRole('link', {
      name: new RegExp(`^Open booking #${ref}`),
    })
    await expect(link).toBeVisible()
    await expect(views.getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // Counted under the same search.
    await expect(
      views.getByRole('button', { name: 'All 1', exact: true })
    ).toBeVisible()
    await expect(
      views.getByRole('button', { name: 'Needs action 1', exact: true })
    ).toBeVisible()
    await expect(
      views.getByRole('button', { name: 'Completed 0', exact: true })
    ).toBeVisible()

    await views.getByRole('button', { name: /^Needs action/ }).click()
    await expect(page).toHaveURL(/[?&]view=needs_action/)
    await expect(link).toBeVisible()

    await views.getByRole('button', { name: /^Completed/ }).click()
    await expect(page).toHaveURL(/[?&]view=completed/)
    await expect(link).toHaveCount(0)
    await expect(page.getByText(/^Nothing matches these filters/)).toBeVisible()
  })
})
