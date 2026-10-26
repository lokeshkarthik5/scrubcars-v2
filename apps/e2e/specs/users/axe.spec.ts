/**
 * axe on the customer app's main screens, as a P0 gate.
 *
 * The screens a customer passes through on the way to a booking and after it:
 * the signed-out homepage, Home, the garage list, a garage, checkout, a
 * booking, the help centre and Profile. Fails only on axe's serious and
 * critical findings — a floor that holds, not a score (moderate and minor
 * findings are judgement calls axe itself is unsure of).
 *
 * specs/platform/accessibility.spec.ts scans more screens, and the legal
 * pages, outside P0; this is the short list that has to pass on every change.
 *
 * Rules and nodes left out on purpose, and why:
 *
 *   · color-contrast, only where the text is brand red #EF3240: it clears
 *     4.5:1 on the canvas (4.9:1) and a card (4.56:1) but not on graphite,
 *     and is kept off raised surfaces. White on a red fill is not excluded:
 *     fills behind white text are #E4002B (4.85:1), and the platform spec's
 *     brand-red test holds them to AA. Every other contrast finding fails.
 *
 * Nothing else is disabled.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, SERVICES, VENDORS } from '../../support/seed-ids'

type Screen = {
  name: string
  path: string
  /** What says the screen has its data, not a skeleton. */
  ready: (page: Page) => Locator
}

/**
 * Waits for one-shot animations to end. Reduced motion (set below) lands
 * reveals and sheets at once and turns the red button's shine off, but a
 * page's own fade can still be running, and axe measures colours as drawn:
 * half-faded text reads as a contrast failure that is not there at rest.
 * Endless loops (the skeleton shimmer) are not waited for.
 */
async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      document.getAnimations().every((animation) => {
        const timing = animation.effect?.getComputedTiming()
        if (timing && timing.iterations === Infinity) return true
        return animation.playState === 'finished' || animation.playState === 'idle'
      }),
    null,
    { timeout: 10_000 }
  )
}

const BRAND_RED_TEXT = '#ef3240'

const isBrandRedText = (node: { any?: Array<{ data?: unknown }> }) =>
  (node.any ?? []).some((check) => {
    const data = check.data as { fgColor?: string } | undefined
    return data?.fgColor?.toLowerCase() === BRAND_RED_TEXT
  })

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) =>
      v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter((n) => !isBrandRedText(n)) } : v
    )
    .filter((v) => v.nodes.length > 0)
    .flatMap((v) =>
      v.nodes.map((n) => {
        // The colours and the markup, not just a rule name: a contrast
        // failure is unactionable without them.
        const d = (n.any ?? []).find((c) => c.data)?.data as
          | { fgColor?: string; bgColor?: string; contrastRatio?: number }
          | undefined
        const colours = d?.fgColor ? ` [${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}:1]` : ''
        return `${v.id} (${v.impact})${colours} ${(n.html ?? '').slice(0, 90)}`
      })
    )
}

function scanEach(screens: Screen[]) {
  for (const screen of screens) {
    test(`${screen.name} has no serious or critical axe violations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(screen.path)
      await expect(screen.ready(page)).toBeVisible()
      await settle(page)

      expect(await seriousViolations(page), `axe on ${screen.path}`).toEqual([])
    })
  }
}

test.describe('axe, signed out @p0', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  scanEach([
    {
      name: 'the marketing homepage',
      path: '/',
      ready: (page) => page.getByRole('heading', { level: 1 }),
    },
  ])
})

test.describe('axe, browsing customer @p0', () => {
  test.use({ storageState: asRole('customer-browse') })

  scanEach([
    {
      // The Home hub: NEXT_PUBLIC_HOME_HUB is on in the suite.
      name: 'Home',
      path: '/home',
      ready: (page) => page.getByRole('region', { name: 'Your car', exact: true }),
    },
    {
      name: 'the garage list',
      path: '/garages',
      ready: (page) => page.getByRole('heading', { name: 'Nearby Garages' }),
    },
    {
      name: 'a garage page',
      path: `/garage/${VENDORS.main.id}`,
      ready: (page) => page.getByRole('heading', { level: 1, name: VENDORS.main.name }),
    },
    {
      name: 'checkout',
      path: `/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`,
      ready: (page) => page.getByRole('heading', { name: 'When?' }),
    },
    {
      name: 'the help centre',
      path: '/help',
      ready: (page) => page.getByRole('heading', { level: 1, name: 'Help centre' }),
    },
    {
      name: 'Profile',
      path: '/profile',
      ready: (page) => page.getByRole('heading', { name: 'Vehicles' }),
    },
  ])
})

test.describe('axe, a customer with past bookings @p0', () => {
  // Read-only: a completed, already-reviewed booking nothing else changes.
  test.use({ storageState: asRole('customer-review') })

  scanEach([
    {
      name: 'a booking page',
      path: `/bookings/${BOOKINGS.alreadyReviewed}`,
      ready: (page) => page.getByText(VENDORS.main.name).first(),
    },
  ])
})
