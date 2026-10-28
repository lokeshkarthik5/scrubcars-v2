/**
 * The cookie question and what it lets load: Microsoft Clarity and the Meta
 * Pixel, one answer for both (0061).
 *
 * Every other spec starts with the question answered "Only essential"
 * (support/consent.ts). Here a visitor arrives without an answer: the bar
 * asks, "Only essential" keeps Microsoft's and Meta's code off the page,
 * "Allow" puts both on (the requests themselves are still blocked,
 * blockThirdParties, so only the script tags, `window.clarity` and
 * `window.fbq` are looked for), the answer survives a reload, and Cookie
 * settings asks again. The first banner's marketing-only answer keeps the
 * Pixel but not Clarity, and is asked again; a team device
 * (?team-device=1) is never asked and loads neither.
 *
 * Clarity loads only with a project id: the E2E builds have a made-up one
 * (NEXT_PUBLIC_CLARITY_ID in .env.e2e and the CI build step).
 */
import AxeBuilder from '@axe-core/playwright'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { CONSENT_COOKIE_NAME } from '../../support/consent'
import { GaragePage } from '../../pages/garage.page'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ answerCookies: false, storageState: { cookies: [], origins: [] } })

const FBEVENTS = 'script[src*="connect.facebook.net"][src*="fbevents.js"]'
const CLARITY = 'script[src^="https://www.clarity.ms/tag/"]'

const banner = (page: Page) =>
  page.getByRole('region', { name: 'Cookie choice' })

async function consentCookie(context: BrowserContext) {
  const cookies = await context.cookies()
  return cookies.find((cookie) => cookie.name === CONSENT_COOKIE_NAME)?.value
}

const hasFbq = (page: Page) =>
  page.evaluate(
    () => typeof (window as unknown as { fbq?: unknown }).fbq === 'function'
  )

const hasClarity = (page: Page) =>
  page.evaluate(
    () =>
      typeof (window as unknown as { clarity?: unknown }).clarity === 'function'
  )

/** Long enough for the Pixel to have loaded if it were going to: the page loaded, the browser idle. */
async function pageSettled(page: Page) {
  await page.waitForLoadState('load')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestIdleCallback(() => setTimeout(resolve, 300))
      )
  )
}

