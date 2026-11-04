/**
 * The public page for deleting an account and its data (/delete-account):
 * the link Google Play and the App Store listings point to. It must open
 * without the app and without signing in, be indexable even while the legal
 * pages are drafts, and say how, in the words of the code it describes.
 *
 * The page text is checked as data in apps/users/lib/legal/legal-docs.test.ts
 * (including that it lists every reason the server can refuse a deletion);
 * this file checks the route, the links to it, and the page in a browser.
 * The deletion itself is account-delete.spec.ts (customer) and
 * vendors/account-and-requests.spec.ts (garage staff).
 */
import { devices, type Page } from '@playwright/test'
import { answerCookieQuestion } from '../../support/consent'
import { test, expect } from '../../support/fixtures'
import { blockThirdParties, dismissLocationPrompt } from '../../support/network'

const PATH = '/delete-account'
const TITLE = 'Delete your Detlio account'

/** apps/users/lib/legal/details.ts — BUSINESS.phone (also @repo/core/support). */
const PHONE = '+91 93444 34474'

const DRAFT_BANNER = 'Draft for legal review — not yet in force'

const main = (page: Page) => page.getByRole('main')

test.describe('delete-account page @p0', () => {
  test('opens for a guest, static, with the apps and the business named', async ({ page }) => {
    const response = await page.goto(PATH)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`${PATH}$`))

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
    await expect(page.getByText(/^Last updated:/)).toBeVisible()

    // Both apps, as the stores list them, and who runs them.
    await expect(main(page).getByText('Detlio for Garages').first()).toBeVisible()
    await expect(main(page).getByText(/Detlio is a brand of ScrubCars/)).toBeVisible()

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://detlio.com${PATH}`
    )
  })

  test('is indexable and carries no draft banner, whatever the legal pages say', async ({ page }) => {
    await page.goto(PATH)
    // No robots meta at all (the draft pages say noindex), no "not in force".
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await expect(page.getByText(DRAFT_BANNER)).toHaveCount(0)
    await expect(page.getByText(/^In force from:/)).toHaveCount(0)
    await expect(page.locator('[data-reviewer-note]')).toHaveCount(0)

    const sitemap = await (await page.request.get('/sitemap.xml')).text()
    expect(sitemap).toContain(`<loc>https://detlio.com${PATH}</loc>`)
  })

  test('tells a customer how to delete it in the app, with what goes and what stays', async ({ page }) => {
    await page.goto(PATH)
    const customers = page.getByRole('region', {
      name: 'Customers: delete it yourself in Detlio',
    })
    await expect(customers.getByText('Profile', { exact: true })).toBeVisible()
    await expect(customers.getByText('Delete account', { exact: true })).toBeVisible()
    await expect(customers.getByText('DELETE', { exact: true })).toBeVisible()
    await expect(customers.getByText('Delete my account', { exact: true })).toBeVisible()

    const kept = page.getByRole('region', { name: 'What is deleted, and what we keep' })
    await expect(kept.getByText('Your name, phone number, email and profile photo')).toBeVisible()
    await expect(kept.getByText(/Your reviews, shown as "Former customer"/)).toBeVisible()
    await expect(kept.getByText(/money records, which the law makes us keep/)).toBeVisible()

    const first = page.getByRole('region', { name: 'Finish these first' })
    await expect(first.getByRole('listitem')).toHaveCount(7)
    await expect(first.getByText(/A booking is still open/)).toBeVisible()
    await expect(first.getByText(/You own a garage on Detlio/)).toBeVisible()
  })

  test('without the app: the phone, WhatsApp and email, from the registered number', async ({ page }) => {
    await page.goto(PATH)
    const ask = page.getByRole('region', { name: 'Without the app: ask us' })
    await expect(ask.getByText('the mobile number you signed up with')).toBeVisible()
    await expect(ask.getByRole('link', { name: PHONE })).toHaveAttribute('href', /^tel:/)
    await expect(ask.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\//
    )
    await expect(ask.getByRole('link', { name: /@gmail\.com$/ })).toHaveAttribute('href', /^mailto:/)
    await expect(ask.getByText(/We reply within one month at most/)).toBeVisible()

    // The contact page it points to, followed for real.
    await ask.getByRole('link', { name: 'Contact & Grievances' }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact us')
  })

  test('covers garage staff and owners: Delete my account, Leave this garage, Close my garage', async ({ page }) => {
    await page.goto(PATH)
    const garages = page.getByRole('region', { name: 'Garage staff and owners (Detlio for Garages)' })
    await expect(garages.getByText('Your account', { exact: true })).toBeVisible()
    await expect(garages.getByText('Delete my account', { exact: true })).toBeVisible()
    await expect(garages.getByText('Leave this garage', { exact: true })).toBeVisible()
    await expect(garages.getByText('Close my garage', { exact: true })).toBeVisible()
    await expect(garages.getByText('Send request', { exact: true })).toBeVisible()
  })

  test('the Privacy Policy links to it, and the link works', async ({ page }) => {
    await page.goto('/privacy')
    const link = main(page).getByRole('link', { name: 'How to delete your account', exact: true })
    await expect(link).toHaveAttribute('href', PATH)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${PATH}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
  })

  test('the landing page footer links to it', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('navigation', { name: 'Footer' })
    const link = footer.getByRole('link', { name: 'Delete your account' })
    await expect(link).toHaveAttribute('href', PATH)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${PATH}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
  })

  test('the footer on every legal page and /about links to it', async ({ page }) => {
    for (const from of ['/about', '/terms', PATH]) {
      await page.goto(from)
      const legal = page.getByRole('contentinfo').getByRole('navigation', { name: 'Legal' })
      await expect(legal.getByRole('link', { name: 'Delete your account' })).toHaveAttribute('href', PATH)
    }
    await page.goto('/about')
    await page
      .getByRole('contentinfo')
      .getByRole('navigation', { name: 'Legal' })
      .getByRole('link', { name: 'Delete your account' })
      .click()
    await expect(page).toHaveURL(new RegExp(`${PATH}$`))
  })
})

test.describe('delete-account page on a phone @p0', () => {
  test('does not scroll sideways at 390px', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 800 },
    })
    await answerCookieQuestion(context)
    await blockThirdParties(context)
    await dismissLocationPrompt(context)
    const page = await context.newPage()

    await page.goto(PATH)
    await page.getByRole('heading', { level: 1 }).waitFor()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow, `${PATH} overflows by ${overflow}px`).toBeLessThanOrEqual(1)

    await context.close()
  })
})
