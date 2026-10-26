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

/** A garage's row in the Garages table, named by the garage. */
const card = (page: Page, name: string) => page.getByRole('row', { name, exact: true })

test.describe('admin garage list @p0', () => {
  test('a garage outside Chennai carries the sign and its distance', async ({
    page,
  }) => {
    await page.goto('/vendors')

    const vellore = card(page, VENDORS.homePromo.name)
    await expect(vellore).toContainText('Outside Chennai · Vellore')
    await expect(vellore).toContainText('125 km out')

    await expect(card(page, VENDORS.main.name)).not.toContainText(
      'Outside Chennai'
    )
  })
})
