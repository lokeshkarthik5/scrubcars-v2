import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'

/** apps/users/components/providers/signed-in-landing.ts — SIGNED_IN_HINT_KEY */
const SIGNED_IN_HINT_KEY = 'detlio:signed-in'

/** The landing page's garage cards (data-garage-card on each). */
const cards = (page: Page) => page.locator('main [data-garage-card]')

/** "~4.1 km · ~15 min" → 4.1; "~400 m · ~5 min" → 0.4. */
function km(text: string): number {
  const match = /([\d.]+)\s*(km|m)\b/.exec(text)
  if (!match) throw new Error(`No distance in "${text}"`)
  return match[2] === 'm' ? Number(match[1]) / 1000 : Number(match[1])
}

test.describe('the landing page is the app (0062) @p0', () => {
  test('a guest gets garages and prices on the first screen, in the HTML, with no fade-in', async ({ page }) => {
    // Server-rendered: the headline and the area chips are in the HTML. (Its
    // first page of garages is too, once the page has been rendered with the
    // API up; the E2E build has none to reach, so the list loads in the
    // browser here, and that is what is checked below.)
    const html = await (await page.request.get('/')).text()
    expect(html).toContain('Where&#x27;s your car?')
    expect(html).toContain('Car wash &amp; detailing near you')

    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Car wash & detailing near you, today.')
    await expect(page.getByText('Real prices from Chennai garages. Book in 1 minute.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')

    // Real garages with prices, and the cards are not waiting on an animation.
    await expect(cards(page).first()).toBeVisible()
    await expect(cards(page).first().getByText(/From ₹\d/)).toBeVisible()
    await expect(page.locator('main .reveal')).toHaveCount(0)
    // Nor the route's own fade-in (app/template.tsx), on this page only.
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('.page-enter')!).animationName)
    ).toBe('none')
    await expect(page.locator('[data-marketing-home]')).toHaveCount(0)

    // Where's your car: Near me, the seven priority areas, More.
    const chips = page.getByRole('region', { name: "Where's your car?" })
    await expect(chips.getByRole('button', { name: 'Near me' })).toBeVisible()
    for (const name of ['Adyar', 'Nungambakkam', 'Anna Nagar', 'Sholinganallur', 'Navalur', 'Guindy', 'T Nagar']) {
      await expect(chips.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(chips.getByRole('button', { name: 'More' })).toBeVisible()

    // Placeholder reviews and videos are for preview builds only.
    await expect(page.getByText('Sample', { exact: true })).toHaveCount(0)
  })

  test('an area chip sorts the list by distance from it, with km and drive time on every card', async ({ page }) => {
    await page.goto('/')
    const chip = page.getByRole('button', { name: 'Nungambakkam', exact: true })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Nearest first from Nungambakkam')).toBeVisible()

    const distances = page.locator('main [data-garage-card] [data-distance]')
    await expect(distances.first()).toHaveText(/^~[\d.]+ (km|m) · ~\d+ (min|h)/)
    const texts = (await distances.allTextContents()).slice(0, 8)
    expect(texts.length).toBeGreaterThan(1)
    const values = texts.map(km)
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  test('More opens every area with a search; picking one sets it at once', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'More' }).click()

    const sheet = page.getByRole('dialog', { name: "Where's your car?" })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('list', { name: 'Areas' }).getByRole('button')).toHaveCount(25)
    await sheet.getByRole('searchbox', { name: 'Search areas' }).fill('vela')
    await expect(sheet.getByRole('list', { name: 'Areas' }).getByRole('button')).toHaveCount(1)
    await sheet.getByRole('button', { name: 'Velachery' }).click()

    await expect(sheet).toBeHidden()
    // Not a priority area, so it is named on the More chip.
    await expect(page.getByRole('button', { name: 'Velachery' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Nearest first from Velachery')).toBeVisible()
  })

  test('the footer: About, How it works and FAQ on /about, Terms and Privacy', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('navigation', { name: 'Footer' })
    await expect(footer.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    await expect(footer.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/about#how-it-works')
    await expect(footer.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/about#faq')
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')

    await footer.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/about#how-it-works$/)
    await expect(page.locator('#how-it-works')).toBeAttached()
  })

  test('the sitemap and robots name the landing page and /about', async ({ page }) => {
    const sitemap = await (await page.request.get('/sitemap.xml')).text()
    expect(sitemap).toContain('<loc>https://detlio.com/</loc>')
    expect(sitemap).toContain('<loc>https://detlio.com/about</loc>')
    const robots = await (await page.request.get('/robots.txt')).text()
    expect(robots).toContain('Sitemap: https://detlio.com/sitemap.xml')
  })

  test('a stale signed-in hint costs a guest one detour, then clears', async ({
    page,
  }) => {
    // Any page will do to reach the origin's storage. Wait for it to render:
    // AppProvider renders /garages only once the session has resolved, and
    // the hint write must land after its own clear, not race it.
    await page.goto('/garages')
    await expect(
      page.getByRole('heading', { name: 'Nearby Garages' })
    ).toBeVisible()
    await page.evaluate(
      (key) => window.localStorage.setItem(key, '1'),
      SIGNED_IN_HINT_KEY
    )

    await page.goto('/')
    // The hint only ever points at /home, which is public — never at a
    // guarded route that would strand a signed-out visitor on /login. The
    // hub sends a signed-out visitor on to the list of garages.
    await expect(page).toHaveURL(/\/(home|garages)$/)
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          SIGNED_IN_HINT_KEY
        )
      )
      .toBeNull()

    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test.describe('signed in', () => {
    test.use({ storageState: asRole('customer-book') })

    test('a customer is sent on to the app', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL(/\/home/)
    })

    test('…but can read /about, which never redirects', async ({ page }) => {
      await page.goto('/about')
      await expect(page).toHaveURL(/\/about$/)
      await expect(page.locator('[data-marketing-home]')).toBeVisible()
    })
  })
})

test.describe('the marketing page, kept at /about @p0', () => {
  test('renders the old homepage whole, indexed, and its calls to action still work', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator('[data-marketing-home]')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://detlio.com/about')
    await expect(page.getByText('Sample', { exact: true })).toHaveCount(0)

    // "Book on the web today" (the app showcase) means the list of garages.
    const web = page.locator('#app').getByRole('link', { name: /Book on the web/ })
    await expect(web).toHaveAttribute('href', '/garages')

    // "Book a service" too.
    await page.getByRole('link', { name: /Book a service/ }).first().click()
    await expect(page).toHaveURL(/\/garages$/)
    await expect(page.getByRole('heading', { name: 'Nearby Garages' })).toBeVisible()
  })

  test('the app showcase link opens the garage list', async ({ page }) => {
    await page.goto('/about#app')
    await page.locator('#app').getByRole('link', { name: /Book on the web/ }).click()
    await expect(page).toHaveURL(/\/garages$/)
  })
})
