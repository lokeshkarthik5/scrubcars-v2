/**
 * Statistics → Behaviour (0061): the tab, its funnel and last steps from the
 * seeded visits (BEHAVIOUR in e2e-ids.ts; the figures are pinned in
 * behaviour-api.spec.ts), its three filters, and the Clarity link.
 *
 * NEXT_PUBLIC_CLARITY_ID is set for the E2E builds (.env.e2e, and the CI
 * build step), so the link is there; without it the tab leaves it out.
 */
import { test, expect, asRole } from '../../support/fixtures'

test.use({ storageState: asRole('admin') })

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? 'e2eclarity01'

test.describe('statistics: behaviour @p0', () => {
  test('the funnel from landing to paid, the last steps, the filters and Clarity', async ({
    page,
  }) => {
    await page.goto('/statistics')
    await page
      .getByRole('navigation', { name: 'Statistics sections' })
      .getByRole('link', { name: 'Behaviour' })
      .click()
    await expect(page).toHaveURL(/tab=behaviour/)

    // The last 7 days by default, every source and device.
    await expect(page.getByLabel('Period')).toHaveValue('last7')
    await expect(page.getByLabel('Source')).toHaveValue('all')
    await expect(page.getByLabel('Device')).toHaveValue('all')

    // Who is left out, said on the page.
    await expect(
      page.getByText(
        'Test bookings, the team’s own visits and browsers that ask not to be tracked are left out. Left out here: 2 team visits.'
      )
    ).toBeVisible()

    await expect(
      page.getByRole('heading', { name: 'From landing to paid' })
    ).toBeVisible()
    await expect(page.getByText('10 visits landed · 14 visits in all')).toBeVisible()
    const step = (key: string) => page.locator(`[data-step="${key}"]`)
    await expect(step('landed')).toContainText('Landed')
    await expect(step('landed')).toContainText('10')
    // The biggest leak: 5 of the 10 never saw a garage.
    await expect(step('garageSeen')).toContainText('Saw a garage')
    await expect(step('garageSeen')).toContainText('−5 left here')
    await expect(step('area')).toContainText('Not recorded yet')
    await expect(step('garage')).toContainText('5')
    await expect(step('service')).toContainText('−3')
    await expect(step('paid')).toContainText('1')
    await expect(
      page.getByText('Biggest leak: Landed → Saw a garage, 5 visits left')
    ).toBeVisible()

    await expect(
      page.getByRole('heading', { name: 'Last step before leaving' })
    ).toBeVisible()
    await expect(
      page.getByText('Top 5 · of 9 visits that landed and did not pay')
    ).toBeVisible()
    const lastSteps = page.getByRole('listitem').filter({ hasText: 'Landing page' })
    await expect(lastSteps).toContainText('5 · 56%')
    await expect(
      page.getByRole('listitem').filter({ hasText: "A garage's page" })
    ).toContainText('3 · 33%')

    // Clarity's recordings, in a new tab.
    const clarity = page.getByRole('link', { name: /Open recordings in Clarity/ })
    await expect(clarity).toHaveAttribute(
      'href',
      `https://clarity.microsoft.com/projects/view/${CLARITY_ID}/impressions`
    )
    await expect(clarity).toHaveAttribute('target', '_blank')

    // Source: Instagram.
    await page.getByLabel('Source').selectOption('instagram')
    await expect(page).toHaveURL(/source=instagram/)
    await expect(step('landed')).toContainText('8')
    await expect(page.getByText('8 visits landed · 12 visits in all')).toBeVisible()

    // Back to every source; Device: Phone.
    await page.getByLabel('Source').selectOption('all')
    await expect(page).not.toHaveURL(/source=/)
    await page.getByLabel('Device').selectOption('phone')
    await expect(page).toHaveURL(/device=phone/)
    await expect(page.getByText('9 visits landed · 13 visits in all')).toBeVisible()

    // The last 30 days take in the visit that made a Test booking, left out.
    await page.getByLabel('Device').selectOption('all')
    await page.getByLabel('Period').selectOption('last30')
    await expect(page).toHaveURL(/period=last30/)
    await expect(
      page.getByText(
        'Left out here: 2 team visits and 1 visit with a Test booking.',
        { exact: false }
      )
    ).toBeVisible()

    // Its definitions, under the figures.
    await expect(page.getByRole('heading', { name: 'How we count' })).toBeVisible()
  })
})