test.describe('cookie question @p0', () => {
  test('asks a visitor without an answer, and passes axe', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await expect(banner(page)).toContainText(
      'We use cookies to see how our site is used (Microsoft Clarity) and to measure our ads on Facebook and Instagram. Allow analytics and marketing cookies?'
    )
    await expect(
      banner(page).getByRole('link', { name: 'Privacy policy' })
    ).toHaveAttribute('href', '/privacy#meta')
    await expect(
      banner(page).getByRole('button', { name: 'Allow' })
    ).toBeVisible()
    await expect(
      banner(page).getByRole('button', { name: 'Only essential' })
    ).toBeVisible()

    // Nothing from Meta or Microsoft before an answer.
    await pageSettled(page)
    await expect(page.locator(FBEVENTS)).toHaveCount(0)
    expect(await hasFbq(page)).toBe(false)
    await expect(page.locator(CLARITY)).toHaveCount(0)
    expect(await hasClarity(page)).toBe(false)
    expect(await consentCookie(context)).toBeUndefined()

    const results = await new AxeBuilder({ page })
      .include('[data-consent-banner]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    )
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    ).toEqual([])
  })

  test('"Only essential" closes it, keeps the answer, and Meta and Clarity stay off', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Only essential' }).click()
    await expect(banner(page)).toBeHidden()
    expect(await consentCookie(context)).toBe('essential')

    await pageSettled(page)
    await expect(page.locator(FBEVENTS)).toHaveCount(0)
    expect(await hasFbq(page)).toBe(false)
    await expect(page.locator(CLARITY)).toHaveCount(0)
    expect(await hasClarity(page)).toBe(false)

    // The answer holds on the next load, and on another page.
    await page.reload()
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Privacy Policy'
    )
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(page.locator(FBEVENTS)).toHaveCount(0)
    await expect(page.locator(CLARITY)).toHaveCount(0)
  })

  test('"Allow" keeps the answer and puts Clarity and the Pixel on the page', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Allow' }).click()
    await expect(banner(page)).toBeHidden()
    expect(await consentCookie(context)).toBe('all')

    // Mid-visit: no reload needed.
    await expect.poll(() => hasFbq(page)).toBe(true)
    await expect(page.locator(FBEVENTS)).toHaveCount(1)
    await expect.poll(() => hasClarity(page)).toBe(true)
    await expect(page.locator(CLARITY)).toHaveCount(1)
    await expect(page.locator(CLARITY)).toHaveAttribute(
      'src',
      'https://www.clarity.ms/tag/e2eclarity01'
    )

    // And after a reload, without asking again.
    await page.reload()
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(page.locator(FBEVENTS)).toHaveCount(1)
    expect(await hasFbq(page)).toBe(true)
    await expect(page.locator(CLARITY)).toHaveCount(1)
  })

  test('the first banner\'s "marketing" answer keeps the Pixel, not Clarity, and is asked again', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: CONSENT_COOKIE_NAME,
        value: 'marketing',
        domain: 'localhost',
        path: '/',
      },
    ])
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await expect.poll(() => hasFbq(page)).toBe(true)
    await pageSettled(page)
    await expect(page.locator(CLARITY)).toHaveCount(0)
    expect(await hasClarity(page)).toBe(false)

    await banner(page).getByRole('button', { name: 'Allow' }).click()
    expect(await consentCookie(context)).toBe('all')
    await expect.poll(() => hasClarity(page)).toBe(true)
  })

  test('a team device is never asked and loads neither, whatever the cookie says', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: CONSENT_COOKIE_NAME, value: 'all', domain: 'localhost', path: '/' },
    ])
    await page.goto('/?team-device=1')
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    expect(await hasFbq(page)).toBe(false)
    expect(await hasClarity(page)).toBe(false)
    expect(
      await page.evaluate(() => localStorage.getItem('detlio:team-device'))
    ).toBe('1')

    // It sticks without the parameter, and Cookie settings says why.
    await page.goto('/privacy')
    await pageSettled(page)
    expect(await hasFbq(page)).toBe(false)
    await page
      .getByRole('contentinfo')
      .getByRole('button', { name: 'Cookie settings' })
      .click()
    await expect(banner(page)).toContainText('This is a team device')
    await banner(page).getByRole('button', { name: 'OK' }).click()
    await expect(banner(page)).toBeHidden()

    // ?team-device=0 clears it.
    await page.goto('/?team-device=0')
    await expect.poll(() => hasClarity(page)).toBe(true)
    expect(
      await page.evaluate(() => localStorage.getItem('detlio:team-device'))
    ).toBeNull()
  })

  test('Cookie settings asks again, and the new answer replaces the old', async ({
    page,
    context,
  }) => {
    await page.goto('/privacy')
    await banner(page).getByRole('button', { name: 'Only essential' }).click()
    await expect(banner(page)).toBeHidden()

    await page
      .getByRole('contentinfo')
      .getByRole('button', { name: 'Cookie settings' })
      .click()
    await expect(banner(page)).toBeVisible()
    await expect(banner(page)).toBeFocused()

    await banner(page).getByRole('button', { name: 'Allow' }).click()
    await expect(banner(page)).toBeHidden()
    expect(await consentCookie(context)).toBe('all')
    await expect.poll(() => hasFbq(page)).toBe(true)
    await expect.poll(() => hasClarity(page)).toBe(true)
  })

  test('is not asked on a page the Pixel and Clarity stay off', async ({
    page,
  }) => {
    // A shared certificate's page: its address holds the token.
    await page.goto('/verify/not-a-real-token')
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    // A friend's invite: its address holds the code (0061).
    await page.goto('/invite/NOTAREALCODE')
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(page.locator(CLARITY)).toHaveCount(0)
  })
})

test.describe('cookie question and sheets @p0', () => {
  // A browsing customer whose saved state carries no answer yet.
  test.use({ storageState: asRole('customer-browse') })

  test('steps out of sight while a sheet is open, keeping its place', async ({
    page,
    context,
  }) => {
    await context.clearCookies({ name: CONSENT_COOKIE_NAME })
    const garage = new GaragePage(page)
    await garage.goto(VENDORS.main.id)
    await expect(banner(page)).toBeVisible()

    // The page sits in its own stacking context (the route's fade-in), so
    // the bar would otherwise draw over the top of the sheet.
    await garage.openDetails(SERVICES.wash.name)
    const sheet = page.getByRole('dialog', {
      name: `${SERVICES.wash.name} details`,
    })
    await expect(sheet).toBeVisible()
    await expect(banner(page)).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(banner(page)).toBeVisible()
    expect(await consentCookie(context)).toBeUndefined()
  })
})
