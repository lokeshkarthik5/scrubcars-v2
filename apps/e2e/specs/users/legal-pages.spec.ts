/**
 * The public legal pages (/terms, /privacy, /refund-policy, /service-delivery,
 * /contact) and every place that links to them: the homepage footer, the
 * sign-in screen, checkout and Profile.
 *
 * Razorpay checks these pages before it activates an account, and the
 * E-Commerce Rules want the business's name, address and grievance contact
 * reachable from the home page — so "a link that 404s" or "a page a guest
 * cannot open" is a launch blocker, which is why this is @p0.
 *
 * The page text itself is checked as data in
 * apps/users/lib/legal/legal-docs.test.ts; this file checks the pages render
 * and the routes and links work.
 */
import { devices, type Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'
import { SERVICES, VENDORS } from '../../support/seed-ids'

/**
 * apps/users/lib/legal/details.ts — LEGAL_DRAFT. While the pages are drafts
 * they carry a banner and a robots noindex; flip this with it.
 */
const LEGAL_DRAFT = true

/** apps/users/lib/legal/details.ts — BUSINESS.address and BUSINESS.email. */
const ADDRESS = 'No. 47, Radha Nagar Main Road, Chromepet, Chengalpattu, Tamil Nadu 600044'
const EMAIL = 'contact.scrubcars@gmail.com'

const DRAFT_BANNER = 'Draft for legal review — not yet in force'

/**
 * In CI the frontends are production builds (playwright.config.ts), which
 * must never render a reviewer note: the notes describe open product gaps
 * and show only under `next dev` (components/legal/legal-page.tsx).
 */
const PRODUCTION_BUILD = Boolean(process.env.CI)

/**
 * The five pages, retyped rather than imported, like every other spec: the
 * footer and Profile tests check the app renders exactly these, so taking
 * them from the array the app renders could not catch a wrong label. Keep in
 * step with apps/users/lib/legal/routes.ts (LEGAL_LINKS) and each page's
 * title in apps/users/lib/legal/<page>.ts.
 */
const PAGES = [
  { label: 'Terms of Use', href: '/terms', h1: 'Terms of Use' },
  { label: 'Privacy Policy', href: '/privacy', h1: 'Privacy Policy' },
  { label: 'Cancellation & Refunds', href: '/refund-policy', h1: 'Cancellation & Refund Policy' },
  { label: 'Service delivery', href: '/service-delivery', h1: 'Service Delivery Policy' },
  { label: 'Contact & grievances', href: '/contact', h1: 'Contact us' },
] as const

/** Where the address and support email are printed on every page: the footer. */
const footer = (page: Page) => page.getByRole('contentinfo')

test.describe('legal pages @p0', () => {
  for (const { href, h1 } of PAGES) {
    test(`${href} opens for a guest`, async ({ page }) => {
      const response = await page.goto(href)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`${href}$`))

      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1)
      await expect(page.getByText(/^Last updated:/)).toBeVisible()

      // Who runs Detlio and how to reach it, on every page (the footer).
      await expect(footer(page).getByText(ADDRESS)).toBeVisible()
      await expect(footer(page).getByRole('link', { name: EMAIL })).toBeVisible()

      // Canonical on detlio.com, whatever host served it.
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://detlio.com${href}`
      )

      if (PRODUCTION_BUILD) {
        await expect(page.locator('[data-reviewer-note]')).toHaveCount(0)
      }

      const robots = page.locator('meta[name="robots"]')
      if (LEGAL_DRAFT) {
        await expect(page.getByText(DRAFT_BANNER)).toBeVisible()
        await expect(robots).toHaveAttribute('content', /noindex/)
      } else {
        await expect(page.getByText(DRAFT_BANNER)).toHaveCount(0)
        await expect(page.locator('[data-reviewer-note]')).toHaveCount(0)
        await expect(robots).toHaveCount(0)
      }
    })
  }

  test('the Contact page names the business and the Grievance Officer', async ({ page }) => {
    await page.goto('/contact')
    const main = page.getByRole('main')

    await expect(main.getByText(ADDRESS).first()).toBeVisible()
    await expect(main.getByRole('link', { name: EMAIL }).first()).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Grievance Officer' })).toBeVisible()
    await expect(main.getByRole('link', { name: '+91 93444 34474' }).first()).toHaveAttribute(
      'href',
      /^tel:/
    )
    // An unconfirmed detail shows as a marker, never as a blank.
    if (LEGAL_DRAFT) {
      await expect(main.getByText(/\[to be confirmed: /).first()).toBeVisible()
    }
  })

  test('the long pages have a contents list that jumps to its section', async ({ page }) => {
    await page.goto('/refund-policy')
    const toc = page.getByRole('navigation', { name: 'On this page' })
    await toc.getByRole('link', { name: /How and when refunds are paid/ }).click()
    await expect(page).toHaveURL(/#how-refunds-work$/)
    await expect(
      page.getByRole('heading', { level: 2, name: /How and when refunds are paid/ })
    ).toBeInViewport()
  })

  test('the homepage footer links to all five', async ({ page }) => {
    await page.goto('/')
    const legal = footer(page).getByRole('navigation', { name: 'Legal' })

    for (const { label, href } of PAGES) {
      await expect(legal.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }

    // One followed for real: the rest share the route gate it goes through.
    await legal.getByRole('link', { name: 'Privacy Policy' }).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy Policy')
  })

  test('the sign-in screen links the Terms and the Privacy Policy in a new tab', async ({
    page,
    context,
  }) => {
    await page.goto('/login')
    // Typed first: opening a policy must not cost the customer their number.
    await page.locator('#sc-phone').fill('9876543210')

    const cases: Array<[string, string, RegExp]> = [
      ['Terms', 'Terms of Use', /\/terms$/],
      ['Privacy Policy', 'Privacy Policy', /\/privacy$/],
    ]
    for (const [name, title, url] of cases) {
      const link = page.getByRole('link', { name, exact: true })
      await expect(link).toHaveAttribute('target', '_blank')

      const [tab] = await Promise.all([context.waitForEvent('page'), link.click()])
      await tab.waitForLoadState()
      await expect(tab).toHaveURL(url)
      await expect(tab.getByRole('heading', { level: 1 })).toHaveText(title)
      await tab.close()
    }

    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('#sc-phone')).toHaveValue('9876543210')
  })

  test.describe('signed in', () => {
    // Read-only throughout: nothing here books, edits or pays.
    test.use({ storageState: asRole('customer-browse') })

    test('a signed-in customer reads the page rather than being redirected', async ({ page }) => {
      await page.goto('/terms')
      await expect(page).toHaveURL(/\/terms$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of Use')
    })

    test('checkout links the Terms and the refund policy in a new tab', async ({ page, context }) => {
      await page.goto(`/book/${VENDORS.main.id}?service=${SERVICES.wash.id}`)
      await page.getByRole('button', { name: /Tmrw/ }).click()
      const slot = page.getByRole('button', { name: /^\d{1,2}:\d{2}\s(AM|PM)$/ }).first()
      await slot.click()
      await expect(slot).toHaveAttribute('aria-pressed', 'true')

      const line = page.getByText(/By paying you agree to the/)
      await expect(line).toBeVisible()

      const cases: Array<[string, string]> = [
        ['Terms', 'Terms of Use'],
        ['Cancellation & Refund Policy', 'Cancellation & Refund Policy'],
      ]
      for (const [name, title] of cases) {
        const link = line.getByRole('link', { name, exact: true })
        await expect(link).toHaveAttribute('target', '_blank')

        const [tab] = await Promise.all([context.waitForEvent('page'), link.click()])
        await tab.waitForLoadState()
        await expect(tab.getByRole('heading', { level: 1 })).toHaveText(title)
        await tab.close()
      }

      // The checkout is where the customer left it: same page, slot still picked.
      await expect(page).toHaveURL(new RegExp(`/book/${VENDORS.main.id}`))
      await expect(slot).toHaveAttribute('aria-pressed', 'true')
    })

    test('Profile has a Legal group with all five', async ({ page }) => {
      await page.goto('/profile')
      const legal = page.getByRole('region', { name: 'Legal' })
      for (const { label, href } of PAGES) {
        await expect(legal.getByRole('link', { name: label })).toHaveAttribute('href', href)
      }
      await legal.getByRole('link', { name: 'Contact & grievances' }).click()
      await expect(page).toHaveURL(/\/contact$/)
    })
  })
})

/**
 * 390px — an iPhone 12–15 — the width the pages are designed at. Sized at
 * creation, for the reason given in platform/accessibility.spec.ts: resizing
 * a Pixel 7 page after the fact drops mobile emulation and a desktop
 * scrollbar takes layout space.
 */
test.describe('legal pages on a phone @p0', () => {
  test('no page scrolls sideways at 390px', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 800 },
    })
    await blockThirdParties(context)
    await dismissLocationPrompt(context)
    const page = await context.newPage()

    for (const { href } of PAGES) {
      await page.goto(href)
      await page.getByRole('heading', { level: 1 }).waitFor()

      const { overflow, offenders } = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth
        const offenders: string[] = []
        for (const element of Array.from(document.querySelectorAll('*'))) {
          // A phone-width table's header row is visually hidden (clipped to
          // 1px, not removed) and would be listed as overflowing when it is not.
          if (element.closest('thead')) continue
          const rect = element.getBoundingClientRect()
          if (rect.width === 0) continue
          if (rect.right > limit + 0.5 || rect.left < -0.5) {
            offenders.push(`${element.tagName}.${String((element as HTMLElement).className || '').slice(0, 60)}`)
          }
        }
        return {
          overflow: document.documentElement.scrollWidth - limit,
          offenders: offenders.slice(0, 6),
        }
      })

      expect(
        overflow,
        `${href} overflows by ${overflow}px:\n  ${offenders.join('\n  ')}`
      ).toBeLessThanOrEqual(1)
    }

    await context.close()
  })
})
