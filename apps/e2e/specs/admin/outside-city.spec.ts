/**
 * The admin garage list shows the same "Outside Chennai" sign customers see,
 * with how far out the garage is, so ops can tell which garages carry it (and
 * spot a Chennai garage pinned in the wrong place).
 *
 * VENDORS.homePromo is pinned in Vellore, ~125 km from the Chennai centre;
 * MAIN sits on it. Read-only.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

/**
 * The name block at the top of a garage's card: name, phone and the sign.
 * Found from the card's name paragraph, since the pilot card on the same page
 * names garages too (in a span).
 */
const nameBlock = (page: Page, name: string) =>
  page
    .locator('p')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .locator('..')

test.describe('admin garage list @p0', () => {
  test('a garage outside Chennai carries the sign and its distance', async ({
    page,
  }) => {
    await page.goto('/vendors')

    const vellore = nameBlock(page, VENDORS.homePromo.name)
    await expect(vellore).toContainText('Outside Chennai · Vellore')
    await expect(vellore).toContainText('125 km out')

    await expect(nameBlock(page, VENDORS.main.name)).not.toContainText(
      'Outside Chennai'
    )
  })
})
