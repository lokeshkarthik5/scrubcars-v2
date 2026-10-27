/**
 * The cookie question and the Meta Pixel behind it.
 *
 * Every other spec starts with the question answered "Only essential"
 * (support/consent.ts). Here a visitor arrives without an answer: the bar
 * asks, "Only essential" keeps Meta's code off the page, "Allow" puts it on
 * (the request itself is still blocked, blockThirdParties, so only the
 * script tag and `window.fbq` are looked for), the answer survives a reload,
 * and Cookie settings asks again.
 */
import AxeBuilder from '@axe-core/playwright'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { CONSENT_COOKIE_NAME } from '../../support/consent'

test.use({ answerCookies: false, storageState: { cookies: [], origins: [] } })

const FBEVENTS = 'script[src*="connect.facebook.net"][src*="fbevents.js"]'

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
      'We use cookies to measure our ads on Facebook and Instagram. Allow marketing cookies?'
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

    // Nothing from Meta before an answer.
    await pageSettled(page)
    await expect(page.locator(FBEVENTS)).toHaveCount(0)
    expect(await hasFbq(page)).toBe(false)
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

  test('"Only essential" closes it, keeps the answer, and Meta stays off', async ({
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

    // The answer holds on the next load, and on another page.
    await page.reload()
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Privacy Policy'
    )
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(page.locator(FBEVENTS)).toHaveCount(0)
  })

  test('"Allow" keeps the answer and puts the Pixel on the page', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Allow' }).click()
    await expect(banner(page)).toBeHidden()
    expect(await consentCookie(context)).toBe('marketing')

    // Mid-visit: no reload needed.
    await expect.poll(() => hasFbq(page)).toBe(true)
    await expect(page.locator(FBEVENTS)).toHaveCount(1)

    // And after a reload, without asking again.
    await page.reload()
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(page.locator(FBEVENTS)).toHaveCount(1)
    expect(await hasFbq(page)).toBe(true)
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
    expect(await consentCookie(context)).toBe('marketing')
    await expect.poll(() => hasFbq(page)).toBe(true)
  })

  test('is not asked on a page the Pixel stays off', async ({ page }) => {
    // A shared certificate's page: its address holds the token.
    await page.goto('/verify/not-a-real-token')
    await pageSettled(page)
    await expect(banner(page)).toHaveCount(0)
  })
})
