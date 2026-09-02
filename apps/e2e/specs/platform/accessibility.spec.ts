/**
 * Automated accessibility checks on the highest-traffic screens.
 *
 * Scoped to serious and critical violations. An axe scan set to report
 * everything on a real app produces a list nobody triages; the point here is a
 * floor that holds, not a score.
 *
 * This suite's selectors are roles and accessible names throughout, so most of
 * this surface is already exercised — the scan catches the things a functional
 * test does not notice, like contrast and duplicated ids.
 */
import AxeBuilder from '@axe-core/playwright'
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, VENDORS, SERVICES } from '../../support/seed-ids'

const scan = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()

/**
 * Colour contrast is excluded from the per-screen gate below.
 *
 * axe reports it on every screen in the app — 13 nodes on /home alone — because
 * it is a property of the palette, not of any one page. Fixing it means
 * changing brand colours, which is a design decision rather than a test
 * failure to be patched away. It is kept visible by the dedicated test at the
 * bottom of this file instead of being silently dropped.
 */
const CONTRAST = 'color-contrast'

const serious = (results: Awaited<ReturnType<AxeBuilder['analyze']>>) =>
  results.violations.filter(
    (v) => (v.impact === 'serious' || v.impact === 'critical') && v.id !== CONTRAST
  )

test.describe('accessibility', () => {
  test.use({ storageState: asRole('customer-browse') })

  const screens: Array<[string, string]> = [
    ['home', '/home'],
    ['search', '/search'],
    ['garage', `/garage/${VENDORS.main.id}`],
    ['checkout', `/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`],
    ['bookings', '/bookings'],
    ['profile', '/profile'],
  ]

  for (const [name, path] of screens) {
    test(`${name} has no serious violations`, async ({ page }) => {
      await page.goto(path)
      // Wait for content rather than load: app-provider renders null until the
      // session resolves, and scanning an empty tree passes for the wrong
      // reason.
      await page.locator('main, [role="main"]').first().waitFor()

      const violations = serious(await scan(page))

      expect(
        violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
        `axe found serious or critical issues on ${path}`
      ).toEqual([])
    })
  }
})

/**
 * Marked `fail` on purpose: this is known debt, not an unwritten test.
 *
 * Every screen in the customer app has text below the WCAG AA contrast
 * threshold. The gate above deliberately excludes it so the rest of the
 * accessibility floor can be enforced today; this keeps the debt on the
 * report rather than in a comment nobody reads. When the palette is fixed
 * this starts passing and Playwright flags the annotation as stale.
 */
test.describe('accessibility debt', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('the palette should meet AA contrast', async ({ page }) => {
    test.fail()

    await page.goto('/home')
    await page.locator('main, [role="main"]').first().waitFor()

    const results = await scan(page)
    const contrast = results.violations.filter((v) => v.id === CONTRAST)

    expect(contrast).toEqual([])
  })
})

test.describe('responsive', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('the customer app does not scroll sideways on a small phone', async ({ page }) => {
    // 320px is the narrowest viewport worth supporting; the app is built to a
    // 428px shell, so this is the case where a fixed width would show.
    await page.setViewportSize({ width: 320, height: 720 })

    for (const path of ['/home', `/garage/${VENDORS.main.id}`, `/bookings/${BOOKINGS.reviewable}`]) {
      await page.goto(path)
      await page.locator('main, [role="main"]').first().waitFor()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
    }
  })
})
