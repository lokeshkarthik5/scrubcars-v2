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

/**
 * Waits until nothing on the page is still animating.
 *
 * This matters more than it sounds. Cards and list items enter through
 * `.reveal`, which starts at `opacity: 0` and fades in, and axe samples the
 * *computed* colour — so scanning early measures half-faded text against the
 * background and reports contrast failures that do not exist at rest. It
 * reported around twenty; three were real. Waiting for the animations to
 * finish is the difference between a signal and a wall of noise.
 */
async function settle(page: import('@playwright/test').Page) {
  await page.locator('main, [role="main"]').first().waitFor()
  await page.waitForFunction(
    () =>
      document.getAnimations().every((animation) => {
        // Ambient loops — shimmer, pulse, the success ring — run forever by
        // design, so waiting for them to finish waits for ever. Only the
        // one-shot entrance animations need to have landed.
        const timing = animation.effect?.getComputedTiming()
        if (timing && timing.iterations === Infinity) return true
        return animation.playState === 'finished' || animation.playState === 'idle'
      }),
    null,
    { timeout: 10_000 }
  )
}

const scan = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()

/**
 * Brand red at small text sizes.
 *
 * Two pairings, one underlying decision:
 *
 *   white #FAFAFA on brand red #EF3240      3.87:1  — ScButton's primary
 *                                                     style, so every CTA
 *   brand red #EF3240 on raised surfaces    4.12:1  — ScSegmented's selected
 *                                                     state (#1E1E1E)
 *
 * Neither is a page-level mistake and neither can be fixed where it appears.
 * Red text only clears 4.5:1 on surfaces at or below #151515, so darkening the
 * elevated surface enough would make it darker than the surface it is meant to
 * sit above. And white on #EF3240 cannot reach 4.5:1 at all without changing
 * the red.
 *
 * The usual remedy is accessible variants of the brand colour — a darker red
 * behind white text (#D42433 gives 4.91:1) and a lighter one for small red
 * text (#F4525C gives 5.4:1 on surface) — keeping #EF3240 for fills and large
 * elements. That is a design decision about the brand, not a test failure to
 * patch away, so the pairings are excluded from the gate below and kept on the
 * report by the test at the bottom of this file.
 *
 * axe under-reports both: it exempts disabled controls, and most primary
 * buttons are disabled until their form is valid.
 */
const BRAND_RED = '#ef3240'

const isBrandRedPairing = (node: { any?: Array<{ data?: unknown }> }) =>
  (node.any ?? []).some((check) => {
    const data = check.data as { fgColor?: string; bgColor?: string } | undefined
    const fg = data?.fgColor?.toLowerCase()
    const bg = data?.bgColor?.toLowerCase()
    return fg === BRAND_RED || bg === BRAND_RED
  })

const serious = (results: Awaited<ReturnType<AxeBuilder['analyze']>>) =>
  results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) =>
      v.id === 'color-contrast'
        ? { ...v, nodes: v.nodes.filter((n) => !isBrandRedPairing(n)) }
        : v
    )
    .filter((v) => v.nodes.length > 0)

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
      // Content, not `load`: app-provider renders null until the session
      // resolves, and scanning an empty tree passes for the wrong reason.
      await settle(page)

      const violations = serious(await scan(page))

      // Report the offending colours and markup, not just a rule name — a
      // contrast failure is unactionable without them.
      expect(
        violations.flatMap((v) =>
          v.nodes.map((n) => {
            const d = (n.any ?? []).find((c) => c.data)?.data as
              | { fgColor?: string; bgColor?: string; contrastRatio?: number }
              | undefined
            const colours = d?.fgColor
              ? ` [${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1]`
              : ''
            return `${v.id}${colours} ${(n.html ?? '').slice(0, 70)}`
          })
        ),
        `axe found serious or critical issues on ${path}`
      ).toEqual([])
    })
  }
})

/**
 * Marked `fail` on purpose: known brand-level debt, not an unwritten test.
 *
 * See the note on `isBrandRedPairing` above. This starts passing once brand red
 * has accessible variants, at which point Playwright reports the annotation as
 * stale — delete it and the exclusion together.
 */
test.describe('accessibility debt', () => {
  test.use({ storageState: asRole('customer-browse') })

  test('brand red should meet AA at small text sizes', async ({ page }) => {
    test.fail()

    await page.goto('/home')
    await settle(page)

    const results = await scan(page)
    const offenders = results.violations
      .filter((v) => v.id === 'color-contrast')
      .flatMap((v) => v.nodes.filter(isBrandRedPairing))

    expect(offenders).toEqual([])
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
      await settle(page)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
    }
  })
})
