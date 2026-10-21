/**
 * The Help centre (/help): open to anyone, searchable, and linked from the
 * places a customer looks for help. The words are the owner's to edit in
 * apps/users/components/help/content.ts; the search rule and the copy's
 * figures are unit-tested beside it (apps/users/lib/help-search.test.ts).
 */
import { test, expect, asRole } from '../../support/fixtures'

test.describe('Help centre @p0', () => {
  test('a guest can read it, search it and get to a person', async ({ page }) => {
    const response = await page.goto('/help')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Help centre' })).toBeVisible()
    for (const group of ['Booking', 'Payments & refunds', 'Pickup & drop', 'Doorstep', 'Account & privacy', 'Complaints']) {
      await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible()
    }

    await page.getByLabel('Search help').fill('delivery code')
    const answer = page.getByText('Your booking page shows a 4-digit pickup code.', { exact: false })
    await expect(answer).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Booking', exact: true })).toHaveCount(0)

    await page.getByLabel('Search help').fill('zebra crossing')
    await expect(page.getByText('No answers match that.', { exact: false })).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Still need help?' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Raise a complaint' })).toHaveAttribute(
      'href',
      '/contact#raise-complaint'
    )
  })

  test.describe('signed in', () => {
    test.use({ storageState: asRole('customer-browse') })

    test('Profile links to it', async ({ page }) => {
      await page.goto('/profile')
      await page.getByRole('link', { name: 'Help centre' }).click()
      await expect(page).toHaveURL(/\/help$/)
    })
  })
})
